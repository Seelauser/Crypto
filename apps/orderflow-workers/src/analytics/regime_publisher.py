"""
Regime publisher.

Fits the HMM regime detector against recent 1-minute bars for each tracked
crypto instrument and writes a per-asset-class summary to Redis. The web
dashboard reads `market:regime` to render the CVD-direction tiles' regime
chip.

Redis keys written
------------------
market:regime
    Hash. One field per asset class. Value is JSON:
    {regime, confidence, instrument, ts}

Per asset class the publisher picks the highest-confidence prediction
across the asset class's lead instruments — so the chip reflects the
strongest signal rather than the alphabetical-first instrument.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
from typing import List, Optional, Tuple

import asyncpg
import redis.asyncio as aioredis
from dotenv import load_dotenv

from analytics.regime import RegimeDetector, RegimeState

load_dotenv()

logger = logging.getLogger(__name__)

# Per-asset-class instruments to fit. First entry is the canonical
# representative; the others are used to break ties / improve coverage.
ASSET_INSTRUMENTS: dict[str, list[tuple[str, str]]] = {
    "crypto": [
        ("BTCUSDT", "binance"),
        ("ETHUSDT", "binance"),
        ("SOLUSDT", "binance"),
    ],
    # stocks / futures / forex / commodities / resources have no ingest
    # worker yet — populate as those come online.
}

# 1-minute bars: 30 bars = 30 minutes of history, the HMM's MIN_BARS_FIT.
# 120 = 2 hours of context for a stable Viterbi sequence.
BAR_SECONDS = 60
LOOKBACK_BARS = 120


async def fetch_bars(
    conn: asyncpg.Connection,
    instrument: str,
    exchange: str,
    limit: int,
) -> List[dict]:
    """
    Fetch the last `limit` 1-minute bars for a given instrument/exchange
    from the market_ticks hypertable. Each bar has buy/sell volume and
    running CVD computed on the fly so the regime detector gets the
    feature shape it expects.
    """
    rows = await conn.fetch(
        """
        SELECT
            time_bucket('1 minute', ts) AS ts_open,
            LAST(price, ts)             AS close,
            MAX(price)                  AS high,
            MIN(price)                  AS low,
            SUM(size)                   AS volume,
            SUM(CASE WHEN side = 'buy'  THEN size ELSE 0 END) AS buy_volume,
            SUM(CASE WHEN side = 'sell' THEN size ELSE 0 END) AS sell_volume,
            SUM(CASE WHEN side = 'buy'  THEN size ELSE -size END) AS delta
        FROM market_ticks
        WHERE instrument = $1
          AND exchange   = $2
          AND ts >= NOW() - ($3 * INTERVAL '1 minute')
        GROUP BY ts_open
        ORDER BY ts_open ASC
        """,
        instrument,
        exchange,
        limit,
    )

    bars: list[dict] = []
    running_cvd = 0.0
    for row in rows:
        delta = float(row["delta"] or 0.0)
        running_cvd += delta
        bars.append(
            {
                "instrument": instrument,
                "ts":         int(row["ts_open"].timestamp() * 1000),
                "close":      float(row["close"]  or 0.0),
                "high":       float(row["high"]   or 0.0),
                "low":        float(row["low"]    or 0.0),
                "volume":     float(row["volume"] or 0.0),
                "buy_volume": float(row["buy_volume"]  or 0.0),
                "sell_volume":float(row["sell_volume"] or 0.0),
                "delta":      delta,
                "cvd":        running_cvd,
            }
        )
    return bars


async def detect_for_instrument(
    conn: asyncpg.Connection,
    instrument: str,
    exchange: str,
) -> Optional[RegimeState]:
    """Fit + predict regime for one instrument. Returns None if insufficient data."""
    bars = await fetch_bars(conn, instrument, exchange, LOOKBACK_BARS)
    if len(bars) < 30:
        logger.debug("Skip %s: only %d bars (need ≥30)", instrument, len(bars))
        return None

    detector = RegimeDetector(n_components=3, lookback=LOOKBACK_BARS)
    if not detector.fit(bars):
        return None
    return detector.predict(bars)


async def run_regime_scan(db_url: str, redis_url: str) -> None:
    """One scan pass — fit all asset classes, write best result per class to Redis."""
    try:
        conn = await asyncpg.connect(db_url)
    except Exception as exc:
        logger.error("DB connection failed: %s", exc)
        return

    redis = aioredis.from_url(redis_url, decode_responses=True)
    try:
        for asset_class, instruments in ASSET_INSTRUMENTS.items():
            best: Optional[RegimeState] = None
            for instrument, exchange in instruments:
                try:
                    state = await detect_for_instrument(conn, instrument, exchange)
                except Exception as exc:
                    logger.warning("regime fit failed %s/%s: %s", instrument, exchange, exc)
                    continue
                if state is None:
                    continue
                if best is None or state.confidence > best.confidence:
                    best = state

            if best is None:
                logger.info("No regime for asset_class=%s (insufficient data)", asset_class)
                continue

            payload = {
                "regime":     best.regime,
                "confidence": best.confidence,
                "instrument": best.instrument,
                "ts":         best.ts,
            }
            await redis.hset("market:regime", asset_class, json.dumps(payload))
            logger.info(
                "Published %s regime: %s (conf=%.2f, instrument=%s)",
                asset_class, best.regime, best.confidence, best.instrument,
            )
    finally:
        await conn.close()
        await redis.aclose()


async def run_regime_loop(db_url: str, redis_url: str, interval_seconds: int) -> None:
    """Long-running coroutine. Re-scans every interval_seconds, errors swallowed."""
    while True:
        try:
            await run_regime_scan(db_url, redis_url)
        except Exception as exc:
            logger.error("regime scan error: %s", exc)
        await asyncio.sleep(interval_seconds)


async def main() -> None:
    db_url    = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/orderflow")
    redis_url = os.getenv("REDIS_URL",    "redis://localhost:6379")
    interval  = int(os.getenv("REGIME_SCAN_INTERVAL_SECONDS", "60"))

    logger.info("Starting regime loop (interval=%ds, bars=%d×%ds)…", interval, LOOKBACK_BARS, BAR_SECONDS)
    await run_regime_loop(db_url, redis_url, interval_seconds=interval)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(levelname)-8s  %(message)s")
    asyncio.run(main())
