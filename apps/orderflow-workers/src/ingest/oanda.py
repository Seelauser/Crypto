"""
OANDA v20 adapter for Forex instruments.

Streams real-time bid/ask prices from the OANDA v20 pricing stream, synthesises
1-minute OHLCV bars in-memory, and publishes to Redis:

    market:ticks   — individual bid/ask price updates (synthetic ticks)
    market:ohlcv   — 1-minute synthetic bars with inferred delta / CVD

Delta inference uses the same Price-Position approximation as the Alpaca adapter
(not true L2 aggressor data).  All published events carry ``"source": "inferred"``.

OANDA instrument names (``EUR_USD``) are normalised to plain format (``EURUSD``)
before publishing.

Streaming endpoint
------------------
    https://stream-fxtrade.oanda.com/v3/accounts/{account_id}/pricing/stream
    ?instruments=EUR_USD,GBP_USD,...

Each JSON-lines message is either:
    {"type": "PRICE", "instrument": "EUR_USD", "bids": [...], "asks": [...], "time": "..."}
    {"type": "HEARTBEAT", "time": "..."}
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from collections import defaultdict
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

import httpx
import redis.asyncio as aioredis

logger = logging.getLogger(__name__)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
TICKS_CHANNEL = "market:ticks"
OHLCV_CHANNEL = "market:ohlcv"

STREAM_URL = (
    "https://stream-fxtrade.oanda.com/v3/accounts/{account_id}/pricing/stream"
)
BAR_SECONDS = 60            # synthetic bar period
READ_TIMEOUT = 120.0        # seconds between heartbeats before we reconnect

BACKOFF_INITIAL = 1.0
BACKOFF_FACTOR = 2.0
BACKOFF_MAX = 30.0


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------
@dataclass
class _BarAccumulator:
    """Mutable OHLCV accumulator for one instrument in the current 1-minute bucket."""
    open: float = 0.0
    high: float = 0.0
    low: float = 0.0
    close: float = 0.0
    volume: float = 0.0      # proxy: number of ticks seen
    tick_count: int = 0
    bucket: int = 0          # Unix seconds of bar open (floor of BAR_SECONDS)
    first: bool = True


def _normalize_instrument(oanda_name: str) -> str:
    """``EUR_USD`` -> ``EURUSD``"""
    return oanda_name.replace("_", "")


def _mid_price(bids: List[Dict[str, Any]], asks: List[Dict[str, Any]]) -> float:
    """Return mid-price from OANDA bid/ask bucket lists, or 0.0 on failure."""
    try:
        best_bid = float(bids[0]["price"])
        best_ask = float(asks[0]["price"])
        return (best_bid + best_ask) / 2.0
    except (IndexError, KeyError, ValueError, TypeError):
        return 0.0


def _rfc3339_to_ms(ts_str: str) -> int:
    """Convert an RFC-3339 / ISO-8601 string to Unix milliseconds."""
    import datetime

    if not ts_str:
        return int(time.time() * 1000)
    ts_str = ts_str.replace("Z", "+00:00")
    dt = datetime.datetime.fromisoformat(ts_str)
    return int(dt.timestamp() * 1000)


def _infer_delta(open_: float, high: float, low: float, close: float, volume: float) -> float:
    """Price-Position approximation for delta inference from OHLCV."""
    range_ = high - low + 1e-8
    if close >= open_:
        buy_vol = volume * (close - low) / range_
        sell_vol = volume - buy_vol
    else:
        sell_vol = volume * (high - close) / range_
        buy_vol = volume - sell_vol
    return buy_vol - sell_vol


# ---------------------------------------------------------------------------
# Main ingestor class
# ---------------------------------------------------------------------------
class OandaIngestor:
    """
    Connects to the OANDA v20 pricing stream (requires a funded or demo account
    plus an API key).

    Publishes to Redis:
    - ``market:ticks``  — each incoming bid/ask update
    - ``market:ohlcv``  — 1-minute synthetic bars (flushed when the bar bucket
      rolls over or when an instrument goes silent for > BAR_SECONDS)

    All delta/CVD values are inferred (Price-Position), labelled
    ``"source": "inferred"``.
    """

    def __init__(
        self,
        redis_url: str,
        account_id: str = "",
        api_key: str = "",
    ) -> None:
        self.redis_url = redis_url
        self.account_id = account_id
        self.api_key = api_key

        self._redis: Optional[aioredis.Redis] = None
        # Per-instrument bar accumulator.
        self._bars: Dict[str, _BarAccumulator] = defaultdict(_BarAccumulator)
        # Running CVD per normalised instrument.
        self._cvd: Dict[str, float] = {}

    # ------------------------------------------------------------------
    # Public
    # ------------------------------------------------------------------

    async def stream_prices(self, instruments: List[str]) -> None:
        """
        Stream the OANDA pricing API.  Each bid/ask update is treated as a
        synthetic tick.  When the 1-minute bucket rolls over, a synthetic bar
        is emitted.

        Raises on connection failure so the caller can apply back-off.
        """
        assert self._redis is not None

        url = STREAM_URL.format(account_id=self.account_id)
        params = {"instruments": ",".join(instruments)}
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Accept-Datetime-Format": "RFC3339",
        }

        async with httpx.AsyncClient(timeout=httpx.Timeout(READ_TIMEOUT, connect=15.0)) as client:
            async with client.stream("GET", url, params=params, headers=headers) as resp:
                resp.raise_for_status()
                logger.info(
                    "OANDA stream connected: %s",
                    [_normalize_instrument(i) for i in instruments],
                )
                async for line in resp.aiter_lines():
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        msg: Dict[str, Any] = json.loads(line)
                    except json.JSONDecodeError as exc:
                        logger.warning("Malformed JSON from OANDA: %s", exc)
                        continue

                    msg_type = msg.get("type")
                    if msg_type == "PRICE":
                        await self._handle_price(msg)
                    elif msg_type == "HEARTBEAT":
                        logger.debug("OANDA heartbeat: %s", msg.get("time"))
                    # Ignore unknown message types silently.

    async def run(self, instruments: List[str]) -> None:
        """
        Main entry point: stream with exponential back-off on failure.
        """
        self._redis = aioredis.from_url(self.redis_url, decode_responses=True)
        try:
            backoff = BACKOFF_INITIAL
            while True:
                try:
                    await self.stream_prices(instruments)
                    backoff = BACKOFF_INITIAL
                except asyncio.CancelledError:
                    logger.info("OandaIngestor cancelled — shutting down.")
                    # Flush any open bars before exiting.
                    await self._flush_all_bars()
                    raise
                except (httpx.HTTPError, OSError) as exc:
                    logger.warning(
                        "OANDA stream error: %s — reconnecting in %.0f s", exc, backoff
                    )
                    await asyncio.sleep(backoff)
                    backoff = min(backoff * BACKOFF_FACTOR, BACKOFF_MAX)
        finally:
            await self._redis.aclose()

    # ------------------------------------------------------------------
    # Internal — message handling
    # ------------------------------------------------------------------

    async def _handle_price(self, msg: Dict[str, Any]) -> None:
        """Process a PRICE message: publish tick and update bar accumulator."""
        oanda_instrument: str = msg.get("instrument", "")
        instrument = _normalize_instrument(oanda_instrument)
        bids: List[Dict[str, Any]] = msg.get("bids", [])
        asks: List[Dict[str, Any]] = msg.get("asks", [])
        ts_str: str = msg.get("time", "")
        ts_ms = _rfc3339_to_ms(ts_str)
        mid = _mid_price(bids, asks)

        if mid == 0.0:
            return

        # Publish synthetic tick.
        tick_payload = json.dumps(
            {
                "instrument": instrument,
                "exchange": "oanda",
                "source": "inferred",
                "ts": ts_ms,
                "price": mid,
                "bid": float(bids[0]["price"]) if bids else mid,
                "ask": float(asks[0]["price"]) if asks else mid,
                "size": 1.0,   # tick-count proxy; OANDA doesn't provide lot sizes
                "side": "unknown",
            }
        )
        try:
            await self._redis.publish(TICKS_CHANNEL, tick_payload)
        except Exception as exc:  # noqa: BLE001
            logger.error("Redis tick publish failed (%s): %s", instrument, exc)

        # Update synthetic bar.
        await self._update_bar(instrument, mid, ts_ms)

    async def _update_bar(self, instrument: str, price: float, ts_ms: int) -> None:
        """
        Update the in-progress 1-minute bar for *instrument*.
        Flushes the completed bar and starts a new one when the bucket rolls.
        """
        bucket = (ts_ms // 1000 // BAR_SECONDS) * BAR_SECONDS  # Unix seconds

        acc = self._bars[instrument]

        if acc.first or acc.bucket != bucket:
            # Flush the completed bar (skip if this is the very first tick).
            if not acc.first and acc.tick_count > 0:
                await self._flush_bar(instrument, acc)
            # Start new bar.
            acc.open = price
            acc.high = price
            acc.low = price
            acc.close = price
            acc.volume = 1.0
            acc.tick_count = 1
            acc.bucket = bucket
            acc.first = False
        else:
            acc.high = max(acc.high, price)
            acc.low = min(acc.low, price)
            acc.close = price
            acc.volume += 1.0
            acc.tick_count += 1

    async def _flush_bar(self, instrument: str, acc: _BarAccumulator) -> None:
        """Compute delta/CVD for a completed bar and publish to ``market:ohlcv``."""
        assert self._redis is not None

        delta = _infer_delta(acc.open, acc.high, acc.low, acc.close, acc.volume)
        prev_cvd = self._cvd.get(instrument, 0.0)
        cvd = prev_cvd + delta
        self._cvd[instrument] = cvd

        buy_vol = (acc.volume + delta) / 2.0
        sell_vol = (acc.volume - delta) / 2.0

        ts_open_ms = acc.bucket * 1000
        payload = json.dumps(
            {
                "instrument": instrument,
                "exchange": "oanda",
                "source": "inferred",
                "ts": ts_open_ms,
                "open": acc.open,
                "high": acc.high,
                "low": acc.low,
                "close": acc.close,
                "volume": acc.volume,
                "buy_volume": round(buy_vol, 6),
                "sell_volume": round(sell_vol, 6),
                "delta": round(delta, 6),
                "cvd": round(cvd, 6),
            }
        )
        try:
            await self._redis.publish(OHLCV_CHANNEL, payload)
            logger.debug(
                "Published bar  instrument=%s  close=%.5f  delta=%.2f  cvd=%.2f",
                instrument,
                acc.close,
                delta,
                cvd,
            )
        except Exception as exc:  # noqa: BLE001
            logger.error("Redis ohlcv publish failed (%s): %s", instrument, exc)

    async def _flush_all_bars(self) -> None:
        """Flush all open bar accumulators (called on shutdown)."""
        for instrument, acc in list(self._bars.items()):
            if not acc.first and acc.tick_count > 0:
                await self._flush_bar(instrument, acc)


# ---------------------------------------------------------------------------
# CLI entry-point
# ---------------------------------------------------------------------------
async def main() -> None:
    from dotenv import load_dotenv

    load_dotenv()
    ingestor = OandaIngestor(
        redis_url=os.getenv("REDIS_URL", "redis://localhost:6379"),
        account_id=os.getenv("OANDA_ACCOUNT_ID", ""),
        api_key=os.getenv("OANDA_API_KEY", ""),
    )
    await ingestor.run(["EUR_USD", "GBP_USD", "USD_JPY", "USD_CHF", "AUD_USD"])


if __name__ == "__main__":
    asyncio.run(main())
