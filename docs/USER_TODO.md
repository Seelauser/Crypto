# What's Missing From You

The service runs end-to-end today. Crypto data ingest is live, dashboard is real, mobile works. The items below unlock additional capability — each is grouped by what it adds, with the exact env var, where to get the credential, and what stays broken without it.

Edit `/root/projects/orderflow/.env` on the server, then restart the relevant systemd unit (`systemctl restart orderflow-<unit>`).

---

## 1. Critical — actually unlock the product

These three give a real user a usable signup → notification flow. Without them, accounts work but you can't send a transactional email, the AI can't explain triggered signals, and no push notifications fire.

### 1.1 `ANTHROPIC_API_KEY` — AI explanations on every triggered signal ✅ DONE (2026-06-05)

Key installed and verified live. `pnpm verify:cache` passes 100% on all three
tiers (Haiku 4.5 / Sonnet 4.6 / Opus 4.7). Boot-time pre-warm fires on
`orderflow-notification-dispatcher` and `orderflow-daily-recap`.

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

Current state (2026-06-05):
- §1.1 ANTHROPIC_API_KEY — **set + verified ✅**
- §1.2 RESEND_API_KEY — empty
- §1.3 VAPID — empty
- §2.1 Stripe — empty
- §3 non-crypto data keys — all empty
- §4 Telegram — empty

---

## After all this, what I (Claude) still need to do

Once you've pasted the keys, ping me with which section(s) you set and I'll:

- Write the non-crypto ingest workers (3.1–3.3) if you want them shipped
- Run a paid Stripe checkout test through to a webhook-confirmed Pro upgrade
- Send a real email + Telegram + push notification through the dispatcher to validate end-to-end
- Sanity-check the dashboard renders with regime data populated for the new asset classes

---

## Engineering backlog — what's left, credential-free

E1–E6 (rate-limit, /api/auth/resend, CAGGs, OB retention, CVD persistence,
scan-worker) and **C1–C5 (all prompt-cache work)** all shipped through
sessions 22–25. The remaining items are quality / polish — see
[`NEXT_SESSION.md`](./NEXT_SESSION.md) §3B for the current picklist:

- **P6-1** — pino + correlation IDs across workers (~3h)
- **P6-3** — mobile audit /signals, /scans, /settings, /billing (~4h)
- **P6-4** — ESLint flat-config migration (~1h)
- **OrderFlowChart unified panes** (P5-6 from spec) — optional refactor (~4h)
- **rescue/llm-extraction-wip** — reconcile or close the branch (~1h)

Tell me **`work P6-1`** (or any of the above) and I'll pick it up.
