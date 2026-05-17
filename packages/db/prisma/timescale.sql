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

-- Retention policies (keep 90 days of raw ticks, 1 year of OHLCV)
SELECT add_retention_policy('market_ticks', INTERVAL '90 days', if_not_exists => TRUE);
SELECT add_retention_policy('ohlcv_bars', INTERVAL '365 days', if_not_exists => TRUE);
