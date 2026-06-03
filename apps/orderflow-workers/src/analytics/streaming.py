"""
Streaming analytics worker.

Consumes market:ticks and market:orderbook from Redis pubsub, maintains
per-instrument rolling state, and re-publishes higher-level events to
the channels the trigger evaluator + WS gateway already consume.

Redis channels consumed
-----------------------
    market:ticks
    market:orderbook

Redis channels produced
-----------------------
    market:cvd_update         {instrument, exchange, ts, cvd, delta_1s, delta_60s}
    market:sweep_detected     SweepEvent (dataclass) serialized
    market:large_print        {instrument, exchange, ts, side, price, size, notional_usd}
    market:imbalance_update   {instrument, exchange, ts, top5_imbalance, top5_dominant, ...}

Design notes
------------
- One asyncio loop per worker, single redis pubsub subscriber.
- Per-instrument tick buffer is a `deque` trimmed by timestamp to the
  last TICK_BUF_SECONDS seconds.
- Running CVD is snapshotted to Redis hash `streaming:cvd_snapshot`
  every CVD_SNAPSHOT_INTERVAL_SECONDS and reloaded on startup so worker
  restarts don't wipe baselines. Snapshots older than
  CVD_SNAPSHOT_MAX_AGE_SECONDS are discarded as stale.
- Sweep dedupe: re-detection on the rolling window is idempotent in
  principle, but we hash (instrument, ts of first trade, side) and
  refuse to re-emit. A sweep event's `ts` is the first-trade timestamp,
  so two consecutive scans of the same window produce identical events.
"""

from __future__ import annotations

import asyncio
import dataclasses
import json
import logging
import os
import time
from collections import deque
from typing import Any, Deque, Dict, Optional

import redis.asyncio as aioredis
from dotenv import load_dotenv

from analytics.cvd import Tick
from analytics.imbalance import OrderBookLevel, make_imbalance_result
from analytics.sweeps import detect_sweeps

load_dotenv()

logger = logging.getLogger(__name__)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
)

# ---------------------------------------------------------------------------
# Channels
# ---------------------------------------------------------------------------
CHANNEL_TICKS         = "market:ticks"
CHANNEL_ORDERBOOK     = "market:orderbook"
CHANNEL_CVD           = "market:cvd_update"
CHANNEL_SWEEP         = "market:sweep_detected"
CHANNEL_LARGE_PRINT   = "market:large_print"
CHANNEL_IMBALANCE     = "market:imbalance_update"

# CVD baselines are snapshotted here so worker restarts don't reset the
# running totals consumed by per-instrument signal triggers.
KEY_CVD_SNAPSHOT      = "streaming:cvd_snapshot"

# ---------------------------------------------------------------------------
# Tunables (env-overridable)
# ---------------------------------------------------------------------------
TICK_BUF_SECONDS          = int(os.getenv("STREAM_TICK_BUF_SECONDS",          "60"))
EMIT_INTERVAL_SECONDS     = float(os.getenv("STREAM_EMIT_INTERVAL_SECONDS",   "1.0"))
SWEEP_WINDOW_MS           = int(os.getenv("STREAM_SWEEP_WINDOW_MS",           "500"))
SWEEP_MIN_NOTIONAL_USD    = float(os.getenv("STREAM_SWEEP_MIN_NOTIONAL_USD",  "50000"))
SWEEP_MIN_TRADES          = int(os.getenv("STREAM_SWEEP_MIN_TRADES",          "3"))
LARGE_PRINT_THRESHOLD_USD = float(os.getenv("STREAM_LARGE_PRINT_USD",         "50000"))
IMBALANCE_TOP_N           = int(os.getenv("STREAM_IMBALANCE_TOP_N",           "5"))
STATS_INTERVAL_SECONDS    = float(os.getenv("STREAM_STATS_INTERVAL_SECONDS",  "30"))
CVD_SNAPSHOT_INTERVAL_SECONDS = float(os.getenv("STREAM_CVD_SNAPSHOT_INTERVAL_SECONDS", "60"))
CVD_SNAPSHOT_MAX_AGE_SECONDS  = float(os.getenv("STREAM_CVD_SNAPSHOT_MAX_AGE_SECONDS",  "86400"))


