"""
Footprint publisher.

Subscribes to ``market:ticks`` and builds per-bar footprint (bid/ask volume
per price level) for each instrument/exchange, flushing completed 5-minute
bars to the ``footprint_bars`` hypertable and publishing ``market:footprint``
for live consumers. Standalone — does NOT touch the streaming worker.

Each footprint bar row: OHLC + buy/sell volume + delta + a ``levels`` jsonb of
``{ "<price>": { "buy": x, "sell": y } }``.

Run:  python -m analytics.footprint_publisher
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from collections import defaultdict
from typing import Any

import asyncpg
import redis.asyncio as aioredis
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
)
logger = logging.getLogger("footprint_publisher")

TICKS_CHANNEL     = "market:ticks"
FOOTPRINT_CHANNEL = "market:footprint"
BAR_MS            = 5 * 60 * 1000     # 5-minute bars
TIMEFRAME         = "5m"
FLUSH_GRACE_MS    = 5_000            # flush a bar this long after its bucket ends
LEVEL_BPS         = 0.0001           # price-level granularity ≈ 1 basis point


def _bucket_start(ts_ms: int) -> int:
    return ts_ms - (ts_ms % BAR_MS)


def _price_level(price: float) -> float:
    step = max(price * LEVEL_BPS, 1e-9)
    return round(round(price / step) * step, 8)


class _Bar:
    __slots__ = ("open", "high", "low", "close", "buy_vol", "sell_vol", "levels", "last_ts")

    def __init__(self, price: float, ts_ms: int) -> None:
        self.open = self.high = self.low = self.close = price
        self.buy_vol = 0.0
        self.sell_vol = 0.0
        self.levels: dict[float, list[float]] = defaultdict(lambda: [0.0, 0.0])  # price -> [buy, sell]
        self.last_ts = ts_ms

    def update(self, price: float, size: float, side: str, ts_ms: int) -> None:
        self.high = max(self.high, price)
        self.low = min(self.low, price)
        self.close = price
        self.last_ts = ts_ms
        lvl = self.levels[_price_level(price)]
        if side == "sell":
            self.sell_vol += size
            lvl[1] += size
        else:  # buy / unknown → treat as buy-side aggressor
            self.buy_vol += size
            lvl[0] += size


class FootprintPublisher:
    def __init__(self, db_url: str, redis_url: str) -> None:
        self._db_url = db_url
        self._redis_url = redis_url
        # (instrument, exchange, bucket_start) -> _Bar
        self._bars: dict[tuple[str, str, int], _Bar] = {}
        self._pool: asyncpg.Pool | None = None
        self._redis: Any = None

    async def run(self) -> None:
        self._redis = aioredis.from_url(self._redis_url, decode_responses=True)
        try:
            self._pool = await asyncpg.create_pool(self._db_url, min_size=1, max_size=3)
        except Exception as exc:  # noqa: BLE001
            logger.error("DB pool failed (Redis-only): %s", exc)

        flusher = asyncio.create_task(self._flush_loop())
        pubsub = self._redis.pubsub()
        await pubsub.subscribe(TICKS_CHANNEL)
        logger.info("Footprint publisher subscribed to %s", TICKS_CHANNEL)
        try:
            async for msg in pubsub.listen():
                if msg.get("type") != "message":
                    continue
                try:
                    self._on_tick(json.loads(msg["data"]))
                except Exception as exc:  # noqa: BLE001
                    logger.debug("bad tick: %s", exc)
        finally:
            flusher.cancel()

    def _on_tick(self, p: dict[str, Any]) -> None:
        instrument = p["instrument"]
        exchange   = p["exchange"]
        ts_ms      = int(p["ts"])
        price      = float(p["price"])
        size       = float(p["size"])
        side       = p.get("side", "unknown")

        key = (instrument, exchange, _bucket_start(ts_ms))
        bar = self._bars.get(key)
        if bar is None:
            bar = _Bar(price, ts_ms)
            self._bars[key] = bar
        bar.update(price, size, side, ts_ms)

    async def _flush_loop(self) -> None:
        while True:
            await asyncio.sleep(10)
            try:
                await self._flush_completed()
            except Exception as exc:  # noqa: BLE001
                logger.error("flush error: %s", exc)

    async def _flush_completed(self) -> None:
        now = int(time.time() * 1000)
        done = [k for k in self._bars if k[2] + BAR_MS + FLUSH_GRACE_MS <= now]
        for key in done:
            instrument, exchange, bucket = key
            bar = self._bars.pop(key)
            levels = {f"{p:g}": {"buy": round(v[0], 8), "sell": round(v[1], 8)} for p, v in bar.levels.items()}
            delta = bar.buy_vol - bar.sell_vol
            payload = {
                "instrument": instrument, "exchange": exchange, "timeframe": TIMEFRAME,
                "ts": bucket, "open": bar.open, "high": bar.high, "low": bar.low, "close": bar.close,
                "buy_vol": bar.buy_vol, "sell_vol": bar.sell_vol, "delta": delta, "levels": levels,
            }
            # Publish live
            try:
                await self._redis.publish(FOOTPRINT_CHANNEL, json.dumps(payload))
            except Exception as exc:  # noqa: BLE001
                logger.error("redis publish failed: %s", exc)
            # Persist
            if self._pool is not None:
                try:
                    async with self._pool.acquire() as conn:
                        await conn.execute(
                            """
                            INSERT INTO footprint_bars
                              (ts, instrument, exchange, timeframe, open, high, low, close, buy_vol, sell_vol, delta, levels)
                            VALUES (to_timestamp($1/1000.0), $2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)
                            """,
                            bucket, instrument, exchange, TIMEFRAME,
                            bar.open, bar.high, bar.low, bar.close,
                            bar.buy_vol, bar.sell_vol, delta, json.dumps(levels),
                        )
                except Exception as exc:  # noqa: BLE001
                    logger.error("footprint insert failed (%s/%s): %s", instrument, exchange, exc)
            logger.info("flushed footprint %s/%s bucket=%d levels=%d delta=%.4f",
                        instrument, exchange, bucket, len(levels), delta)


async def main() -> None:
    db_url    = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/orderflow")
    redis_url = os.getenv("REDIS_URL",    "redis://localhost:6379")
    await FootprintPublisher(db_url, redis_url).run()


if __name__ == "__main__":
    asyncio.run(main())
