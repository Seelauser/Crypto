# What's Missing From You

The service runs end-to-end today. Crypto data ingest is live, dashboard is real, mobile works. The items below unlock additional capability — each is grouped by what it adds, with the exact env var, where to get the credential, and what stays broken without it.

Edit `/root/projects/orderflow/.env` on the server, then restart the relevant systemd unit (`systemctl restart orderflow-<unit>`).

---

## 1. Critical — actually unlock the product

These three give a real user a usable signup → notification flow. Without them, accounts work but you can't send a transactional email, the AI can't explain triggered signals, and no push notifications fire.

### 1.1 `ANTHROPIC_API_KEY` — AI explanations on every triggered signal
- **Get it:** https://console.anthropic.com → API Keys → "Create Key". Name it `orderflow-prod`.
- **Cost:** Pay-per-token. With current Haiku/Sonnet routing + prompt caching, ~$0.01–$0.05 per active user per day.
- **Without it:** Signals fire and persist, but the dispatcher uses a fixed-string explanation instead of real AI narration. Users see a generic "Signal triggered" instead of "Sweep + 3x bid imbalance suggest short-term reversal at 69,500…"
- **After setting:** `systemctl restart orderflow-notification-dispatcher orderflow-web orderflow-api`

### 1.2 `RESEND_API_KEY` + `EMAIL_FROM` — email verification + signal emails
- **Get it:** https://resend.com → API Keys. Free tier = 3,000 emails/month.
- **Domain setup:** Add your sending domain to Resend, then publish the **SPF + DKIM + DMARC records** they show you in your DNS (Hostinger DNS panel for `orderflow-beast.com`). Without DKIM you'll go to spam.
- **Without it:** New accounts auto-activate without verification (graceful-degradation path). Signal-event emails silently no-op.
- **After setting:** `systemctl restart orderflow-web orderflow-notification-dispatcher`

### 1.3 `VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` + `VAPID_SUBJECT` — browser push
- **Generate them yourself:** `pnpm --dir apps/web exec web-push generate-vapid-keys`. Free — these are self-signed.
- `VAPID_SUBJECT` = a `mailto:` URL or your domain URL (e.g. `mailto:ops@orderflow-beast.com`).
- **Without it:** "Browser push" notification channel option in /settings does nothing.
- **After setting:** `systemctl restart orderflow-web orderflow-notification-dispatcher`

---

## 2. Revenue — turn it into a paid SaaS

### 2.1 Stripe (full set of 8 vars)
- **Get the keys:** https://dashboard.stripe.com/apikeys
  - `STRIPE_SECRET_KEY` = the live (or test) secret key
- **Create the products:** https://dashboard.stripe.com/products → one product per row below, save the resulting `price_xxx`:
  - `STRIPE_PRICE_PRO_MONTHLY` — Pro subscription, $X/mo
  - `STRIPE_PRICE_AI_METER` — metered AI usage
  - `STRIPE_PRICE_TOPUP_10` / `_25` / `_50` / `_100` — one-time top-ups
- **Webhook secret:** https://dashboard.stripe.com/webhooks → Add endpoint `https://orderflow-beast.com/api/billing/webhook`, subscribe to `customer.subscription.*` + `invoice.payment_succeeded` + `checkout.session.completed`. Copy the signing secret → `STRIPE_WEBHOOK_SECRET`.
- **Without it:** `/billing/upgrade` page renders but checkout will 500. All users stay on Free tier.
- **After setting:** `systemctl restart orderflow-web`

---

## 3. Non-crypto market data — stocks, futures, forex, commodities

Each asset class is currently shown as **"ingest pending"** on the dashboard (honest empty state). Adding a key alone is not enough — the worker also has to be written, ~1–2 hours each. The worker code is templated against the existing `apps/orderflow-workers/src/ingest/ccxt_ingest.py` pattern. Tell me which class(es) to ship and I'll write them.

### 3.1 US Stocks (free)
- **`ALPACA_KEY_ID` + `ALPACA_SECRET`** — https://alpaca.markets (free paper-trading + real-time data via WebSocket)
- **Worker status:** not yet written
- **Unlocks:** stocks dashboard tile, stock-instrument scans, AAPL/TSLA/SPY signal setups

### 3.2 Forex (free)
- **`OANDA_ACCOUNT_ID` + `OANDA_API_KEY`** — https://www.oanda.com → developer.oanda.com → API key
- **Worker status:** not yet written
- **Unlocks:** forex tile, EUR/USD setups

### 3.3 Futures + Commodities (paid)
- **`POLYGON_ADVANCED_KEY`** — https://polygon.io → "Stocks Advanced" or "Futures" plan ($199+/mo)
- **`DATABENTO_API_KEY`** — https://databento.com → pay-as-you-go (cheaper for low volume)
- **Worker status:** not yet written
- **Unlocks:** futures + commodities tiles, ES1!/GC1!/CL1! setups