class InstrumentState:
    __slots__ = (
        "instrument", "exchange",
        "ticks", "cvd",
        "latest_ob",
        "last_emit_ts",
        "emitted_sweep_keys",
        "ticks_seen", "large_prints_emitted", "sweeps_emitted",
    )

    def __init__(self, instrument: str, exchange: str) -> None:
        self.instrument = instrument
        self.exchange = exchange
        self.ticks: Deque[Dict[str, Any]] = deque()
        self.cvd: float = 0.0
        self.latest_ob: Optional[Dict[str, Any]] = None
        self.last_emit_ts: float = 0.0
        # Bounded recent-sweep keys (instrument:ts:side) to avoid re-publishing
        # the same sweep on subsequent scans of the rolling window.
        self.emitted_sweep_keys: Deque[str] = deque(maxlen=256)
        self.ticks_seen = 0
        self.large_prints_emitted = 0
        self.sweeps_emitted = 0

    def append_tick(self, tick: Dict[str, Any]) -> None:
        self.ticks.append(tick)
        self.ticks_seen += 1
        side = tick.get("side")
        size = float(tick.get("size") or 0.0)
        if side == "buy":
            self.cvd += size
        elif side == "sell":
            self.cvd -= size
        # Trim by timestamp.
        cutoff_ms = int(tick["ts"]) - TICK_BUF_SECONDS * 1000
        while self.ticks and int(self.ticks[0]["ts"]) < cutoff_ms:
            self.ticks.popleft()

    def delta_since_ms(self, lookback_ms: int) -> float:
        """Signed delta over the last `lookback_ms` milliseconds."""
        if not self.ticks:
            return 0.0
        cutoff = int(self.ticks[-1]["ts"]) - lookback_ms
        total = 0.0
        # Scan from the right; tick buffer is small bounded so OK.
        for t in reversed(self.ticks):
            if int(t["ts"]) < cutoff:
                break
            side = t.get("side")
            size = float(t.get("size") or 0.0)
            if side == "buy":
                total += size
            elif side == "sell":
                total -= size
        return total


