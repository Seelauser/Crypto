-- Run after prisma migrate to enable TimescaleDB hypertables

-- Enable extension (requires timescaledb installed)
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Market ticks hypertable
CREATE TABLE IF NOT EXISTS market_ticks (
  instrument  TEXT        NOT NULL,
  exchange    TEXT        NOT NULL,
  ts          TIMESTAMPTZ NOT NULL,
  price       NUMERIC(20,8) NOT NULL,
  size        NUMERIC(20,8) NOT NULL,
  side        TEXT        NOT NULL CHECK (side IN ('buy', 'sell', 'unknown')),
  trade_id    TEXT,
  PRIMARY KEY (instrument, exchange, ts)
);
SELECT create_hypertable('market_ticks', 'ts', if_not_exists => TRUE, chunk_time_interval => INTERVAL '1 day');
CREATE INDEX IF NOT EXISTS market_ticks_instrument_ts ON market_ticks (instrument, ts DESC);

-- Order book snapshots hypertable
CREATE TABLE IF NOT EXISTS order_book_snapshots (
  instrument  TEXT        NOT NULL,
  exchange    TEXT        NOT NULL,
  ts          TIMESTAMPTZ NOT NULL,
  bids        JSONB       NOT NULL,  -- [[price, size], ...]
  asks        JSONB       NOT NULL,
  PRIMARY KEY (instrument, exchange, ts)
);
SELECT create_hypertable('order_book_snapshots', 'ts', if_not_exists => TRUE, chunk_time_interval => INTERVAL '1 hour');

-- OHLCV bars hypertable (for inferred order flow on stocks/futures/forex)
CREATE TABLE IF NOT EXISTS ohlcv_bars (
  instrument  TEXT        NOT NULL,
  exchange    TEXT        NOT NULL,
  ts          TIMESTAMPTZ NOT NULL,
  timeframe   TEXT        NOT NULL,  -- 1m, 5m, 15m, 1h, 4h, 1d
  open        NUMERIC(20,8) NOT NULL,
  high        NUMERIC(20,8) NOT NULL,
  low         NUMERIC(20,8) NOT NULL,
  close       NUMERIC(20,8) NOT NULL,
  volume      NUMERIC(20,8) NOT NULL,
  delta       NUMERIC(20,8),         -- inferred: buy_vol - sell_vol
  cvd         NUMERIC(20,8),         -- cumulative volume delta
  PRIMARY KEY (instrument, exchange, timeframe, ts)
);
SELECT create_hypertable('ohlcv_bars', 'ts', if_not_exists => TRUE, chunk_time_interval => INTERVAL '7 days');
CREATE INDEX IF NOT EXISTS ohlcv_bars_instrument_tf_ts ON ohlcv_bars (instrument, timeframe, ts DESC);

-- Retention policies (keep 90 days of raw ticks, 1 year of OHLCV, 14 days of OB)
SELECT add_retention_policy('market_ticks', INTERVAL '90 days', if_not_exists => TRUE);
SELECT add_retention_policy('ohlcv_bars', INTERVAL '365 days', if_not_exists => TRUE);
SELECT add_retention_policy('order_book_snapshots', INTERVAL '14 days', if_not_exists => TRUE);

-- ──────────────────────────────────────────────────────────────────────────────
-- Continuous aggregates — pre-bucketed OHLCV + delta for the bars API
--
-- The /api/markets/[instrument]/bars route previously ran time_bucket() over
-- raw market_ticks on every request — at ~180k ticks/hour that's an unbounded
-- scan per chart load. These materialised views let the API query a tiny
-- pre-aggregated table and let Timescale schedule the heavy lifting in the
-- background.
--
-- Grouping is (bucket, instrument) — exchange dimension is intentionally
-- collapsed to match the existing route's behavior. Re-introduce per-exchange
-- views in Phase 3 when multi-exchange ingest lands.
-- ──────────────────────────────────────────────────────────────────────────────

CREATE MATERIALIZED VIEW IF NOT EXISTS ohlcv_1m
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 minute', ts) AS bucket,
  instrument,
  FIRST(price, ts)  AS open,
  MAX(price)        AS high,
  MIN(price)        AS low,
  LAST(price, ts)   AS close,
  SUM(size)         AS volume,
  SUM(CASE WHEN side='buy' THEN size WHEN side='sell' THEN -size ELSE 0 END) AS delta
FROM market_ticks
GROUP BY bucket, instrument
WITH NO DATA;

CREATE MATERIALIZED VIEW IF NOT EXISTS ohlcv_5m
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('5 minutes', ts) AS bucket,
  instrument,
  FIRST(price, ts)  AS open,
  MAX(price)        AS high,
  MIN(price)        AS low,
  LAST(price, ts)   AS close,
  SUM(size)         AS volume,
  SUM(CASE WHEN side='buy' THEN size WHEN side='sell' THEN -size ELSE 0 END) AS delta
FROM market_ticks
GROUP BY bucket, instrument
WITH NO DATA;

CREATE MATERIALIZED VIEW IF NOT EXISTS ohlcv_15m
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('15 minutes', ts) AS bucket,
  instrument,
  FIRST(price, ts)  AS open,
  MAX(price)        AS high,
  MIN(price)        AS low,
  LAST(price, ts)   AS close,
  SUM(size)         AS volume,
  SUM(CASE WHEN side='buy' THEN size WHEN side='sell' THEN -size ELSE 0 END) AS delta
FROM market_ticks
GROUP BY bucket, instrument
WITH NO DATA;

CREATE MATERIALIZED VIEW IF NOT EXISTS ohlcv_1h
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 hour', ts) AS bucket,
  instrument,
  FIRST(price, ts)  AS open,
  MAX(price)        AS high,
  MIN(price)        AS low,
  LAST(price, ts)   AS close,
  SUM(size)         AS volume,
  SUM(CASE WHEN side='buy' THEN size WHEN side='sell' THEN -size ELSE 0 END) AS delta
FROM market_ticks
GROUP BY bucket, instrument
WITH NO DATA;

-- Refresh policies: schedule cadence ≈ bucket size; end_offset is the
-- "freshness lag" — the most recent bucket falls behind by this much.
SELECT add_continuous_aggregate_policy('ohlcv_1m',
  start_offset      => INTERVAL '6 hours',
  end_offset        => INTERVAL '30 seconds',
  schedule_interval => INTERVAL '1 minute',
  if_not_exists     => TRUE);

SELECT add_continuous_aggregate_policy('ohlcv_5m',
  start_offset      => INTERVAL '1 day',
  end_offset        => INTERVAL '1 minute',
  schedule_interval => INTERVAL '5 minutes',
  if_not_exists     => TRUE);

SELECT add_continuous_aggregate_policy('ohlcv_15m',
  start_offset      => INTERVAL '7 days',
  end_offset        => INTERVAL '5 minutes',
  schedule_interval => INTERVAL '15 minutes',
  if_not_exists     => TRUE);

SELECT add_continuous_aggregate_policy('ohlcv_1h',
  start_offset      => INTERVAL '30 days',
  end_offset        => INTERVAL '15 minutes',
  schedule_interval => INTERVAL '1 hour',
  if_not_exists     => TRUE);
