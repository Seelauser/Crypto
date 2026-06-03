# OrderFlow Beast — How It Actually Works

**As-built reference, 2026-06-03.** Live at https://orderflow-beast.com.

This document describes the system as it runs in production *today* —
what flows where, what is real vs synthetic, what is wired vs stubbed.
Use it as the basis for deciding where to invest next. Companion docs:
[CLAUDE.md](../CLAUDE.md) (developer reference) and
[OPERATIONS.md](./OPERATIONS.md) (runbook).

---

## 1. System at a glance

```
                         ┌────────────────────┐
                         │  Browser (Next 15) │
                         └─────────┬──────────┘
                                   │ HTTPS + WS
                       ┌───────────┴───────────┐
                       │                       │
              ┌────────▼────────┐    ┌─────────▼─────────┐
              │  Next.js :3100  │    │  WS Gateway :4001 │
              │   (web app)     │    │  (Redis fan-out)  │
              └────┬──────┬─────┘    └─────────▲─────────┘
                   │      │                    │
                   │      └─► Fastify API :4000│
                   │                  │        │
                   ▼                  ▼        │
         ┌──────────────┐    ┌──────────────┐  │
         │ Postgres 16  │    │  Redis 7     │──┘
         │ + Timescale  │    │  (pubsub +   │
         │ on :5433     │    │  BullMQ +    │
         └──────▲───────┘    │  rate-limit) │
                │            └──┬───────────┘
                │  writes       │ ticks / OB / signals
                │            ┌──┴───────────┐
                │            │  Python      │
                │            │  workers     │
                │            │  (ingest +   │
                │            │  streaming + │
                │            │  triggers +  │
                │            │  publishers) │
                │            └──┬───────────┘
                │               │
                └───────────────┘
                  persistence + reads
```

13 systemd units run today (12 services + 1 timer). See
[OPERATIONS.md §1](./OPERATIONS.md) for the table.

**Two stateless processes face users** (Next.js, WS gateway). **One DB-
facing API** (Fastify). **Everything else is a background worker** that
talks via Redis. No service-to-service HTTP except evaluator → API for
trigger events.

---

## 2. The live crypto data path (BTC / ETH / SOL)

This is the only **fully real** path in the system today.

```
Binance / Coinbase / Kraken (CCXT Pro WebSocket)
        │
        ▼
  ingest-{binance,coinbase,kraken}.service
        │  PUBLISH market:ticks
        │  PUBLISH market:orderbook   (1 / instrument / sec, throttled)
        ▼
   ┌──────────────────────────┬──────────────────────┐
   ▼                          ▼                      ▼
 persistence.service     streaming.service     ws-gateway.service
   │                          │                      │
   ▼                          │  PUBLISH             │  WS push to
 TimescaleDB                  │   market:cvd_update  │  subscribed
 hypertables:                 │   market:large_print │  browser clients
  market_ticks                │   market:sweep_detected
  order_book_snapshots        │   market:imbalance_update
                              ▼
                       trigger-evaluator.service
                              │
                              │  PUBLISH signal:triggered:<userId>
                              ▼
                       notification-dispatcher.service
                              │
                              ▼
                       email / push / telegram / webhook
                       (each silently no-ops if creds missing)
```

**Files involved (in order):**
- `apps/orderflow-workers/src/ingest/binance.py` — CCXT Pro client, auto-reconnect
- `apps/orderflow-workers/src/ingest/ccxt_ingest.py` — generic worker for Coinbase + Kraken (selected via `EXCHANGE` env)
- `apps/orderflow-workers/src/ingest/persistence.py` — buffer + bulk `INSERT … ON CONFLICT DO NOTHING` into hypertables
- `apps/orderflow-workers/src/analytics/streaming.py` — per-instrument rolling CVD + imbalance + sweep detection
- `apps/ws-gateway/src/index.ts` — Redis → WebSocket fan-out
- `apps/web/src/lib/ws.ts` — client-side `useMarketSocket`, `useCvdStream`, `useInstrumentTick`
- `apps/web/src/components/dashboard/LiveCvdGrid.tsx` — tile renderer

**Observed cadence in prod (2026-06-03):**
| Channel | Rate |
|---|---|
| `market:ticks` (Binance per pair) | 3–5 / sec |
| `market:orderbook` | 1 / instrument / sec |
| `market:cvd_update` | 1 / instrument / sec |
| `market:large_print` | bursty; threshold ≥ $50k notional |