class StreamingAnalytics:
    def __init__(self, redis: aioredis.Redis) -> None:
        self._redis = redis
        self._state: Dict[str, InstrumentState] = {}
        self._last_stats = time.time()

    def _state_for(self, instrument: str, exchange: str) -> InstrumentState:
        key = f"{instrument}:{exchange}"
        st = self._state.get(key)
        if st is None:
            st = InstrumentState(instrument, exchange)
            self._state[key] = st
        return st

    # -------- CVD snapshot persistence --------------------------------
    async def _load_cvd_snapshot(self) -> None:
        """Restore CVD baselines from Redis on startup.

        Entries older than CVD_SNAPSHOT_MAX_AGE_SECONDS are skipped — a
        stale running total seeded after a multi-day outage would mislead
        triggers more than starting from zero.
        """
        try:
            raw = await self._redis.hgetall(KEY_CVD_SNAPSHOT)
        except Exception as exc:
            logger.warning("cvd snapshot load failed: %s", exc)
            return
        if not raw:
            logger.info("no CVD snapshot found — starting fresh baselines")
            return

        now_ms = int(time.time() * 1000)
        loaded = 0
        stale = 0
        for key, payload in raw.items():
            try:
                data = json.loads(payload)
                cvd = float(data["cvd"])
                snap_ts = int(data["ts"])
            except (TypeError, ValueError, KeyError):
                continue
            if (now_ms - snap_ts) / 1000 > CVD_SNAPSHOT_MAX_AGE_SECONDS:
                stale += 1
                continue
            instrument, sep, exchange = key.partition(":")
            if not sep or not instrument or not exchange:
                continue
            st = self._state_for(instrument, exchange)
            st.cvd = cvd
        loaded = len(self._state)
        logger.info(
            "loaded %d CVD baselines from snapshot (%d stale skipped)", loaded, stale,
        )

    async def _write_cvd_snapshot(self) -> int:
        """Write one snapshot of every tracked instrument's CVD. Returns count."""
        if not self._state:
            return 0
        now_ms = int(time.time() * 1000)
        mapping = {
            key: json.dumps({"cvd": st.cvd, "ts": now_ms})
            for key, st in self._state.items()
        }
        try:
            await self._redis.hset(KEY_CVD_SNAPSHOT, mapping=mapping)
        except Exception as exc:
            logger.warning("cvd snapshot write failed: %s", exc)
            return 0
        return len(mapping)

    async def _snapshot_periodic(self) -> None:
        """Background task — periodically persist CVD baselines."""
        while True:
            await asyncio.sleep(CVD_SNAPSHOT_INTERVAL_SECONDS)
            await self._write_cvd_snapshot()

    # -------- ingestion handlers --------------------------------------
    async def _handle_tick(self, payload: Dict[str, Any]) -> None:
        instrument = payload.get("instrument")
        exchange   = payload.get("exchange")
        if not instrument or not exchange:
            return
        st = self._state_for(instrument, exchange)
        st.append_tick(payload)

        # Large-print check is per-tick (low cost, immediate).
        size = float(payload.get("size") or 0.0)
        price = float(payload.get("price") or 0.0)
        notional = price * size
        if notional >= LARGE_PRINT_THRESHOLD_USD and payload.get("side") in ("buy", "sell"):
            ev = {
                "instrument": instrument,
                "exchange": exchange,
                "ts": int(payload["ts"]),
                "side": payload["side"],
                "price": price,
                "size": size,
                "notional_usd": notional,
            }
            await self._redis.publish(CHANNEL_LARGE_PRINT, json.dumps(ev))
            st.large_prints_emitted += 1

    async def _handle_orderbook(self, payload: Dict[str, Any]) -> None:
        instrument = payload.get("instrument")
        exchange   = payload.get("exchange")
        if not instrument or not exchange:
            return
        st = self._state_for(instrument, exchange)
        st.latest_ob = payload

    # -------- periodic emitters --------------------------------------
    async def _emit_periodic(self) -> None:
        """Run every EMIT_INTERVAL_SECONDS — fire CVD + imbalance + sweep scan."""
        while True:
            await asyncio.sleep(EMIT_INTERVAL_SECONDS)
            now_ms = int(time.time() * 1000)
            for key, st in list(self._state.items()):
                # CVD update.
                if st.ticks:
                    cvd_ev = {
                        "instrument": st.instrument,
                        "exchange":   st.exchange,
                        "ts":         now_ms,
                        "cvd":        round(st.cvd, 8),
                        "delta_1s":   round(st.delta_since_ms(1_000), 8),
                        "delta_60s":  round(st.delta_since_ms(60_000), 8),
                    }
                    await self._redis.publish(CHANNEL_CVD, json.dumps(cvd_ev))

                # Sweep scan on the rolling window.
                if len(st.ticks) >= SWEEP_MIN_TRADES:
                    ticks_list = [
                        Tick(
                            ts=int(t["ts"]),
                            price=float(t.get("price") or 0.0),
                            size=float(t.get("size") or 0.0),
                            side=str(t.get("side") or "unknown"),
                        )
                        for t in st.ticks
                    ]
                    sweeps = detect_sweeps(
                        ticks_list,
                        instrument=st.instrument,
                        exchange=st.exchange,
                        min_notional_usd=SWEEP_MIN_NOTIONAL_USD,
                        window_ms=SWEEP_WINDOW_MS,
                        min_trades=SWEEP_MIN_TRADES,
                    )
                    for sw in sweeps:
                        sweep_key = f"{sw.instrument}:{sw.ts}:{sw.side}"
                        if sweep_key in st.emitted_sweep_keys:
                            continue
                        st.emitted_sweep_keys.append(sweep_key)
                        await self._redis.publish(
                            CHANNEL_SWEEP, json.dumps(dataclasses.asdict(sw))
                        )
                        st.sweeps_emitted += 1

                # Imbalance update from latest OB.
                if st.latest_ob:
                    bids_raw = st.latest_ob.get("bids") or []
                    asks_raw = st.latest_ob.get("asks") or []
                    if bids_raw and asks_raw:
                        bids = [OrderBookLevel(price=float(p), size=float(s)) for p, s in bids_raw[:IMBALANCE_TOP_N]]
                        asks = [OrderBookLevel(price=float(p), size=float(s)) for p, s in asks_raw[:IMBALANCE_TOP_N]]
                        try:
                            ob_ts = int(st.latest_ob.get("ts") or now_ms)
                            result = make_imbalance_result(
                                bids, asks,
                                instrument=st.instrument,
                                ts=ob_ts,
                                n=IMBALANCE_TOP_N,
                            )
                            imb_ev = {
                                "exchange": st.exchange,
                                **dataclasses.asdict(result),
                            }
                            await self._redis.publish(CHANNEL_IMBALANCE, json.dumps(imb_ev, default=str))
                        except Exception as exc:
                            logger.debug("imbalance compute failed for %s: %s", st.instrument, exc)

            # Stats heartbeat.
            if time.time() - self._last_stats >= STATS_INTERVAL_SECONDS:
                parts = []
                for key, st in self._state.items():
                    parts.append(
                        f"{st.instrument}: cvd={st.cvd:+.2f} "
                        f"ticks={st.ticks_seen} lp={st.large_prints_emitted} sw={st.sweeps_emitted}"
                    )
                logger.info("stats — %s", " | ".join(parts) if parts else "no instruments yet")
                self._last_stats = time.time()

    # -------- main loop ------------------------------------------------
    async def run(self) -> None:
        # Restore CVD baselines before any tick arrives so new prints
        # immediately update the persisted value rather than rebuilding
        # from zero.
        await self._load_cvd_snapshot()

        pubsub = self._redis.pubsub()
        await pubsub.subscribe(CHANNEL_TICKS, CHANNEL_ORDERBOOK)
        logger.info("Subscribed to: %s, %s", CHANNEL_TICKS, CHANNEL_ORDERBOOK)

        emitter_task  = asyncio.create_task(self._emit_periodic(),     name="streaming-emitter")
        snapshot_task = asyncio.create_task(self._snapshot_periodic(), name="streaming-snapshot")

        try:
            async for msg in pubsub.listen():
                if msg.get("type") != "message":
                    continue
                channel = msg.get("channel")
                data = msg.get("data")
                try:
                    payload = json.loads(data)
                except (TypeError, ValueError):
                    continue
                if channel == CHANNEL_TICKS:
                    await self._handle_tick(payload)
                elif channel == CHANNEL_ORDERBOOK:
                    await self._handle_orderbook(payload)
        finally:
            for task in (emitter_task, snapshot_task):
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass
            # One final snapshot on the way out so an orderly shutdown
            # captures the most recent baseline.
            written = await self._write_cvd_snapshot()
            if written:
                logger.info("final CVD snapshot persisted (%d instruments)", written)
            await pubsub.unsubscribe()
            await pubsub.aclose()


async def main() -> None:
    redis_url = os.getenv("REDIS_URL", "redis://localhost:6379")
    redis = aioredis.from_url(redis_url, decode_responses=True)

    logger.info(
        "Streaming analytics starting — buf=%ds, emit=%.1fs, "
        "sweep≥$%.0f×%d trades, large_print≥$%.0f",
        TICK_BUF_SECONDS, EMIT_INTERVAL_SECONDS,
        SWEEP_MIN_NOTIONAL_USD, SWEEP_MIN_TRADES,
        LARGE_PRINT_THRESHOLD_USD,
    )

    sa = StreamingAnalytics(redis)
    try:
        await sa.run()
    finally:
        await redis.aclose()


if __name__ == "__main__":
    asyncio.run(main())
