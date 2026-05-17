"""
Alpaca Markets data adapter for US stocks / ETFs.

Connects to Alpaca's free-tier Data API to receive real-time 1-minute bars
via WebSocket, then publishes normalised events to Redis pub/sub:

    market:ohlcv   — 1-minute OHLCV bar with inferred delta / CVD fields

Falls back to REST polling every 60 s when the WebSocket connection fails.

Delta inference (Price-Position approximation, NOT true L2)
-----------------------------------------------------------
    range_ = high - low + 1e-8          # guard against flat bars
    if close >= open:
        buy_vol  = volume * (close - low)  / range_
        sell_vol = volume - buy_vol
    else:
        sell_vol = volume * (high - close) / range_
        buy_vol  = volume - sell_vol
    delta = buy_vol - sell_vol

All published bars carry  "source": "inferred"  to make it explicit that the
delta is NOT derived from true aggressor classification.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from dataclasses import asdict, dataclass
from typing import Any, Dict, List, Optional

import httpx
import redis.asyncio as aioredis
import websockets
from websockets.exceptions import ConnectionClosed

logger = logging.getLogger(__name__)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
OHLCV_CHANNEL = "market:ohlcv"

# Alpaca free-tier data URLs
WS_URL_IEX = "wss://stream.data.alpaca.markets/v2/iex"   # free plan
REST_URL = "https://data.alpaca.markets/v2/stocks/{symbol}/bars"

POLL_INTERVAL = 60          # seconds between REST fallback polls
BAR_TIMEFRAME = "1Min"      # Alpaca timeframe identifier
REST_LIMIT = 5              # bars fetched per REST poll (recent history)

BACKOFF_INITIAL = 1.0
BACKOFF_FACTOR = 2.0
BACKOFF_MAX = 30.0


# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------
@dataclass
class AlpacaBar:
    symbol: str
    ts: int          # unix ms of bar open
    open: float
    high: float
    low: float
    close: float
    volume: float
    vwap: float
    trade_count: int


# ---------------------------------------------------------------------------
# Main ingestor class
# ---------------------------------------------------------------------------
class AlpacaIngestor:
    """
    Connects to Alpaca WS stream to receive real-time bars (1-minute).
    Publishes to Redis channel ``market:ohlcv`` as JSON.
    Falls back to REST polling every 60 s if WS fails.

    Delta/CVD is inferred from OHLCV using the Price-Position approximation
    (not true L2 data). All published events are labelled ``"source": "inferred"``.

    Symbols must be in plain format: ``AAPL``, ``NVDA``, ``TSLA``.
    """

    def __init__(
        self,
        redis_url: str,
        api_key: str = "",
        api_secret: str = "",
    ) -> None:
        self.redis_url = redis_url
        self.api_key = api_key
        self.api_secret = api_secret

        self._redis: Optional[aioredis.Redis] = None
        # Running CVD per symbol (accumulates across bars within a session).
        self._cvd: Dict[str, float] = {}

    # ------------------------------------------------------------------
    # Public
    # ------------------------------------------------------------------

    def infer_delta(self, bar: AlpacaBar) -> float:
        """
        Infer signed delta from OHLCV using the Price-Position approximation.

        Returns
        -------
        float
            Positive = net buying pressure, negative = net selling pressure.
        """
        range_ = bar.high - bar.low + 1e-8
        if bar.close >= bar.open:
            buy_vol = bar.volume * (bar.close - bar.low) / range_
            sell_vol = bar.volume - buy_vol
        else:
            sell_vol = bar.volume * (bar.high - bar.close) / range_
            buy_vol = bar.volume - sell_vol
        return buy_vol - sell_vol

    async def stream_bars(self, symbols: List[str]) -> None:
        """
        Subscribe to the Alpaca IEX WebSocket bar stream and publish each bar
        to Redis.  Raises on connection failure so the caller can apply
        back-off and reconnect.
        """
        assert self._redis is not None

        auth_msg = json.dumps({"action": "auth", "key": self.api_key, "secret": self.api_secret})
        subscribe_msg = json.dumps({"action": "subscribe", "bars": symbols})

        async with websockets.connect(WS_URL_IEX) as ws:
            # Consume the welcome frame.
            await ws.recv()

            # Authenticate.
            await ws.send(auth_msg)
            auth_resp = json.loads(await ws.recv())
            if isinstance(auth_resp, list):
                auth_resp = auth_resp[0]
            if auth_resp.get("T") == "error":
                raise RuntimeError(f"Alpaca WS auth failed: {auth_resp}")

            # Subscribe to bars.
            await ws.send(subscribe_msg)
            await ws.recv()  # subscription confirmation

            logger.info("Alpaca WS: subscribed to bars for %s", symbols)

            async for raw in ws:
                messages = json.loads(raw)
                if not isinstance(messages, list):
                    messages = [messages]
                for msg in messages:
                    if msg.get("T") == "b":          # bar update
                        bar = self._parse_ws_bar(msg)
                        if bar is not None:
                            await self._publish_bar(bar)

    async def run(self, symbols: List[str]) -> None:
        """
        Main entry point: attempt WS streaming with exponential back-off,
        falling back to REST polling whenever the WS is unavailable.
        """
        self._redis = aioredis.from_url(self.redis_url, decode_responses=True)
        try:
            backoff = BACKOFF_INITIAL
            while True:
                try:
                    await self.stream_bars(symbols)
                    backoff = BACKOFF_INITIAL
                except asyncio.CancelledError:
                    logger.info("AlpacaIngestor cancelled — shutting down.")
                    raise
                except (ConnectionClosed, OSError, RuntimeError) as exc:
                    logger.warning(
                        "Alpaca WS error: %s — falling back to REST for %.0f s",
                        exc,
                        backoff,
                    )
                    # REST fallback for the current backoff window.
                    await self._rest_poll(symbols)
                    await asyncio.sleep(backoff)
                    backoff = min(backoff * BACKOFF_FACTOR, BACKOFF_MAX)
        finally:
            await self._redis.aclose()

    # ------------------------------------------------------------------
    # Internal — REST fallback
    # ------------------------------------------------------------------

    async def _rest_poll(self, symbols: List[str]) -> None:
        """
        Fetch the most recent bars for all *symbols* via the REST API and
        publish them to Redis.
        """
        assert self._redis is not None
        headers = {
            "APCA-API-KEY-ID": self.api_key,
            "APCA-API-SECRET-KEY": self.api_secret,
        }
        params: Dict[str, Any] = {
            "timeframe": BAR_TIMEFRAME,
            "limit": REST_LIMIT,
            "feed": "iex",
        }

        async with httpx.AsyncClient(headers=headers, timeout=15.0) as client:
            for symbol in symbols:
                url = REST_URL.format(symbol=symbol)
                try:
                    resp = await client.get(url, params=params)
                    resp.raise_for_status()
                    data = resp.json()
                    raw_bars: List[Dict[str, Any]] = data.get("bars") or []
                    for raw in raw_bars:
                        bar = self._parse_rest_bar(symbol, raw)
                        if bar is not None:
                            await self._publish_bar(bar)
                except Exception as exc:  # noqa: BLE001
                    logger.error("REST poll failed for %s: %s", symbol, exc)

    # ------------------------------------------------------------------
    # Internal — parsing
    # ------------------------------------------------------------------

    def _parse_ws_bar(self, msg: Dict[str, Any]) -> Optional[AlpacaBar]:
        """Parse a WebSocket bar message into an :class:`AlpacaBar`."""
        try:
            symbol = msg["S"]
            # Alpaca sends RFC-3339 timestamps; convert to Unix ms.
            ts_str: str = msg.get("t", "")
            ts = self._rfc3339_to_ms(ts_str)
            return AlpacaBar(
                symbol=symbol,
                ts=ts,
                open=float(msg["o"]),
                high=float(msg["h"]),
                low=float(msg["l"]),
                close=float(msg["c"]),
                volume=float(msg["v"]),
                vwap=float(msg.get("vw", 0.0)),
                trade_count=int(msg.get("n", 0)),
            )
        except (KeyError, ValueError, TypeError) as exc:
            logger.warning("Could not parse WS bar %r: %s", msg, exc)
            return None

    def _parse_rest_bar(self, symbol: str, raw: Dict[str, Any]) -> Optional[AlpacaBar]:
        """Parse a REST bar dict into an :class:`AlpacaBar`."""
        try:
            ts = self._rfc3339_to_ms(raw.get("t", ""))
            return AlpacaBar(
                symbol=symbol,
                ts=ts,
                open=float(raw["o"]),
                high=float(raw["h"]),
                low=float(raw["l"]),
                close=float(raw["c"]),
                volume=float(raw["v"]),
                vwap=float(raw.get("vw", 0.0)),
                trade_count=int(raw.get("n", 0)),
            )
        except (KeyError, ValueError, TypeError) as exc:
            logger.warning("Could not parse REST bar %r: %s", raw, exc)
            return None

    @staticmethod
    def _rfc3339_to_ms(ts_str: str) -> int:
        """Convert an RFC-3339 / ISO-8601 string to Unix milliseconds."""
        import datetime

        if not ts_str:
            return int(time.time() * 1000)
        # Python 3.11+ fromisoformat handles 'Z' suffix.
        ts_str = ts_str.replace("Z", "+00:00")
        dt = datetime.datetime.fromisoformat(ts_str)
        return int(dt.timestamp() * 1000)

    # ------------------------------------------------------------------
    # Internal — publishing
    # ------------------------------------------------------------------

    async def _publish_bar(self, bar: AlpacaBar) -> None:
        """Infer delta, update CVD, and publish to ``market:ohlcv``."""
        assert self._redis is not None

        delta = self.infer_delta(bar)
        prev_cvd = self._cvd.get(bar.symbol, 0.0)
        cvd = prev_cvd + delta
        self._cvd[bar.symbol] = cvd

        buy_vol = (bar.volume + delta) / 2.0
        sell_vol = (bar.volume - delta) / 2.0

        payload = json.dumps(
            {
                "instrument": bar.symbol,
                "exchange": "alpaca",
                "source": "inferred",       # NOT true L2 aggressor data
                "ts": bar.ts,
                "open": bar.open,
                "high": bar.high,
                "low": bar.low,
                "close": bar.close,
                "volume": bar.volume,
                "vwap": bar.vwap,
                "trade_count": bar.trade_count,
                "buy_volume": round(buy_vol, 6),
                "sell_volume": round(sell_vol, 6),
                "delta": round(delta, 6),
                "cvd": round(cvd, 6),
            }
        )

        try:
            await self._redis.publish(OHLCV_CHANNEL, payload)
            logger.debug(
                "Published bar  symbol=%s  close=%.4f  delta=%.2f  cvd=%.2f",
                bar.symbol,
                bar.close,
                delta,
                cvd,
            )
        except Exception as exc:  # noqa: BLE001
            logger.error("Redis publish failed for %s: %s", bar.symbol, exc)


# ---------------------------------------------------------------------------
# CLI entry-point
# ---------------------------------------------------------------------------
async def main() -> None:
    from dotenv import load_dotenv

    load_dotenv()
    ingestor = AlpacaIngestor(
        redis_url=os.getenv("REDIS_URL", "redis://localhost:6379"),
        api_key=os.getenv("ALPACA_KEY_ID", ""),
        api_secret=os.getenv("ALPACA_SECRET", ""),
    )
    await ingestor.run(["AAPL", "NVDA", "TSLA", "MSFT", "AMZN", "META"])


if __name__ == "__main__":
    asyncio.run(main())