### 3.4 Other equity data (optional fallbacks)
- `TWELVE_DATA_API_KEY`, `ALPHA_VANTAGE_API_KEY`, `FINNHUB_API_KEY`, `FRED_API_KEY` — free tiers, used for fundamental/macro overlays. Not blocking; skip unless you want them.

---

## 4. Notification channels (Pro tier)

### 4.1 `TELEGRAM_BOT_TOKEN` + `TELEGRAM_BOT_USERNAME`
- **Get it:** Open Telegram → search `@BotFather` → `/newbot` → follow prompts. The token looks like `123456:ABC-DEF…`.
- **Username:** the bot's `@handle` (without the `@`)
- **Webhook secret:** also set `TELEGRAM_WEBHOOK_SECRET` to any random hex string — Telegram passes it back so we can verify inbound updates.
- **Without it:** Telegram option in /settings → notification channels does nothing.
- **After setting:** `systemctl restart orderflow-notification-dispatcher orderflow-web` + run a one-time `setWebhook` call to point Telegram at `https://orderflow-beast.com/api/telegram/webhook`.

---

## 5. Growth / marketing

### 5.1 Susy X campaign content (manual, no env var)
- Two files in `/root/projects/orderflow/growth/` (added in commit `7cc2d71`):
  - `01_brand_profile.md` — paste into Susy X admin → Brand Profile
  - `02_campaign_briefings.md` — paste into Susy X admin → Campaign Briefings
- **Without it:** the `/try?utm_source=...` route works but nothing pushes traffic to it.
- **How:** Open https://susy-x.com/admin → respective sections.

---

## 6. Decisions only you can make

| Decision | Default if undecided | Why it's yours |
|---|---|---|
| Pricing for Pro / top-ups | Pro $X/mo, top-ups $10/$25/$50/$100 in `.env.example` | Market positioning + your margin target |
| Which asset classes to ship first | Crypto only (current state) | Free-keys-first (Alpaca, OANDA) gives the broadest coverage cheaply |
| When to flip on paid Polygon/Databento | Hold until 10+ paid Pro subs | $199/mo floor — needs revenue to justify |
| Whether to invite-only / open signup | Currently open signup | Open keeps growth-funnel simple; invite-only protects free-tier costs |
| `LIVE` flip on Susy X campaigns | Currently OFF (drafts only) | Susy X posts on your behalf — opt-in moment |

---

## Quick env audit

Run this to see which keys are still blank in `.env`:

```bash
grep -E '^[A-Z_]+=' /root/projects/orderflow/.env | awk -F= '$2=="" || $2=="\"\"" {print $1}'
```

Current state (2026-06-02): everything in sections 1–4 above is empty.

---

## After all this, what I (Claude) still need to do

Once you've pasted the keys, ping me with which section(s) you set and I'll:

- Write the non-crypto ingest workers (3.1–3.3) if you want them shipped
- Run a paid Stripe checkout test through to a webhook-confirmed Pro upgrade
- Send a real email + Telegram + push notification through the dispatcher to validate end-to-end
- Sanity-check the dashboard renders with regime data populated for the new asset classes

---

## Engineering backlog — things Claude can do *without* credentials

These came out of the as-built review documented in [`ARCHITECTURE.md`](./ARCHITECTURE.md) §10–11. None need a key from you — just give me the go-ahead.

| # | Item | Effort | Why it matters |
|---|---|---|---|
| E1 | Deploy `orderflow-scan-worker.service` (the worker exists at `apps/orderflow-workers/src/ingest/scan_worker.py` but has no systemd unit; scan jobs queue forever today) | ~30 min | The "Scans" product surface goes from broken → working |
| E2 | Move registration rate limit from in-memory Map → Redis | ~30 min | Trivially DoSable today; one restart wipes the limiter |
| E3 | Build `/api/auth/resend` route + UI button for verification email | ~1 h | If your first email gets lost, users have no recourse today |
| E4 | TimescaleDB continuous aggregates for `ohlcv_bars` (1m/5m/15m/1h) | ~3 h | Every `/bars` request currently re-runs `time_bucket` over raw ticks; caches make it ~10x faster |
| E5 | Retention policy on `order_book_snapshots` (e.g. 14 days) | ~10 min | Currently unbounded; ~600k rows in 30 days — becomes a problem in 6–12 months |
| E6 | Persist streaming CVD baselines every 60s | ~2 h | A `streaming.service` restart wipes running CVD totals |
| E7 | Per-page mobile audit (/signals, /scans, /settings, /billing, /markets) | ~4 h | Only `/dashboard` got the mobile-first treatment in session 19 |
| E8 | Migrate from `next lint` (deprecated) to ESLint flat config | ~1 h | Lint coverage is currently dropped in CI |

Tell me **`work E1`** (or whichever number) and I'll pick it up.
