"""
persistence.py

Subscribes to Redis pubsub channels published by the ingest workers
(`market:ticks`, `market:orderbook`) and bulk-inserts to TimescaleDB
hypertables (`market_ticks`, `order_book_snapshots`).

Run as a systemd unit alongside `ingest-binance` so live data also
accumulates as history. Without this worker, all market data is
ephemeral and dashboard charts have no rows to query.

Batching strategy:
- Buffer in-memory; flush every FLUSH_INTERVAL seconds OR when the
  buffer reaches FLUSH_BATCH rows, whichever comes first.
- Inserts use `ON CONFLICT (...) DO NOTHING` so duplicate snapshots
  (which Binance occasionally sends after reconnects) are silent.
- Order book snapshots are throttled per-instrument: at most one
  insert per OB_THROTTLE_MS to avoid bloating the hypertable with
  near-identical snapshots when Binance pushes diff updates at
  100ms cadence.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from typing import Any

import asyncpg
import redis.asyncio as redis

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

REDIS_URL    = os.getenv("REDIS_URL", "redis://localhost:6379")
DATABASE_URL = os.getenv("DATABASE_URL", "")

# Batching thresholds
FLUSH_INTERVAL = 1.0          # seconds — flush at least this often
TICK_BATCH     = 500          # rows — flush ticks when this many buffered
OB_BATCH       = 100          # rows — flush OB snapshots when this many buffered
OB_THROTTLE_MS = 1000         # at most one OB row per instrument per second

TICKS_CHANNEL     = "market:ticks"
ORDERBOOK_CHANNEL = "market:orderbook"

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logging.basicConfig(
    format="%(asctime)s  %(levelname)-8s  %(name)-20s  %(message)s",
    level=logging.INFO,
)
logger = logging.getLogger("ingest.persistence")


# ---------------------------------------------------------------------------
# Persistence worker
# ---------------------------------------------------------------------------


class PersistenceWorker:
    def __init__(self, redis_url: str, database_url: str) -> None:
        self._redis_url = redis_url
        self._db_url = self._normalize_db_url(database_url)

        self._tick_buf: list[tuple] = []
        self._ob_buf: list[tuple] = []
        self._last_ob_ts: dict[str, int] = {}  # instrument -> last ms inserted

        self._pool: asyncpg.Pool | None = None
        self._stop = asyncio.Event()

        # Stats
        self._stats = {"ticks_in": 0, "ticks_written": 0, "ob_in": 0, "ob_written": 0, "ob_skipped": 0}

    @staticmethod
    def _normalize_db_url(url: str) -> str:
        # asyncpg doesn't accept the `postgres://` scheme reliably; canonicalise.
        if url.startswith("postgres://"):
            return "postgresql://" + url[len("postgres://"):]
        return url

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def run(self) -> None:
        if not self._db_url:
            raise RuntimeError("DATABASE_URL is empty — cannot persist")

        self._pool = await asyncpg.create_pool(
            self._db_url,
            min_size=1,
            max_size=4,
            command_timeout=30,
        )
        logger.info("Connected to TimescaleDB pool (min=1, max=4)")

        r = redis.from_url(self._redis_url, decode_responses=True)
        pubsub = r.pubsub()
        await pubsub.subscribe(TICKS_CHANNEL, ORDERBOOK_CHANNEL)
        logger.info("Subscribed to: %s, %s", TICKS_CHANNEL, ORDERBOOK_CHANNEL)

        flusher = asyncio.create_task(self._flush_loop())
        stats   = asyncio.create_task(self._stats_loop())

        try:
            async for msg in pubsub.listen():
                if msg.get("type") != "message":
                    continue
                channel = msg["channel"]
                try:
                    payload = json.loads(msg["data"])
                except (json.JSONDecodeError, TypeError):
                    logger.warning("Bad payload on %s, skipping", channel)
                    continue

                if channel == TICKS_CHANNEL:
                    self._enqueue_tick(payload)
                elif channel == ORDERBOOK_CHANNEL:
                    self._enqueue_ob(payload)

                # Opportunistic flush on threshold
                if len(self._tick_buf) >= TICK_BATCH:
                    await self._flush_ticks()
                if len(self._ob_buf) >= OB_BATCH:
                    await self._flush_ob()
        finally:
            self._stop.set()
            await flusher
            await stats
            await self._flush_ticks()
            await self._flush_ob()
            await pubsub.unsubscribe()
            await r.close()
            await self._pool.close()
            logger.info("Persistence worker stopped cleanly")

    # ------------------------------------------------------------------
    # Buffer enqueue
    # ------------------------------------------------------------------

    def _enqueue_tick(self, p: dict[str, Any]) -> None:
        self._stats["ticks_in"] += 1
        try:
            ts_ms = int(p["ts"])
            self._tick_buf.append((
                p["instrument"],
                p["exchange"],
                ts_ms,
                str(p["price"]),
                str(p["size"]),
                p.get("side", "unknown"),
                p.get("trade_id"),
            ))
        except (KeyError, TypeError, ValueError) as e:
            logger.warning("Bad tick payload: %s — %s", e, p)

    def _enqueue_ob(self, p: dict[str, Any]) -> None:
        self._stats["ob_in"] += 1
        try:
            instrument = p["instrument"]
            ts_ms = int(p["ts"])
            # Throttle: skip if we already inserted one within OB_THROTTLE_MS
            last = self._last_ob_ts.get(instrument, 0)
            if ts_ms - last < OB_THROTTLE_MS:
                self._stats["ob_skipped"] += 1
                return
            self._last_ob_ts[instrument] = ts_ms
            self._ob_buf.append((
                instrument,
                p["exchange"],
                ts_ms,
                json.dumps(p["bids"]),
                json.dumps(p["asks"]),
            ))
        except (KeyError, TypeError, ValueError) as e:
            logger.warning("Bad OB payload: %s — %s", e, p)

    # ------------------------------------------------------------------
    # Periodic flush loop
    # ------------------------------------------------------------------

    async def _flush_loop(self) -> None:
        while not self._stop.is_set():
            try:
                await asyncio.wait_for(self._stop.wait(), timeout=FLUSH_INTERVAL)
            except asyncio.TimeoutError:
                pass
            await self._flush_ticks()
            await self._flush_ob()

    async def _flush_ticks(self) -> None:
        if not self._tick_buf or self._pool is None:
            return
        batch, self._tick_buf = self._tick_buf, []
        try:
            async with self._pool.acquire() as con:
                await con.executemany(
                    """
                    INSERT INTO market_ticks
                      (instrument, exchange, ts, price, size, side, trade_id)
                    VALUES
                      ($1, $2, to_timestamp($3 / 1000.0), $4::numeric, $5::numeric, $6, $7)
                    ON CONFLICT (instrument, exchange, ts) DO NOTHING
                    """,
                    batch,
                )
            self._stats["ticks_written"] += len(batch)
        except Exception as e:
            logger.error("tick flush failed (%d rows): %s", len(batch), e)

    async def _flush_ob(self) -> None:
        if not self._ob_buf or self._pool is None:
            return
        batch, self._ob_buf = self._ob_buf, []
        try:
            async with self._pool.acquire() as con:
                await con.executemany(
                    """
                    INSERT INTO order_book_snapshots
                      (instrument, exchange, ts, bids, asks)
                    VALUES
                      ($1, $2, to_timestamp($3 / 1000.0), $4::jsonb, $5::jsonb)
                    ON CONFLICT (instrument, exchange, ts) DO NOTHING
                    """,
                    batch,
                )
            self._stats["ob_written"] += len(batch)
        except Exception as e:
            logger.error("OB flush failed (%d rows): %s", len(batch), e)

    # ------------------------------------------------------------------
    # Periodic stats
    # ------------------------------------------------------------------

    async def _stats_loop(self) -> None:
        while not self._stop.is_set():
            try:
                await asyncio.wait_for(self._stop.wait(), timeout=30.0)
            except asyncio.TimeoutError:
                pass
            s = self._stats
            logger.info(
                "stats — ticks: in=%d written=%d | OB: in=%d written=%d skipped=%d",
                s["ticks_in"], s["ticks_written"],
                s["ob_in"], s["ob_written"], s["ob_skipped"],
            )


# ---------------------------------------------------------------------------
# Entry-point
# ---------------------------------------------------------------------------


async def main() -> None:
    worker = PersistenceWorker(REDIS_URL, DATABASE_URL)
    await worker.run()


if __name__ == "__main__":
    asyncio.run(main())
