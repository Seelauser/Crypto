"""
Binance async ingestor using CCXT Pro.

Subscribes to order-book snapshots + incremental WS updates and trade streams
for a configurable list of symbols, then publishes normalised events to Redis
pub/sub channels:

    market:ticks      — individual trade ticks
    market:orderbook  — full order-book snapshots (top-of-book + depth)

Reconnects automatically with exponential back-off (1 → 2 → 4 → 8 → 30 s cap).
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from typing import Any

import ccxt.pro as ccxtpro
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
ORDERBOOK_CHANNEL = "market:orderbook"
TICKS_CHANNEL = "market:ticks"

BACKOFF_INITIAL: float = 1.0
BACKOFF_FACTOR: float = 2.0
BACKOFF_MAX: float = 30.0

# How many order-book levels to publish (each side).
OB_DEPTH = 20


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _normalize_symbol(ccxt_symbol: str) -> str:
    """'BTC/USDT' → 'BTCUSDT'"""
    return ccxt_symbol.replace("/", "")


def _now_ms() -> int:
    return int(time.time() * 1000)


# ---------------------------------------------------------------------------
# Main ingestor class
# ---------------------------------------------------------------------------
class BinanceIngestor:
    """
    Long-running async ingestor for Binance spot/futures markets.

    Parameters
    ----------
    symbols:
        CCXT-format symbols, e.g. ``['BTC/USDT', 'ETH/USDT']``.
    redis_url:
        Redis connection string, e.g. ``redis://localhost:6379``.
    ob_depth:
        Number of price levels (per side) included in each order-book publish.
    """

    def __init__(
        self,
        symbols: list[str],
        redis_url: str = "redis://localhost:6379",
        ob_depth: int = OB_DEPTH,
    ) -> None:
        self.symbols = symbols
        self.redis_url = redis_url
        self.ob_depth = ob_depth

        # Keyed by CCXT symbol.  Each value is the last ccxt order-book dict.
        self._order_books: dict[str, dict[str, Any]] = {}

        self._redis: aioredis.Redis | None = None
        self._exchange: ccxtpro.binance | None = None

    # ------------------------------------------------------------------
    # Public
    # ------------------------------------------------------------------
    async def run(self) -> None:
        """Entry point — runs forever, reconnecting on failures."""
        self._redis = aioredis.from_url(self.redis_url, decode_responses=True)
        try:
            await self._run_with_reconnect()
        finally:
            await self._redis.aclose()

    # ------------------------------------------------------------------
    # Internal — connection management
    # ------------------------------------------------------------------
    async def _run_with_reconnect(self) -> None:
        backoff = BACKOFF_INITIAL
        while True:
            try:
                logger.info("Connecting to Binance via CCXT Pro …")
                await self._connect_and_stream()
                # _connect_and_stream should never return normally; if it does,
                # treat it as a silent disconnect.
                backoff = BACKOFF_INITIAL
            except asyncio.CancelledError:
                logger.info("Ingestor cancelled — shutting down.")
                raise
            except Exception as exc:  # noqa: BLE001
                logger.error("Ingestor error: %s — reconnecting in %.0fs", exc, backoff)
                await asyncio.sleep(backoff)
                backoff = min(backoff * BACKOFF_FACTOR, BACKOFF_MAX)
            finally:
                await self._close_exchange()

    async def _connect_and_stream(self) -> None:
        self._exchange = ccxtpro.binance(
            {
                "enableRateLimit": True,
                "options": {
                    "defaultType": "spot",
                },
            }
        )

        # Seed local order-book state with a REST snapshot for each symbol.
        await self._fetch_ob_snapshots()

        # Launch one task per subscription type per symbol, plus book-update
        # tasks that keep the local OB in sync.
        tasks: list[asyncio.Task[None]] = []
        for symbol in self.symbols:
            tasks.append(asyncio.create_task(self._watch_trades(symbol), name=f"trades:{symbol}"))
            tasks.append(
                asyncio.create_task(self._watch_order_book(symbol), name=f"ob:{symbol}")
            )

        # Wait for all tasks — any individual exception will propagate here
        # so the outer reconnect loop can handle it.
        done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_EXCEPTION)
        for task in pending:
            task.cancel()
        # Re-raise the first exception so the reconnect loop logs it properly.
        for task in done:
            exc = task.exception()
            if exc is not None:
                raise exc

    async def _close_exchange(self) -> None:
        if self._exchange is not None:
            try:
                await self._exchange.close()
            except Exception:  # noqa: BLE001
                pass
            self._exchange = None

    # ------------------------------------------------------------------
    # Internal — REST snapshot
    # ------------------------------------------------------------------
    async def _fetch_ob_snapshots(self) -> None:
        assert self._exchange is not None
        for symbol in self.symbols:
            try:
                ob = await self._exchange.fetch_order_book(symbol, limit=self.ob_depth)
                self._order_books[symbol] = ob
                logger.info("Order-book snapshot fetched for %s", symbol)
            except Exception as exc:  # noqa: BLE001
                logger.warning("Could not fetch OB snapshot for %s: %s", symbol, exc)

    # ------------------------------------------------------------------
    # Internal — WebSocket streaming loops
    # ------------------------------------------------------------------
    async def _watch_trades(self, symbol: str) -> None:
        """Stream trades for *symbol* and publish tick events."""
        assert self._exchange is not None
        instrument = _normalize_symbol(symbol)

        while True:
            trades: list[dict[str, Any]] = await self._exchange.watch_trades(symbol)  # type: ignore[assignment]
            for trade in trades:
                await self._publish_tick(instrument, trade)

    async def _watch_order_book(self, symbol: str) -> None:
        """Stream incremental OB updates and publish consolidated snapshots."""
        assert self._exchange is not None
        instrument = _normalize_symbol(symbol)

        while True:
            ob: dict[str, Any] = await self._exchange.watch_order_book(symbol, limit=self.ob_depth)  # type: ignore[assignment]
            self._order_books[symbol] = ob
            await self._publish_order_book(instrument, ob)

    # ------------------------------------------------------------------
    # Internal — publishing
    # ------------------------------------------------------------------
    async def _publish_tick(self, instrument: str, trade: dict[str, Any]) -> None:
        assert self._redis is not None

        side = trade.get("side") or "unknown"
        ts = trade.get("timestamp") or _now_ms()

        payload = json.dumps(
            {
                "instrument": instrument,
                "exchange": "binance",
                "ts": ts,
                "price": float(trade.get("price") or 0),
                "size": float(trade.get("amount") or 0),
                "side": side,
                # Optional fields present in CCXT trade dicts.
                "trade_id": trade.get("id"),
                "taker_or_maker": trade.get("takerOrMaker"),
            }
        )
        try:
            await self._redis.publish(TICKS_CHANNEL, payload)
        except Exception as exc:  # noqa: BLE001
            logger.error("Redis publish (tick) failed: %s", exc)

    async def _publish_order_book(self, instrument: str, ob: dict[str, Any]) -> None:
        assert self._redis is not None

        bids = ob.get("bids") or []
        asks = ob.get("asks") or []
        ts = ob.get("timestamp") or _now_ms()

        payload = json.dumps(
            {
                "instrument": instrument,
                "exchange": "binance",
                "ts": ts,
                "bids": [[float(p), float(s)] for p, s in bids[: self.ob_depth]],
                "asks": [[float(p), float(s)] for p, s in asks[: self.ob_depth]],
                "nonce": ob.get("nonce"),
            }
        )
        try:
            await self._redis.publish(ORDERBOOK_CHANNEL, payload)
        except Exception as exc:  # noqa: BLE001
            logger.error("Redis publish (order-book) failed: %s", exc)


# ---------------------------------------------------------------------------
# Top-level run() convenience function
# ---------------------------------------------------------------------------
async def run(symbols: list[str]) -> None:
    """
    Convenience coroutine — create an ingestor from environment variables and
    stream until cancelled.

    Environment variables:
        REDIS_URL   — Redis DSN (default: redis://localhost:6379)
        OB_DEPTH    — order-book depth per side to publish (default: 20)
    """
    redis_url = os.getenv("REDIS_URL", "redis://localhost:6379")
    ob_depth = int(os.getenv("OB_DEPTH", str(OB_DEPTH)))

    ingestor = BinanceIngestor(symbols=symbols, redis_url=redis_url, ob_depth=ob_depth)
    await ingestor.run()


# ---------------------------------------------------------------------------
# CLI entry-point (registered in pyproject.toml)
# ---------------------------------------------------------------------------
def cli_entry() -> None:
    """
    Usage:  ingest-binance BTC/USDT ETH/USDT SOL/USDT
    """
    import sys

    symbols = sys.argv[1:] if len(sys.argv) > 1 else ["BTC/USDT", "ETH/USDT"]
    logger.info("Starting Binance ingestor for symbols: %s", symbols)
    asyncio.run(run(symbols))


if __name__ == "__main__":
    cli_entry()
