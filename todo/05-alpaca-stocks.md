# 05 — Alpaca (US Stocks)

**Unlocks:** Stocks dashboard tile + stock-instrument signal setups (AAPL, TSLA, SPY, NVDA, …).
**Currently:** Dashboard tile shows "ingest pending". Tile + scans for stocks return no data.

**Time:** 5 min for keys. **Then ping Claude** — the worker still needs to be written (~1 hr).

## Steps

1. Open https://alpaca.markets → "Get started for free" → sign up.
2. After signup: Dashboard → "API Keys" (top right).
3. Generate keys for **Paper Trading** (sufficient for real-time market data; no real money). Copy:
   - `Key ID` → `ALPACA_KEY_ID`
   - `Secret Key` → `ALPACA_SECRET`

4. Paste into `.env`:
   ```bash
   nano /srv/projects/orderflow/.env
   ```
   ```
   ALPACA_KEY_ID=…
   ALPACA_SECRET=…
   ```

5. **Do NOT restart anything yet.** The ingest worker doesn't exist — restarting won't pick up stocks data.

## What Claude does next

Ping me with **`done with 05`** and I'll:

1. Write `apps/orderflow-workers/src/ingest/alpaca.py` (clone of binance.py adapted for Alpaca SDK).
2. Create `/etc/systemd/system/orderflow-ingest-alpaca.service`.
3. Add `"stocks"` to `ASSET_INSTRUMENTS` in `regime_publisher.py` with `AAPL, SPY, QQQ` as the lead instruments.
4. Verify the stocks tile lights up on the dashboard.

## Cost

Alpaca's IEX-feed real-time data is **free** with any account. Their "SIP" feed (full coverage) is $99/mo — defer until you're sure you need it; IEX covers ~3% of NMS volume but ticks well enough for order-flow signals.
