"""
Signal trigger evaluator.

Reads normalised market events from Redis pub/sub channels, maintains
per-instrument market state in memory, evaluates all active signal setups
loaded from the database, and fires ``signal:triggered`` events back to Redis
when conditions are met.

Redis channels consumed
-----------------------
    market:ticks            — trade tick events
    market:orderbook        — order-book snapshot events
    market:cvd_update       — pre-computed CVD/delta updates
    market:sweep_detected   — sweep events emitted by the ingestor pipeline

Redis channel produced
----------------------
    signal:triggered        — fired when a setup condition is met

Trigger types supported
-----------------------
    cvd_cross               — CVD crosses a signed threshold in a direction
    bid_ask_imbalance       — top-N imbalance ratio crosses a threshold
    large_print             — a single print exceeds a notional threshold
    sweep                   — a sweep event meets notional/trade-count criteria

Cooldown
--------
A Redis key ``signal:cooldown:<setup_id>:<instrument>`` is set with a TTL
equal to ``cooldown_minutes * 60`` seconds after a trigger fires.  While the
key exists, further triggers for the same (setup, instrument) pair are
suppressed.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from typing import Any, Dict, List, Optional

import httpx
import redis.asyncio as aioredis
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
CHANNEL_TICKS = "market:ticks"
CHANNEL_ORDERBOOK = "market:orderbook"
CHANNEL_CVD = "market:cvd_update"
CHANNEL_SWEEP = "market:sweep_detected"
CHANNEL_LARGE_PRINT = "market:large_print"

CHANNEL_TRIGGERED = "signal:triggered"

# How long (seconds) to cache active setups from the DB before re-fetching.
SETUP_CACHE_TTL = 5.0

# Default cooldown if a setup does not specify one (minutes).
DEFAULT_COOLDOWN_MINUTES = 5


# ---------------------------------------------------------------------------
# Trigger evaluation logic
# ---------------------------------------------------------------------------
async def evaluate_trigger(
    trigger_config: Dict[str, Any],
    market_state: Dict[str, Any],
) -> bool:
    """
    Return ``True`` if the trigger condition encoded in *trigger_config* is
    satisfied by the current *market_state*.

    Parameters
    ----------
    trigger_config:
        A dict with at least ``"type"`` (str) and ``"params"`` (dict).
    market_state:
        Per-instrument snapshot containing:

        ============  ==================================================
        cvd           Cumulative Volume Delta (running total)
        delta         Delta of the most-recent bar / update
        bid_volume    Aggregated bid volume (top-N levels)
        ask_volume    Aggregated ask volume (top-N levels)
        imbalance_ratio
                      bid_vol / ask_vol or ask_vol / bid_vol (always >= 1)
        dominant_side 'buy' | 'sell'
        last_price    Last traded price
        recent_sweeps List of recent SweepEvent-like dicts
        recent_absorptions
                      List of recent absorption-detection dicts (future use)
        ============  ==================================================

    Returns
    -------
    bool
    """
    trigger_type: str = trigger_config.get("type", "")
    params: Dict[str, Any] = trigger_config.get("params", {})

    # ------------------------------------------------------------------
    # cvd_cross — CVD crosses a signed level in a given direction
    # ------------------------------------------------------------------
    if trigger_type == "cvd_cross":
        threshold: float = float(params.get("threshold", 0))
        direction: str = params.get("direction", "up")
        cvd: float = float(market_state.get("cvd", 0))
        if direction == "up":
            return cvd >= threshold
        if direction == "down":
            return cvd <= -abs(threshold)
        return False

    # ------------------------------------------------------------------
    # bid_ask_imbalance — imbalance ratio and dominant side
    # ------------------------------------------------------------------
    if trigger_type == "bid_ask_imbalance":
        required_ratio: float = float(params.get("ratio", 3.0))
        required_side: str = params.get("direction", "bid")  # 'bid' | 'ask'
        # Map 'bid'→'buy' and 'ask'→'sell' to match market_state convention.
        dom_side_map = {"bid": "buy", "ask": "sell"}
        expected_dominant = dom_side_map.get(required_side, required_side)

        actual_ratio: float = float(market_state.get("imbalance_ratio", 1.0))
        actual_dominant: str = market_state.get("dominant_side", "")
        return actual_ratio >= required_ratio and actual_dominant == expected_dominant

    # ------------------------------------------------------------------
    # large_print — a single print >= notional threshold was observed
    # ------------------------------------------------------------------
    if trigger_type == "large_print":
        min_notional: float = float(params.get("min_notional_usd", 500_000))
        recent_sweeps: list = market_state.get("recent_sweeps", [])
        # Large prints are stored as sweep-like dicts with trade_count == 1
        # (or in a dedicated field if the pipeline separates them).
        large_prints: list = market_state.get("recent_large_prints", [])
        for lp in large_prints:
            if float(lp.get("notional_usd", 0)) >= min_notional:
                return True
        # Fallback: sweep events with a single trade also qualify.
        for sw in recent_sweeps:
            if sw.get("trade_count", 0) == 1 and float(sw.get("notional_usd", 0)) >= min_notional:
                return True
        return False

    # ------------------------------------------------------------------
    # sweep — a sweep event meeting notional + min_trades criteria
    # ------------------------------------------------------------------
    if trigger_type == "sweep":
        min_notional_sw: float = float(params.get("min_notional_usd", 100_000))
        min_trades: int = int(params.get("min_trades", 3))
        recent_sweeps_sw: list = market_state.get("recent_sweeps", [])
        for sw in recent_sweeps_sw:
            if (
                float(sw.get("notional_usd", 0)) >= min_notional_sw
                and int(sw.get("trade_count", 0)) >= min_trades
            ):
                return True
        return False

    # ------------------------------------------------------------------
    # sweep_with_absorption — a sweep where price reverted within a short
    # window (the aggressor sweep was absorbed by passive book / iceberg).
    # Heuristic: most recent sweep occurred ≤ window_secs ago, AND last_price
    # moved against the sweep side by at least revert_frac of the swept range.
    # ------------------------------------------------------------------
    if trigger_type == "sweep_with_absorption":
        window_secs: float = float(params.get("window_secs", 5.0))
        revert_frac: float = float(params.get("revert_frac", 0.5))
        min_notional_sa: float = float(params.get("min_notional_usd", 100_000))
        recent_sweeps_sa: list = market_state.get("recent_sweeps", [])
        if not recent_sweeps_sa:
            return False
        sw = recent_sweeps_sa[-1]
        sw_ts_ms = int(sw.get("ts") or 0)
        age = time.time() - (sw_ts_ms / 1000.0) if sw_ts_ms else float("inf")
        if age > window_secs:
            return False
        if float(sw.get("notional_usd", 0)) < min_notional_sa:
            return False
        side = sw.get("side")
        price_start = float(sw.get("price_start") or 0.0)
        price_end = float(sw.get("price_end") or 0.0)
        now_price = float(market_state.get("last_price") or 0.0)
        if price_start <= 0.0 or price_end <= 0.0 or now_price <= 0.0:
            return False
        sweep_range = abs(price_end - price_start)
        if sweep_range <= 0.0:
            return False
        revert = price_end - now_price if side == "buy" else now_price - price_end
        # Positive revert = price gave back the sweep direction.
        return revert >= sweep_range * revert_frac

    # ------------------------------------------------------------------
    # delta_exhaustion — earlier window's |delta| materially exceeds the
    # latest's, with consistent sign throughout. Signals a fading impulse.
    # ------------------------------------------------------------------
    if trigger_type == "delta_exhaustion":
        min_samples: int = int(params.get("min_samples", 6))
        ratio: float = float(params.get("decay_ratio", 2.0))
        deltas: list = market_state.get("recent_deltas", [])
        if len(deltas) < min_samples:
            return False
        half = len(deltas) // 2
        earlier = deltas[:half]
        later = deltas[half:]
        if not earlier or not later:
            return False
        early_abs = sum(abs(float(d)) for d in earlier) / len(earlier)
        late_abs  = sum(abs(float(d)) for d in later)  / len(later)
        same_sign = all(float(d) > 0 for d in deltas) or all(float(d) < 0 for d in deltas)
        return bool(same_sign and late_abs > 0 and early_abs >= late_abs * ratio)

    # ------------------------------------------------------------------
    # Unknown trigger type — log and return False
    # ------------------------------------------------------------------
    logger.warning("Unknown trigger type: %r", trigger_type)
    return False


# ---------------------------------------------------------------------------
# Market state manager
# ---------------------------------------------------------------------------
class _MarketStateStore:
    """
    Thin in-memory store that merges incremental market events into a
    per-instrument state dict consumed by :func:`evaluate_trigger`.
    """

    # Maximum number of recent sweep / large-print events to retain per
    # instrument (avoids unbounded memory growth).
    MAX_RECENT = 20

    def __init__(self) -> None:
        # instrument → state dict
        self._state: Dict[str, Dict[str, Any]] = {}

    def _ensure(self, instrument: str) -> Dict[str, Any]:
        if instrument not in self._state:
            self._state[instrument] = {
                "cvd": 0.0,
                "delta": 0.0,
                "bid_volume": 0.0,
                "ask_volume": 0.0,
                "imbalance_ratio": 1.0,
                "dominant_side": "buy",
                "last_price": 0.0,
                "recent_sweeps": [],
                "recent_large_prints": [],
                "recent_absorptions": [],
                # Rolling buffer of signed delta_60s values for the
                # delta_exhaustion trigger. Bounded by MAX_RECENT.
                "recent_deltas": [],
            }
        return self._state[instrument]

    def apply_tick(self, msg: Dict[str, Any]) -> str:
        """Update last_price from a tick message.  Returns instrument."""
        instrument: str = msg.get("instrument", "")
        state = self._ensure(instrument)
        price = msg.get("price")
        if price is not None:
            state["last_price"] = float(price)
        return instrument

    def apply_orderbook(self, msg: Dict[str, Any]) -> str:
        """Update bid/ask volumes and imbalance from an order-book message."""
        instrument: str = msg.get("instrument", "")
        state = self._ensure(instrument)

        bids: list = msg.get("bids", [])
        asks: list = msg.get("asks", [])

        bid_vol = sum(float(level[1]) for level in bids[:10])
        ask_vol = sum(float(level[1]) for level in asks[:10])

        state["bid_volume"] = bid_vol
        state["ask_volume"] = ask_vol

        if bid_vol >= ask_vol:
            ratio = (bid_vol / ask_vol) if ask_vol > 0 else float("inf")
            state["dominant_side"] = "buy"
        else:
            ratio = (ask_vol / bid_vol) if bid_vol > 0 else float("inf")
            state["dominant_side"] = "sell"
        state["imbalance_ratio"] = ratio

        return instrument

    def apply_cvd_update(self, msg: Dict[str, Any]) -> str:
        """Merge a CVD update message (from an upstream analytics worker)."""
        instrument: str = msg.get("instrument", "")
        state = self._ensure(instrument)
        if "cvd" in msg:
            state["cvd"] = float(msg["cvd"])
        if "delta" in msg:
            state["delta"] = float(msg["delta"])
        # Track delta_60s for the delta_exhaustion trigger. Cap at MAX_RECENT
        # so we never grow unbounded under bursty traffic.
        d60 = msg.get("delta_60s")
        if isinstance(d60, (int, float)):
            buf = state.setdefault("recent_deltas", [])
            buf.append(float(d60))
            if len(buf) > self.MAX_RECENT:
                state["recent_deltas"] = buf[-self.MAX_RECENT :]
        return instrument

    def apply_sweep(self, msg: Dict[str, Any]) -> str:
        """Append a sweep event to the recent-sweeps ring buffer."""
        instrument: str = msg.get("instrument", "")
        state = self._ensure(instrument)
        state["recent_sweeps"].append(msg)
        # Keep only the most recent MAX_RECENT events.
        if len(state["recent_sweeps"]) > self.MAX_RECENT:
            state["recent_sweeps"] = state["recent_sweeps"][-self.MAX_RECENT :]
        return instrument

    def get(self, instrument: str) -> Dict[str, Any]:
        return self._ensure(instrument)

    def add_large_print(self, instrument: str, event: Dict[str, Any]) -> None:
        state = self._ensure(instrument)
        state["recent_large_prints"].append(event)
        if len(state["recent_large_prints"]) > self.MAX_RECENT:
            state["recent_large_prints"] = state["recent_large_prints"][-self.MAX_RECENT :]


# ---------------------------------------------------------------------------
# Setup cache (simulates DB reads with a TTL)
# ---------------------------------------------------------------------------
class _SetupCache:
    """
    Caches active signal setups fetched from the database.

    In a real deployment this would issue an async SQL query via asyncpg /
    SQLAlchemy.  Here a stub is provided that returns an empty list; swap in
    your DB fetch coroutine by overriding :meth:`_fetch_from_db`.
    """

    def __init__(self, api_url: str, ttl: float = SETUP_CACHE_TTL) -> None:
        self.api_url = api_url.rstrip('/')
        self.ttl = ttl
        self._cache: List[Dict[str, Any]] = []
        self._fetched_at: float = 0.0

    async def get_active_setups(self) -> List[Dict[str, Any]]:
        now = time.monotonic()
        if now - self._fetched_at > self.ttl:
            self._cache = await self._fetch_from_db()
            self._fetched_at = now
        return self._cache

    async def _fetch_from_db(self) -> List[Dict[str, Any]]:
        """
        Fetch all active signal setups from the Fastify API's internal endpoint.

        Returns a list of setup dicts with keys:
            id, userId, instruments, triggerConfig, cooldownMinutes,
            notificationChannels
        """
        url = f"{self.api_url}/signals/active"
        secret = os.getenv("INTERNAL_API_SECRET", "")
        headers = {"x-internal-secret": secret} if secret else {}

        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(url, headers=headers)
                if resp.status_code != 200:
                    logger.error("_fetch_from_db: API returned %d — using cached setups", resp.status_code)
                    return self._cache  # stale is better than empty on transient errors
                payload = resp.json()
                setups = payload.get("data", [])
                logger.info("_fetch_from_db: loaded %d active setups", len(setups))
                return setups
        except Exception as exc:
            logger.error("_fetch_from_db: request failed (%s) — using cached setups", exc)
            return self._cache  # stale is better than empty on transient errors


# ---------------------------------------------------------------------------
# Main evaluator
# ---------------------------------------------------------------------------
class TriggerEvaluator:
    """
    Subscribes to Redis market channels, evaluates signal setups, and
    publishes ``signal:triggered`` events.

    Parameters
    ----------
    redis_url:
        Redis DSN (e.g. ``redis://localhost:6379``).
    api_url:
        Base URL of the internal Fastify API (e.g. ``http://localhost:4000``).
        The evaluator fetches active signal setups from ``{api_url}/signals/active``.
    """

    def __init__(self, redis_url: str, api_url: str) -> None:
        self.redis_url = redis_url
        self.api_url = api_url

        self._redis: Optional[aioredis.Redis] = None
        self._state_store = _MarketStateStore()
        self._setup_cache = _SetupCache(api_url=api_url)

    # ------------------------------------------------------------------
    # Public
    # ------------------------------------------------------------------
    async def run(self) -> None:
        """
        Main loop:

        1. Subscribe to all market channels.
        2. On each message, update the per-instrument market state.
        3. Load active setups from DB (cached 30 s).
        4. For each matching setup, evaluate the trigger.
        5. If triggered and not in cooldown, publish ``signal:triggered``
           and set the cooldown key in Redis.
        """
        self._redis = aioredis.from_url(self.redis_url, decode_responses=True)
        pubsub = self._redis.pubsub()

        await pubsub.subscribe(
            CHANNEL_TICKS, CHANNEL_ORDERBOOK, CHANNEL_CVD, CHANNEL_SWEEP, CHANNEL_LARGE_PRINT,
        )
        logger.info(
            "TriggerEvaluator subscribed to: %s",
            [CHANNEL_TICKS, CHANNEL_ORDERBOOK, CHANNEL_CVD, CHANNEL_SWEEP, CHANNEL_LARGE_PRINT],
        )

        try:
            async for raw_msg in pubsub.listen():
                if raw_msg["type"] != "message":
                    continue
                await self._handle_message(raw_msg["channel"], raw_msg["data"])
        except asyncio.CancelledError:
            logger.info("TriggerEvaluator cancelled — shutting down.")
        finally:
            await pubsub.unsubscribe()
            await self._redis.aclose()

    # ------------------------------------------------------------------
    # Internal — message routing
    # ------------------------------------------------------------------
    async def _handle_message(self, channel: str, data: str) -> None:
        try:
            msg: Dict[str, Any] = json.loads(data)
        except json.JSONDecodeError as exc:
            logger.warning("Malformed JSON on channel %s: %s", channel, exc)
            return

        instrument: str = ""

        if channel == CHANNEL_TICKS:
            instrument = self._state_store.apply_tick(msg)
        elif channel == CHANNEL_ORDERBOOK:
            instrument = self._state_store.apply_orderbook(msg)
        elif channel == CHANNEL_CVD:
            instrument = self._state_store.apply_cvd_update(msg)
        elif channel == CHANNEL_SWEEP:
            instrument = self._state_store.apply_sweep(msg)
        elif channel == CHANNEL_LARGE_PRINT:
            instrument = msg.get("instrument", "")
            if instrument:
                self._state_store.add_large_print(instrument, msg)
                logger.info(
                    "large_print received: %s $%.0f (side=%s)",
                    instrument, msg.get("notional_usd", 0), msg.get("side"),
                )
        else:
            return

        if not instrument:
            return

        await self._evaluate_setups_for(instrument)

    # ------------------------------------------------------------------
    # Internal — setup evaluation
    # ------------------------------------------------------------------
    async def _evaluate_setups_for(self, instrument: str) -> None:
        """Evaluate all active setups that include *instrument*."""
        setups = await self._setup_cache.get_active_setups()
        if not setups:
            return

        market_state = self._state_store.get(instrument)

        for setup in setups:
            instruments: list = setup.get("instruments", [])
            if instrument not in instruments:
                continue

            setup_id = setup.get("id", "unknown")
            # Prisma serialises columns as camelCase. The original code mixed
            # snake_case ↔ camelCase, leaving triggerConfig always empty and
            # silently swallowing every signal. Accept both shapes so future
            # API changes don't re-break this.
            trigger_config: Dict[str, Any] = (
                setup.get("triggerConfig") or setup.get("trigger_config") or {}
            )

            try:
                triggered = await evaluate_trigger(trigger_config, market_state)
            except Exception as exc:  # noqa: BLE001
                logger.error("Error evaluating setup %s: %s", setup_id, exc)
                continue

            if not triggered:
                continue

            # Check cooldown.
            cooldown_key = f"signal:cooldown:{setup_id}:{instrument}"
            assert self._redis is not None
            in_cooldown = await self._redis.exists(cooldown_key)
            if in_cooldown:
                logger.debug("Setup %s / %s suppressed by cooldown.", setup_id, instrument)
                continue

            # Fire the trigger.
            await self._fire_trigger(setup, instrument, market_state)

    async def _fire_trigger(
        self,
        setup: Dict[str, Any],
        instrument: str,
        market_state: Dict[str, Any],
    ) -> None:
        assert self._redis is not None

        setup_id = setup.get("id", "unknown")
        user_id = setup.get("userId") or setup.get("user_id") or "unknown"
        cooldown_minutes: int = int(
            setup.get("cooldownMinutes")
            or setup.get("cooldown_minutes")
            or DEFAULT_COOLDOWN_MINUTES
        )

        # Snapshot of the market state at the moment of the trigger.
        # Field shape matches @orderflow/types SignalSnapshot (camelCase) so
        # downstream prompt builders / dashboard renderers can read it
        # without an adapter layer.
        trigger_config: Dict[str, Any] = (
            setup.get("triggerConfig") or setup.get("trigger_config") or {}
        )
        trigger_type = trigger_config.get("type", "unknown")
        trigger_params = trigger_config.get("params", {})

        # Pull the most recent supporting event for richer snapshot context.
        recent_lp: Optional[Dict[str, Any]] = None
        lps = market_state.get("recent_large_prints", [])
        if lps:
            recent_lp = lps[-1]
        recent_sw: Optional[Dict[str, Any]] = None
        sws = market_state.get("recent_sweeps", [])
        if sws:
            recent_sw = sws[-1]

        ts_ms = int(time.time() * 1000)
        last_price = market_state.get("last_price") or 0.0

        snapshot: Dict[str, Any] = {
            "instrument":      instrument,
            "exchange":        (recent_lp or recent_sw or {}).get("exchange", ""),
            "ts":              ts_ms,
            "price":           float(last_price),
            "triggerType":     trigger_type,
            "triggerValues":   trigger_params,
            "cvd":             float(market_state.get("cvd") or 0.0),
            "delta":           float(market_state.get("delta") or 0.0),
            "bidVolume":       float(market_state.get("bid_volume") or 0.0),
            "askVolume":       float(market_state.get("ask_volume") or 0.0),
            "imbalanceRatio":  float(market_state.get("imbalance_ratio") or 1.0),
            "dominantSide":    market_state.get("dominant_side", ""),
        }
        if recent_sw:
            snapshot["recentSweep"] = {
                "side":            recent_sw.get("side"),
                "notionalUsd":     float(recent_sw.get("notional_usd") or 0.0),
                "levelsConsumed":  int(recent_sw.get("levels_consumed") or 0),
                "tradeCount":      int(recent_sw.get("trade_count") or 0),
                "priceStart":      float(recent_sw.get("price_start") or 0.0),
                "priceEnd":        float(recent_sw.get("price_end") or 0.0),
            }
        if recent_lp:
            snapshot["recentLargePrint"] = {
                "side":         recent_lp.get("side"),
                "notionalUsd":  float(recent_lp.get("notional_usd") or 0.0),
                "price":        float(recent_lp.get("price") or 0.0),
                "size":         float(recent_lp.get("size") or 0.0),
            }

        event = json.dumps(
            {
                "setup_id": setup_id,
                "user_id": user_id,
                "instrument": instrument,
                "snapshot": snapshot,
                "ts": ts_ms,
            }
        )

        try:
            await self._redis.publish(CHANNEL_TRIGGERED, event)
            logger.info(
                "signal:triggered  setup=%s  user=%s  instrument=%s",
                setup_id,
                user_id,
                instrument,
            )
        except Exception as exc:  # noqa: BLE001
            logger.error("Failed to publish signal:triggered: %s", exc)
            return

        # Set cooldown key with TTL.
        cooldown_key = f"signal:cooldown:{setup_id}:{instrument}"
        cooldown_seconds = cooldown_minutes * 60
        try:
            await self._redis.set(cooldown_key, "1", ex=cooldown_seconds)
        except Exception as exc:  # noqa: BLE001
            logger.error("Failed to set cooldown key %s: %s", cooldown_key, exc)


# ---------------------------------------------------------------------------
# Entry-point
# ---------------------------------------------------------------------------
async def main() -> None:
    evaluator = TriggerEvaluator(
        redis_url=os.getenv("REDIS_URL", "redis://localhost:6379"),
        api_url=os.getenv("INTERNAL_API_URL", "http://localhost:4000"),
    )
    await evaluator.run()


if __name__ == "__main__":
    asyncio.run(main())
