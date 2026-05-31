# orderflow-workers

Python 3.12 asyncio workers for OrderFlow Analytics — ingest, analytics, and trigger evaluation.

## Structure

```
src/
  ingest/
    binance.py        True L2 crypto ingest via CCXT Pro WebSocket
    alpaca.py         US stocks inferred data (Alpaca WS bar stream)
    oanda.py          Forex inferred data (OANDA v20 pricing stream)
    scan_worker.py    Asyncio scan runner — evaluates signals, publishes to Redis
  analytics/
    cvd.py            Cumulative Volume Delta + per-bar delta
    imbalance.py      Bid/ask imbalance (top-N and per-level)
    sweeps.py         Sweep + large print detection
    regime.py         3-state Gaussian HMM regime detector
    volume_profile.py VPOC / VAH / VAL volume profile
  triggers/
    evaluator.py      Trigger evaluation loop
tests/
  test_cvd.py
  test_imbalance.py
```

## Setup

```bash
# Install deps (requires uv)
uv sync

# Run tests
uv run pytest tests/

# Start ingest worker (crypto)
uv run python -m src.ingest.binance

# Start scan worker
uv run python -m src.ingest.scan_worker
```

## Data quality

- **[True L2]** — Crypto only (Binance CCXT Pro WebSocket order book)
- **[Inferred]** — Stocks, futures, forex, commodities (delta/CVD derived from OHLCV)

## Environment variables

| Variable | Description |
|---|---|
| `REDIS_URL` | Redis connection URL (default: `redis://localhost:6379`) |
| `DATABASE_URL` | PostgreSQL connection string |
| `ALPACA_API_KEY` | Alpaca API key (stocks ingest) |
| `ALPACA_API_SECRET` | Alpaca API secret |
| `OANDA_API_KEY` | OANDA v20 API key (forex ingest) |
| `OANDA_ACCOUNT_ID` | OANDA account ID |