TimescaleDB has ~19M ticks and ~600k OB snapshots persisted.

---

## 3. The "everything else" data path (stocks / forex / futures / commodities / resources)

Five of the six asset classes the product page advertises **do not have a
live ingest worker**. The display layer compensates with a **synthetic
fallback** in the bars API.

- `apps/web/src/app/api/markets/[instrument]/bars/route.ts`
  - line 79–190: real query — `time_bucket('${tf}', ts)` over `market_ticks`
  - line 192–270: `generateSyntheticBars()` — geometric-Brownian-motion fake series seeded from `INSTRUMENT_SEEDS` (line 7)
  - line 279–293: tries real first, drops to synthetic on empty/error
  - response includes `source: 'live' | 'synthetic'` — honest at the API layer

This means **a request for AAPL or EURUSD bars today returns synthetic
data**, and the UI surfaces an "ingest pending" banner. The graceful-
degradation is intentional, but it is a feature gap, not a feature.

What's needed to make these real:
- `apps/orderflow-workers/src/ingest/alpaca.py` — code-complete, no systemd unit, no `ALPACA_API_KEY`
- `apps/orderflow-workers/src/ingest/oanda.py` — same
- Futures / commodities — no worker file yet (planned: Polygon or Databento)

---

## 4. Signal pipeline (the product's core value)

A **Signal Setup** is the central user-owned object. Free users get 3,
Pro users unlimited.

**Schema** (`packages/db/prisma/schema.prisma` lines 123–142):
```
SignalSetup {
  triggerConfig         JSON      // trigger type + thresholds
  instruments           String[]
  notificationChannels  String[]
  cooldownMinutes       Int  @default(15)
  activeHours           Json?     // optional time window
  status                String    // armed | paused | archived
}
```

**Trigger types currently supported** (`apps/orderflow-workers/src/triggers/evaluator.py` lines 110–150):
- `cvd_cross` — CVD crosses a threshold
- `bid_ask_imbalance` — top-5 imbalance ratio crosses threshold
- `large_print` — single trade ≥ size threshold
- `sweep` — sweep-detected event from `streaming.py`

**Evaluation loop** (`evaluator.py` lines 200–400):
1. Subscribes `market:ticks`, `market:cvd_update`, `market:large_print`, `market:sweep_detected`
2. Holds in-memory state per instrument (last_price, CVD, imbalance)
3. Reloads active `SignalSetup` rows from DB every 30s (TTL cache)
4. On each market event, walks the setups for that instrument, evaluates trigger
5. If fired and cooldown key `signal:cooldown:<setup_id>:<instrument>` is unset → PUBLISH `signal:triggered:<userId>` + set cooldown TTL

**Notification dispatch** (`apps/workers/notification-dispatcher.ts`):
1. Subscribes `signal:triggered`
2. Calls LLM router (`apps/api/src/llm/router.ts`) for an AI explanation
   - Free user or balance = 0 → Haiku 4.5 (10 calls/day quota)
   - Pro user with balance > 0 → Sonnet 4.6
   - System prompt has `cache_control: ephemeral` (prompt caching on)
3. Persists `signal_events` + `llm_calls` rows; debits `token_ledger.balance_cents`
4. Fans out to configured channels — each in try/catch, silent no-op if creds missing

**Channels — wired vs stubbed in prod today:**
| Channel | Wired? | Blocking secret |
|---|---|---|
| Email (Resend) | code wired, key absent → no-op | `RESEND_API_KEY` |
| Browser push (VAPID) | code wired, key absent → no-op | `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` |
| Telegram | code wired, token absent → no-op | `TELEGRAM_BOT_TOKEN` |
| Webhook | wired, Pro-only gate enforced | n/a (user provides URL) |

So **signals fire and persist, but no user ever hears about them today
unless they have a webhook configured.** This is the single biggest gap
between "running" and "useful."

---

## 5. Scans (the second product surface)

