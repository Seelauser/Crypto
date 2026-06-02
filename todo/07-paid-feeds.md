# 07 — Paid Feeds (Futures + Commodities)

**Unlocks:** Futures + Commodities + Resources dashboard tiles. Real US-equity options + futures order-flow data.
**Currently:** Three dashboard tiles show "ingest pending".

**⚠️ Paid.** Do not buy until you have evidence of paid demand (Pro signups). Default recommendation: defer until 10+ paid subscriptions.

## Two options

### Option A — Polygon.io ($199/mo, best coverage)

1. https://polygon.io → "Stocks Advanced" plan ($199/mo) or "Futures" plan.
2. Dashboard → API Keys → copy the key.
3. `.env`:
   ```
   POLYGON_ADVANCED_KEY=…
   ```

### Option B — Databento (pay-as-you-go, cheaper for low volume)

1. https://databento.com → sign up → fund account ($10 minimum).
2. Generate API key.
3. `.env`:
   ```
   DATABENTO_API_KEY=…
   ```

## What Claude does next

Ping me with **`done with 07 — using polygon`** (or `databento`) and I'll:

1. Write the appropriate ingestor (`apps/orderflow-workers/src/ingest/polygon.py` or `databento.py`).
2. Configure the relevant venue-symbol mappings (ES1!, NQ1!, GC1!, CL1!, …).
3. Create the systemd units.
4. Update `ASSET_INSTRUMENTS` in `regime_publisher.py` for `futures`, `commodities`, `resources`.

## Cost guard

I'll wire a hard kill-switch env var (`DAILY_INGEST_COST_CEILING_CENTS`) so the worker exits if it bills past your daily cap. Tell me your cap when you ping me.
