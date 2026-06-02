"""
Divergence publisher.

Reads bar data from TimescaleDB (ohlcv_bars hypertable), runs the divergence
detector across all tracked instruments, and publishes events to Redis so the
web dashboard can display them without a direct DB query on every page load.

Redis keys written
------------------
market:divergences
    A Redis list (LPUSH + LTRIM to 100) of JSON-serialised DivergenceEvent
    dicts. Newest events are at index 0. The web API reads LRANGE 0 19.

Usage
-----
Run as a background task or periodically (e.g. every 2 minutes) from the
main worker event loop.
"""

from __future__ import annotations

import asyncio
import dataclasses
import json
import logging
import os

import asyncpg
import redis.asyncio as aioredis
from dotenv import load_dotenv

from .divergence import detect_divergences

load_dotenv()

logger = logging.getLogger(__name__)

# Instruments to scan for divergences. Normalised symbol form (no slash)
# matches what binance.py publishes via _normalize_symbol(). Add more as
# ingest workers come online (Coinbase, Kraken).
TRACKED_INSTRUMENTS = [
    ("BTCUSDT", "binance"),
    ("ETHUSDT", "binance"),
    ("SOLUSDT", "binance"),
]

# How many bars of history to use for divergence detection.
LOOKBACK_BARS = 60
# Bar size in seconds (15-minute bars for divergence analysis).
BAR_SECONDS = 900


async def fetch_bars(
    conn: asyncpg.Connection,
    instrument: str,
    exchange: str,
    limit: int,
) -> List[dict]:
    """Fetch recent 15-minute bars with CVD from the TimescaleDB hypertable."""
    rows = await conn.fetch(
        """
        SELECT
            time_bucket('15 minutes', ts) AS ts_open,
            LAST(price, ts)               AS close,
            MAX(price)                    AS high,
            MIN(price)                    AS low,
            SUM(CASE WHEN side = 'buy'  THEN size ELSE 0 END) AS buy_volume,
            SUM(CASE WHEN side = 'sell' THEN size ELSE 0 END) AS sell_volume,
            SUM(CASE WHEN side = 'buy'  THEN size ELSE -size END) AS delta
        FROM market_ticks
        WHERE instrument = $1
          AND exchange   = $2
          AND ts >= NOW() - INTERVAL '24 hours'
        GROUP BY ts_open
        ORDER BY ts_open ASC
        LIMIT $3
        """,
        instrument,
        exchange,
        limit,
    )

    if not rows:
        return []

    # Compute running CVD from bar deltas
    bars: list[dict] = []
    running_cvd = 0.0
    for row in rows:
        delta = float(row["delta"] or 0)
        running_cvd += delta
        bars.append(
            {
                "ts_open": int(row["ts_open"].timestamp() * 1000),
                "close":   float(row["close"] or 0),
                "high":    float(row["high"]  or 0),
                "low":     float(row["low"]   or 0),
                "delta":   delta,
                "cvd":     running_cvd,
            }
        )
    return bars


async def run_divergence_scan(
    db_url: str,
    redis_url: str,
) -> None:
    """
    Full scan: fetch bars for all tracked instruments, detect divergences,
    publish results to Redis.
    """
    try:
        conn = await asyncpg.connect(db_url)
    except Exception as exc:
        logger.error("DB connection failed: %s", exc)
        return

    redis = aioredis.from_url(redis_url, decode_responses=True)

    try:
        all_events: list[dict] = []

        for instrument, exchange in TRACKED_INSTRUMENTS:
            try:
                bars = await fetch_bars(conn, instrument, exchange, LOOKBACK_BARS)
                if len(bars) < 10:
                    continue

                events = detect_divergences(bars, instrument=instrument, lookback=20)

                for ev in events:
                    all_events.append(dataclasses.asdict(ev))
            except Exception as exc:
                logger.warning("Divergence scan failed for %s: %s", instrument, exc)

        if not all_events:
            return

        # Sort newest-first; keep only the last 100.
        all_events.sort(key=lambda e: e["ts"], reverse=True)
        all_events = all_events[:100]

        # Replace the Redis list atomically using MULTI/EXEC pipeline.
        pipe = redis.pipeline()
        pipe.delete("market:divergences")
        for ev in all_events:
            pipe.rpush("market:divergences", json.dumps(ev))
        pipe.ltrim("market:divergences", 0, 99)
        await pipe.execute()

        logger.info("Published %d divergence events to Redis", len(all_events))

    finally:
        await conn.close()
        await redis.aclose()


async def run_divergence_loop(
    db_url: str,
    redis_url: str,
    interval_seconds: int = 120,
) -> None:
    """
    Long-running coroutine suitable for `asyncio.create_task()` in the main
    worker event loop.  Run once immediately, then repeat every
    `interval_seconds`.  Errors are logged and swallowed so the loop survives
    transient DB/Redis failures.
    """
    while True:
        try:
            await run_divergence_scan(db_url, redis_url)
        except Exception as exc:
            logger.error("Divergence scan loop error: %s", exc)
        await asyncio.sleep(interval_seconds)


async def main() -> None:
    db_url    = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/orderflow")
    redis_url = os.getenv("REDIS_URL",    "redis://localhost:6379")
    interval  = int(os.getenv("DIVERGENCE_SCAN_INTERVAL_SECONDS", "120"))

    logger.info("Starting divergence loop (interval=%ds)…", interval)
    await run_divergence_loop(db_url, redis_url, interval_seconds=interval)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(levelname)-8s  %(message)s")
    asyncio.run(main())
