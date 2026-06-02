"""
Generic CCXT Pro ingestor.

Drop-in replacement for ``ingest.binance`` that works for any exchange
CCXT Pro supports (binance / coinbase / coinbaseexchange / kraken / bybit /
okx / …). Pick the exchange via ``EXCHANGE`` env var or first CLI arg.

Symbol format is CCXT-unified (``BTC/USDT``, ``BTC/USD`` …). The
normalised instrument key — stored in the DB and published on Redis —
strips the slash, e.g. ``BTC/USDT → BTCUSDT``, ``BTC/USD → BTCUSD``.
Different quote currencies remain distinct so cross-exchange comparisons
on the same pair (e.g. ``BTCUSD`` on coinbase vs kraken) line up while
USDT vs USD pairs stay separate.

Usage
-----
    ENV  EXCHANGE=coinbase  ingest-ccxt BTC/USD ETH/USD SOL/USD
    or   ingest-ccxt coinbase BTC/USD ETH/USD SOL/USD

Channels produced — identical shape to ``ingest.binance``:
    market:ticks      one event per trade
    market:orderbook  one event per orderbook snapshot
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

ORDERBOOK_CHANNEL = "market:orderbook"
TICKS_CHANNEL = "market:ticks"

BACKOFF_INITIAL = 1.0
BACKOFF_FACTOR = 2.0
BACKOFF_MAX = 30.0
OB_DEPTH = 20

# Some exchanges only accept a fixed set of order-book depths in their
# watchOrderBook RPC. Snap requested depth to the closest allowed value.
EXCHANGE_OB_DEPTH_WHITELIST: dict[str, list[int]] = {
    "kraken": [10, 25, 100, 500, 1000],
}


def _resolve_ob_depth(exchange_name: str, requested: int) -> int:
    allowed = EXCHANGE_OB_DEPTH_WHITELIST.get(exchange_name.lower())
    if not allowed:
        return requested
    # Pick the smallest allowed >= requested, falling back to the largest.
    for d in allowed:
        if d >= requested:
            return d
    return allowed[-1]


def _normalize_symbol(ccxt_symbol: str) -> str:
    """``BTC/USDT → BTCUSDT``."""
    return ccxt_symbol.replace("/", "")


def _now_ms() -> int:
    return int(time.time() * 1000)


class CCXTIngestor:
    def __init__(
        self,
        exchange_name: str,
        symbols: list[str],
        redis_url: str = "redis://localhost:6379",
        ob_depth: int = OB_DEPTH,
    ) -> None:
        self.exchange_name = exchange_name.lower()
        self.symbols = symbols
        self.redis_url = redis_url
        self.ob_depth = _resolve_ob_depth(self.exchange_name, ob_depth)
        if self.ob_depth != ob_depth:
            logger.info(
                "OB depth snapped %d → %d for %s (exchange whitelist)",
                ob_depth, self.ob_depth, self.exchange_name,
            )
        self._order_books: dict[str, dict[str, Any]] = {}
        self._redis: aioredis.Redis | None = None
        self._exchange: Any = None

        # Sanity check: class must exist.
        if not hasattr(ccxtpro, self.exchange_name):
            raise ValueError(
                f"Unknown CCXT Pro exchange '{exchange_name}'. "
                f"Try one of: binance, coinbase, coinbaseexchange, kraken, bybit, okx."
            )

    async def run(self) -> None:
        self._redis = aioredis.from_url(self.redis_url, decode_responses=True)
        try:
            await self._run_with_reconnect()
        finally:
            await self._redis.aclose()

    async def _run_with_reconnect(self) -> None:
        backoff = BACKOFF_INITIAL
        while True:
            try:
                logger.info("Connecting to %s via CCXT Pro …", self.exchange_name)
                await self._connect_and_stream()
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
        cls = getattr(ccxtpro, self.exchange_name)
        # Permissive config — exchange-specific options can be added later if a
        # particular venue refuses to stream without them. Default options on
        # ccxt.pro classes already work for public market data.
        self._exchange = cls({"enableRateLimit": True})

        await self._fetch_ob_snapshots()

        tasks: list[asyncio.Task[None]] = []
        for symbol in self.symbols:
            tasks.append(asyncio.create_task(self._watch_trades(symbol), name=f"trades:{symbol}"))
            tasks.append(asyncio.create_task(self._watch_order_book(symbol), name=f"ob:{symbol}"))

        done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_EXCEPTION)
        for task in pending:
            task.cancel()
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

    async def _fetch_ob_snapshots(self) -> None:
        for symbol in self.symbols:
            try:
                ob = await self._exchange.fetch_order_book(symbol, limit=self.ob_depth)
                self._order_books[symbol] = ob
                logger.info("Order-book snapshot fetched for %s", symbol)
            except Exception as exc:  # noqa: BLE001
                logger.warning("Could not fetch OB snapshot for %s: %s", symbol, exc)

    async def _watch_trades(self, symbol: str) -> None:
        instrument = _normalize_symbol(symbol)
        while True:
            trades = await self._exchange.watch_trades(symbol)
            for trade in trades:
                await self._publish_tick(instrument, trade)

    async def _watch_order_book(self, symbol: str) -> None:
        instrument = _normalize_symbol(symbol)
        while True:
            ob = await self._exchange.watch_order_book(symbol, limit=self.ob_depth)
            self._order_books[symbol] = ob
            await self._publish_order_book(instrument, ob)

    async def _publish_tick(self, instrument: str, trade: dict[str, Any]) -> None:
        assert self._redis is not None
        side = trade.get("side") or "unknown"
        ts = trade.get("timestamp") or _now_ms()
        payload = json.dumps(
            {
                "instrument": instrument,
                "exchange": self.exchange_name,
                "ts": ts,
                "price": float(trade.get("price") or 0),
                "size": float(trade.get("amount") or 0),
                "side": side,
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
                "exchange": self.exchange_name,
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


def cli_entry() -> None:
    """
    Usage:
        EXCHANGE=coinbase ingest-ccxt BTC/USD ETH/USD SOL/USD
            or
        ingest-ccxt coinbase BTC/USD ETH/USD SOL/USD
    """
    import sys

    args = sys.argv[1:]
    exchange_env = os.getenv("EXCHANGE")

    if exchange_env:
        exchange = exchange_env
        symbols = args
    elif args and "/" not in args[0]:
        # First arg looks like an exchange name (no slash).
        exchange = args[0]
        symbols = args[1:]
    else:
        raise SystemExit(
            "EXCHANGE env var or first CLI arg required. "
            "Example: EXCHANGE=coinbase ingest-ccxt BTC/USD ETH/USD"
        )

    if not symbols:
        raise SystemExit("At least one symbol required, e.g. 'BTC/USDT'.")

    redis_url = os.getenv("REDIS_URL", "redis://localhost:6379")
    ob_depth = int(os.getenv("OB_DEPTH", str(OB_DEPTH)))

    logger.info("Starting %s ingestor for symbols: %s", exchange, symbols)
    ingestor = CCXTIngestor(
        exchange_name=exchange,
        symbols=symbols,
        redis_url=redis_url,
        ob_depth=ob_depth,
    )
    asyncio.run(ingestor.run())


if __name__ == "__main__":
    cli_entry()
