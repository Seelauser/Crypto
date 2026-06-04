"""
Derivatives publisher.

Polls Binance USD-M futures for funding rate, mark price and open interest
(all keyless REST endpoints via CCXT) every N seconds and:
  - writes a per-instrument summary to the Redis hash ``market:derivatives``
    (consumed by the chart's derivatives pane + the funding_extreme trigger),
  - publishes each update to ``market:derivatives_update`` for live fan-out,
  - persists each metric to the ``derivatives_metrics`` hypertable.

Liquidations (``liquidation_approach`` trigger) need the raw forceOrder WS
stream, which CCXT does not expose — added separately when CoinGlass or a raw
binance futures socket is wired.

Run:  python -m analytics.derivatives_publisher
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time

import asyncpg
import ccxt.async_support as ccxt
import redis.asyncio as aioredis
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
)
logger = logging.getLogger("derivatives_publisher")

# (CCXT symbol, normalised instrument)
SYMBOLS: list[tuple[str, str]] = [
    ("BTC/USDT", "BTCUSDT"),
    ("ETH/USDT", "ETHUSDT"),
    ("SOL/USDT", "SOLUSDT"),
]
SOURCE   = "binance"
HASH_KEY = "market:derivatives"
CHANNEL  = "market:derivatives_update"


async def poll_once(exchange, conn: asyncpg.Connection | None, redis) -> None:
    for ccxt_sym, instrument in SYMBOLS:
        try:
            fr = await exchange.fetch_funding_rate(ccxt_sym)
            oi = await exchange.fetch_open_interest(ccxt_sym)
        except Exception as exc:  # noqa: BLE001
            logger.warning("fetch failed for %s: %s", instrument, exc)
            continue

        funding = fr.get("fundingRate")
        mark    = fr.get("markPrice")
        oi_amt  = oi.get("openInterestAmount") or oi.get("openInterestValue")
        ts      = int(time.time() * 1000)

        payload = {
            "instrument":    instrument,
            "funding_rate":  funding,
            "mark_price":    mark,
            "open_interest": oi_amt,
            "ts":            ts,
        }

        try:
            await redis.hset(HASH_KEY, instrument, json.dumps(payload))
            await redis.publish(CHANNEL, json.dumps(payload))
        except Exception as exc:  # noqa: BLE001
            logger.error("redis write failed for %s: %s", instrument, exc)

        if conn is not None:
            metrics = []
            if funding is not None: metrics.append(("funding_rate", float(funding)))
            if mark    is not None: metrics.append(("mark_price",   float(mark)))
            if oi_amt  is not None: metrics.append(("open_interest", float(oi_amt)))
            for metric, value in metrics:
                try:
                    await conn.execute(
                        """
                        INSERT INTO derivatives_metrics (ts, instrument, source, metric, value, metadata)
                        VALUES (now(), $1, $2, $3, $4, $5::jsonb)
                        """,
                        instrument, SOURCE, metric, value, "{}",
                    )
                except Exception as exc:  # noqa: BLE001
                    logger.error("db insert failed (%s/%s): %s", instrument, metric, exc)

        logger.info("%s funding=%s mark=%s oi=%s", instrument, funding, mark, oi_amt)


async def run_loop(db_url: str, redis_url: str, interval_seconds: int) -> None:
    exchange = ccxt.binanceusdm({"enableRateLimit": True})
    redis = aioredis.from_url(redis_url, decode_responses=True)
    conn: asyncpg.Connection | None = None
    try:
        conn = await asyncpg.connect(db_url)
    except Exception as exc:  # noqa: BLE001
        logger.error("DB connection failed (continuing, Redis-only): %s", exc)

    logger.info("Starting derivatives loop (interval=%ds) for %s", interval_seconds, [s[1] for s in SYMBOLS])
    try:
        while True:
            try:
                await poll_once(exchange, conn, redis)
            except Exception as exc:  # noqa: BLE001
                logger.error("poll cycle error: %s", exc)
            await asyncio.sleep(interval_seconds)
    finally:
        await exchange.close()
        if conn is not None:
            await conn.close()


async def main() -> None:
    db_url    = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/orderflow")
    redis_url = os.getenv("REDIS_URL",    "redis://localhost:6379")
    interval  = int(os.getenv("DERIVATIVES_INTERVAL_SECONDS", "30"))
    await run_loop(db_url, redis_url, interval_seconds=interval)


if __name__ == "__main__":
    asyncio.run(main())
