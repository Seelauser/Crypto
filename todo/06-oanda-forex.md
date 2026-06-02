# 06 — OANDA (Forex)

**Unlocks:** Forex dashboard tile + forex signal setups (EUR/USD, GBP/USD, USD/JPY, …).
**Currently:** Dashboard tile shows "ingest pending".

**Time:** 5 min for keys. **Then ping Claude** — the worker still needs to be written (~1 hr).

## Steps

1. Open https://www.oanda.com → "Open an account" → choose a **demo account** (free, no funding required).
2. After signup: https://developer.oanda.com/ → log in with the same credentials.
3. "Manage API Access" → generate a personal access token. Copy it.
4. Note your **account ID** (looks like `101-001-12345678-001`) from the Manage Funds page.

5. Paste into `.env`:
   ```bash
   nano /root/projects/orderflow/.env
   ```
   ```
   OANDA_ACCOUNT_ID=101-001-…
   OANDA_API_KEY=…
   ```

6. **Do NOT restart anything yet.** Worker doesn't exist yet.

## What Claude does next

Ping me with **`done with 06`** and I'll:

1. Write `apps/orderflow-workers/src/ingest/oanda.py` (uses OANDA's v20 streaming endpoint).
2. Create `/etc/systemd/system/orderflow-ingest-oanda.service`.
3. Add `"forex"` to `ASSET_INSTRUMENTS` in `regime_publisher.py` with `EUR_USD, GBP_USD, USD_JPY` as the lead instruments.
4. Verify the forex tile lights up + a EUR/USD signal setup can be created.

## Cost

OANDA's streaming pricing API is free with a demo account. Production trades cost the spread; you're only using it for market data here, so $0.