**A Scan is** a one-off filter run against current per-instrument market
state in Redis (e.g., "CVD > 500 AND large_print in last 10s, across
crypto majors").

Path:
1. `POST /api/scans/` (`apps/web/src/app/api/scans/route.ts`) → enqueues to BullMQ stream `bull:scans:wait`, inserts `Scan` row with `status='pending'`
2. **Consumer worker:** `apps/orderflow-workers/src/ingest/scan_worker.py` — code complete (lines 67–300+) — **but no `orderflow-scan-worker.service` exists.** `ls /etc/systemd/system/orderflow-*` confirms the unit is missing.

**Net effect: scans queue forever.** UI shows `pending` indefinitely.

This is the lowest-effort fix in the system — write a 20-line systemd
unit file, `daemon-reload`, `enable --now`, and Scans goes from
"product feature listed in the docs" to "actually works."

---

## 6. AI / LLM layer

**Router:** `apps/api/src/llm/router.ts` (lines 244–356).

Three tiers, assigned by feature, see [CLAUDE.md §LLM cost model](../CLAUDE.md):

| Tier | Cost / 1k tokens (in/out) | Features |
|---|---|---|
| Haiku 4.5 | $0.001 / $0.005 | signal_triage, signal_explanation (free), tape_narrator, qa_retrieval |
| Sonnet 4.6 | $0.003 / $0.015 | signal_explanation (premium), scan_narrative, regime_narration |
| Opus 4.7 | $0.015 / $0.075 | deep_analysis, whale_forensic, daily_recap, scan_synthesis |

**Token economy** (`packages/db/prisma/schema.prisma` — `TokenLedger`, `LlmCall`):
- Pro subscription credits $10/mo of token balance
- Top-up packs: $10 / $25 / $50 / $100
- Each call: `balance_cents -= cost_cents`, row inserted into `llm_calls`
- When balance hits 0, premium users transparently downgrade to Haiku

**Caching (broken — silent no-op).** The `cache_control: { type: 'ephemeral' }` marker is set correctly on the last system block (`packages/llm-prompts/src/system.ts:29`, placement via `withEphemeralCacheOnLast()` in `apps/api/src/llm/router.ts:141`). But the system prompt is only ~280 words ≈ **~350 tokens**, below Anthropic's minimum cacheable prefix on every model in use:

| Model | Min cacheable prefix | OrderFlow system prompt |
|---|---|---|
| Haiku 4.5 | 4096 tokens | ~350 |
| Sonnet 4.6 | 2048 tokens | ~350 |
| Opus 4.7 | 4096 tokens | ~350 |

Result: `cache_creation_input_tokens` is silently `0` on every call, no cache is ever written, no cache is ever read. Nothing alerts on this today. Fix is in `docs/NEXT_SESSION.md` §3A — items **C1–C5**.

**Router bypass.** Three hot paths skip `callLlm()` and call `anthropic.messages.create` directly — they lose token-ledger debit, audit logging, and tier fallback:
- `apps/workers/notification-dispatcher.ts:153`
- `apps/workers/daily-recap.ts:185`
- `apps/web/src/app/api/signals/[id]/explain/route.ts:179`

**AI-touching API routes:**
- `/api/signals/[id]/explain` — on-demand re-explain for a triggered event
- `/api/ai/tape-narrator` — narrate the recent tape
- `/api/ai/deep-analysis` — Opus-tier long-form analysis
- `/api/ai/correlation` — cross-instrument correlation explainer
- daily-recap worker (`apps/workers/daily-recap.ts`) — Opus, scheduled

---

## 7. Auth, billing, tiers

**Auth** (`apps/web/src/lib/auth.ts`):
- NextAuth v5, credentials provider, JWT sessions, PrismaAdapter
- Registration (`apps/web/src/app/api/auth/register/route.ts`):
  - Username 3–20 chars, password ≥ 10 with letter+number, bcrypt salt 12
  - `isEmailEnabled()` (= `RESEND_API_KEY` present) gates the verification flow
    - present → `pending_verification` until link clicked
    - absent → auto-`active` (live state today)
  - Rate limit is in-memory `Map` (per-IP, 5/60s) — does not survive restart
- `apps/web/src/middleware.ts` — `/`, `/try`, `/login`, `/register`, `/plan` are public; everything else requires session

**Stripe billing** (`apps/web/src/app/api/billing/`):
- `/checkout` — creates Stripe Checkout session (Pro $19 / mo + top-up SKUs)
- `/webhook` — idempotent via `stripeEvent` dedupe table:
  - `checkout.session.completed` → set tier = `premium`, credit $10 token balance
  - `invoice.payment_succeeded` → top up to $10 minimum
  - `payment_intent.succeeded` → one-time top-up adds cents
- `/topup`, `/coupon/apply`, `/select-free` — supporting routes

Stripe is **wired and idempotent**; needs only the `STRIPE_*` env vars to
go live. Token credits hit the DB atomically (`packages/db/prisma` —
`TokenLedger.upsert`).

**Tier gates** (`apps/web/src/lib/limits.ts`):
- Single source of truth. Server enforces; client only hints.
- 403 response shape: `{ error: 'tier_gate', feature, tierRequired, upgradeUrl }`
- Caps: 3 vs ∞ setups, 5 vs 10 instruments/setup, 10 vs ∞ scans/day,
  single vs cross-market scope, Haiku-10/day vs metered AI

---

## 8. TimescaleDB hot path

**Hypertables** (`packages/db/prisma/timescale.sql`):
| Table | Key | Retention |
|---|---|---|
| `market_ticks` | `(instrument, exchange, ts)` | 90 days |
| `order_book_snapshots` | `(instrument, exchange, ts)` | none set |
| `ohlcv_bars` | `(instrument, exchange, timeframe, ts)` | 365 days |

**Writers:**
- `persistence.py` — `market_ticks` + `order_book_snapshots` (bulk, idempotent)
- Nothing currently writes `ohlcv_bars` directly. Bars are derived on the fly via `time_bucket('${tf}', ts) FROM market_ticks` inside the bars API (see §3).

**Readers:**
- `apps/web/src/app/api/markets/[instrument]/bars/route.ts`
- `apps/web/src/app/api/markets/[instrument]/footprint/route.ts`
- `regime_publisher.py` — reads last 1440 1-min bars / 60s for HMM fit
- `divergence_publisher.py` — scans 15-min bars / 120s for div detection

**Continuous aggregates: none configured.** Every bars request currently
runs a fresh `time_bucket` over raw ticks. Below ~5M rows this is fine;
at scale (multiple users, year of history) it becomes the obvious
bottleneck.

---

## 9. Redis surface

| Key / channel | Type | Producer | Consumer |
|---|---|---|---|
| `market:ticks` | pubsub | ingest workers | persistence, streaming, evaluator, ws |
| `market:orderbook` | pubsub | ingest workers | persistence, streaming, ws |
| `market:cvd_update` | pubsub | streaming | evaluator, ws |
| `market:large_print` | pubsub | streaming | evaluator, ws |
| `market:sweep_detected` | pubsub | streaming | evaluator, ws |
| `market:imbalance_update` | pubsub | streaming | ws |
| `market:regime` | HASH | regime_publisher | API `/api/market/regime` |
| `market:divergences` | LIST | divergence_publisher | API `/api/market/divergences` |
| `signal:triggered:<userId>` | pubsub | evaluator | dispatcher, ws |
| `signal:cooldown:<setupId>:<inst>` | string + TTL | evaluator | evaluator |
| `quota:scans:<userId>:<YYYY-MM-DD>` | string + TTL | scans API | scans API |
| `state:<instrument>` | HASH | streaming | scan_worker |
| `instruments:<market>` | ZSET | (static seed) | scan_worker |
| `bull:scans:wait` | stream | scans API | scan_worker (NOT RUNNING) |

---

## 10. Honest gaps — what is not what it appears to be

1. **Scans look complete but have no worker.** Code exists; systemd unit doesn't. Jobs accumulate.
2. **5 of 6 asset classes serve synthetic data.** Bars API has GBM fallback. UI labels honestly, but value prop ("six asset classes") is currently 1 real + 5 cosmetic.
3. **Notifications silently no-op without creds.** Signals fire to no one unless the user has set up a webhook.
4. **No continuous aggregates.** Bars API recomputes from raw ticks every request.
5. **`order_book_snapshots` has no retention policy.** Will grow unbounded; ~600k rows in 30 days suggests this becomes a problem in 6–12 months.
6. **In-memory rate limit on registration.** Restart = state lost. Trivially DoSable.
7. **No `/api/auth/resend` route.** If a verification email fails, the user has no recourse.
8. **CVD state resets on streaming-worker restart.** No persistence of running CVD; a restart loses the baseline. UI handles gracefully but PnL-on-CVD logic would be off until next reset.
9. **Trigger-evaluator setup cache is 30s TTL.** New setup → up to 30s before it can fire.
10. **Prompt caching is silently inactive.** `cache_control: ephemeral` is set on the system block but the system prompt (~350 tokens) is below the minimum cacheable prefix on every model (2048 for Sonnet, 4096 for Haiku/Opus). Every AI call pays full input price. See §6.
11. **Three callers bypass the LLM router.** `apps/workers/{notification-dispatcher,daily-recap}.ts` and `apps/web/src/app/api/signals/[id]/explain/route.ts` call `anthropic.messages.create` directly, losing token-ledger debit, audit logging, and tier fallback.

---

## 11. Improvement vectors (ranked)

**Tier 1 — small effort, large product impact**

| # | Item | Effort | Why |
|---|---|---|---|
| 1 | Deploy `orderflow-scan-worker.service` | ~30 min | Scans feature goes from broken to working |
| 2 | Configure Resend + VAPID keys | 0 code, owner action | Users actually receive their signals (#3 above) |
| 3 | Build `/api/auth/resend` route + UI button | ~1 h | Unblocks any user who didn't receive verification |
| 4 | Move registration rate limit to Redis | ~30 min | Trivial DoS surface closed |
| 5 | **Prompt-caching fix (C1):** pad `SYSTEM_PROMPT` past 4096 tokens | ~1 h | Unlocks ~⅔–¾ input-cost cut on every AI call (caching is silent no-op today) |
| 6 | **Router consolidation (C2):** route the 3 bypassed callers through `callLlm()` | ~1 h | Restores token ledger + audit + tier fallback for the highest-volume callers (notification-dispatcher, daily-recap, signals/explain) |
| 7 | **Cache-hit KPI (C3):** surface `cache_read_input_tokens` percentage in `/admin` | ~1 h | Today there is no signal that caching is working — future regressions invisible |

**Tier 2 — moderate effort, infrastructure leverage**

| # | Item | Effort | Why |
|---|---|---|---|
| 5 | Continuous aggregates for `ohlcv_bars` (1m / 5m / 15m / 1h) | ~3 h | Bars API → cached materializations, ~10x faster |
| 6 | Retention policy on `order_book_snapshots` (e.g., 14 days) | ~10 min | Cap unbounded growth |
| 7 | Persist streaming CVD baselines to Redis snapshot every 60s | ~2 h | Worker restarts don't wipe running totals |
| 8 | Reduce trigger setup-cache TTL to 5s OR add invalidation pubsub | ~1 h | New setups fire within seconds, not 30s |

**Tier 3 — scope-expanding (per-asset-class)**

| # | Item | Effort | Why |
|---|---|---|---|
| 9 | Wire `alpaca.py` + systemd unit | ~1 h + Alpaca key | US stocks become real (one asset class flips from synthetic) |
| 10 | Wire `oanda.py` + systemd unit | ~1 h + OANDA key | Forex becomes real |
| 11 | Write futures ingest (Polygon or Databento) | ~3 h + paid feed | Highest-value asset class for the product narrative |

**Tier 4 — product / UX polish**

| # | Item | Effort | Why |
|---|---|---|---|
| 12 | Per-page mobile audit (/signals, /scans, /settings, /billing, /markets) | ~4 h | Only /dashboard got the mobile-first pass |
| 13 | Footprint / heatmap UI lifts | ~6 h | Currently lightweight-charts default |
| 14 | Playwright mobile profiles + eruda console | ~2 h | Real-device debug loop |
| 15 | Pre-aggregated `signal_events` summary table | ~2 h | Dashboard summary tiles get cheap |

**Tier 5 — observability / hygiene**

| # | Item | Effort | Why |
|---|---|---|---|
| 16 | Centralize all `console.log` → pino + correlation IDs | ~3 h | Trace a single signal end-to-end through journals |
| 17 | Health-check endpoint per worker (`/healthz` over a side channel) | ~2 h | systemd `WatchdogSec` + auto-restart on stall |
| 18 | Migrate from `next lint` to ESLint flat config | ~1 h | Restore lint coverage in CI (currently dropped) |

---

## 12. What to read next

- **For prod ops:** [OPERATIONS.md](./OPERATIONS.md) — the 12-unit table, restart order, log commands, disaster recovery.
- **For dev setup:** [../CLAUDE.md](../CLAUDE.md) — local dev, conventions, freemium gates.
- **For credentials owners need to provide:** [USER_TODO.md](./USER_TODO.md) + [`../todo/`](../todo/) (10 per-action briefs).
