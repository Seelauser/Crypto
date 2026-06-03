# OrderFlow Analytics — Codebase Guide

Professional order-flow analytics SaaS. Live at **https://orderflow-beast.com**.

Six asset classes: Crypto (True L2, Binance/Coinbase/Kraken), US Stocks, US Futures, Forex, Commodities, Resources (all Inferred — workers not yet shipped, blocked on API keys). Two core products: **Order Flow Signals** and **Live Scans**.

**Companion docs (read first depending on your goal):**
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — honest as-built map, end-to-end flows, gaps, ranked improvement vectors. Start here for "how does this actually work" or "where should we invest next."
- [`docs/OPERATIONS.md`](docs/OPERATIONS.md) — production runbook (12 systemd units, restart order, logs, recovery).
- [`docs/USER_TODO.md`](docs/USER_TODO.md) — credentials the owner still needs to provide, grouped by what they unlock.
- [`docs/NEXT_SESSION.md`](docs/NEXT_SESSION.md) — next-session starting point: what's shipped, what's next, picklist.

## Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 15, React 19, Tailwind v3, lightweight-charts v4, Zustand, Vaul |
| API | Fastify 5 (REST), Next.js Route Handlers |
| Real-time | WebSocket Gateway (ws + Redis pubsub fan-out) |
| AI | Anthropic SDK — Haiku 4.5 / Sonnet 4.6 / Opus 4.7 |
| DB | PostgreSQL 16 + TimescaleDB hypertables (via Prisma) |
| Cache | Redis (BullMQ queues, rate limits, cooldowns, market state) |
| Workers | Python 3.12 (asyncio + CCXT Pro ingest, analytics, HMM) |
| Node workers | TypeScript (notification dispatcher, daily recap) |
| Mobile UI | Shared design system at `/var/www/design-system/` (Liquid Glass + Material 3, auto-loaded) |
| Monorepo | pnpm workspaces + Turborepo |

## Monorepo structure

```
apps/
  web/                Next.js 15 app (auth, dashboard, charts, billing, settings)
  api/                Fastify REST API (signals, scans, notifications)
  ws-gateway/         WebSocket fan-out server
  orderflow-workers/  Python ingest + analytics + trigger evaluator
  workers/            Node.js notification dispatcher + daily recap
packages/
  db/                 Prisma schema + client + raw-SQL timescale.sql
  types/              Shared TypeScript interfaces
  llm-prompts/        Prompt builders + system prompt (cached)
infra/
  docker-compose.dev.yml   TimescaleDB + Redis for local dev
  docker-compose.prod.yml  Full production stack with Traefik (unused — prod uses systemd)
scripts/
  web-build.sh        pnpm web:build / web:deploy helpers
docs/
  OPERATIONS.md       Live prod runbook (12 systemd units, restart order, logs)
  USER_TODO.md        What the project owner still needs to provide
```

## Production deployment (live)

Server: VPS `srv860116` (147.93.57.246). Postgres 16 on **port 5433** (pg14 on 5432 hosts Goaty/Solbatcher/Susy X — independent). Redis 7. nginx terminates HTTPS for `orderflow-beast.com`, proxies `127.0.0.1:3100`.

12 systemd units (`orderflow-*.service`) — see `docs/OPERATIONS.md` for full table.

Redeploy the web after code changes:
```bash
pnpm web:deploy            # build + stage assets + restart orderflow-web.service
```
The `web:deploy` helper handles a Next.js standalone-output quirk: `public/` and `.next/static/` must be copied into `.next/standalone/apps/web/` or `_next/static` 404s.

## Dev setup

```bash
docker compose -f infra/docker-compose.dev.yml up -d   # TimescaleDB + Redis
pnpm install
cp .env.example apps/web/.env.local                    # fill secrets
pnpm db:migrate                                        # Prisma + auto-applies timescale.sql
pnpm dev
```

Local services:
- Next.js web: http://localhost:3000 (prod uses :3100 to avoid port collision)
- Fastify API: http://localhost:4000
- WS Gateway: ws://localhost:4001

## TimescaleDB hypertables

`market_ticks`, `ohlcv_bars`, `order_book_snapshots` are **raw SQL**, not Prisma — defined in `packages/db/prisma/timescale.sql`. `pnpm db:migrate` / `db:migrate:prod` / `db:push` all chain `db:timescale` which re-applies the SQL idempotently. Don't forget to restart `orderflow-persistence` + `orderflow-web` after a recreate (Prisma/psycopg cache OIDs).

## Key files

### Mobile / chrome
- `apps/web/src/app/layout.tsx` — injects `/design-system/shared/{device-detect,bootstrap}.js` (sets `body.device-ios|android|desktop`, loads Liquid Glass / Material 3)
- `apps/web/src/app/(app)/layout.tsx` — `100dvh`, `flex-col md:flex-row` so mobile stacks nav above main
- `apps/web/src/components/dashboard/AppNav.tsx` — three components: `DesktopSidebar`, `MobileTopBar`, `MobileNavDrawer`
- `apps/web/src/components/ui/Drawer.tsx` — Vaul bottom-sheet wrapper (drag-handle, snap, safe-area-aware)
- `apps/web/tailwind.config.ts` — `@tailwindcss/container-queries` plugin, `tap-min: 44px`, `safe-top/bottom`

### Auth & limits
- `apps/web/src/lib/auth.ts` — NextAuth v5 credentials provider (username login)
- `apps/web/src/lib/limits.ts` — Free vs Pro feature gates (single source of truth)
- `apps/web/src/lib/email.ts` — `isEmailEnabled()` — Resend client is `null` when `RESEND_API_KEY` is unset; registration falls back to auto-activation
- `apps/web/src/middleware.ts` — Route protection; `/`, `/try`, `/login`, `/register`, `/plan` are public

### Billing
- `apps/web/src/lib/stripe.ts` — Checkout sessions + top-up
- `apps/web/src/app/api/billing/webhook/route.ts` — Stripe webhook (subscription + token credit)
- `apps/web/src/app/(app)/billing/upgrade/page.tsx` — `/billing/upgrade` landing page

### LLM
- `packages/llm-prompts/src/system.ts` — System prompt with `cache_control: ephemeral`
- `packages/llm/src/router.ts` — **Single LLM entry point** (`callLlm`): three-tier model selector, tier gating, premium-balance→Haiku fallback, ephemeral caching, `llm_calls` audit row + token-ledger debit. Inject your app's PrismaClient. **Route every new LLM call through `callLlm` — never hand-roll cost/ledger math.** Used by the dispatcher, daily-recap, and the explain route. `apps/api/src/llm/router.ts` is a thin re-export of this package.
- `apps/web/src/app/api/signals/[id]/explain/route.ts` — Per-event AI explanation (free-tier daily quota + premium 402 gate live here; billing in `callLlm`)
- `apps/workers/notification-dispatcher.ts` — Gracefully falls back to a fixed string if `ANTHROPIC_API_KEY` is unset or AI call throws

### Real-time
- `apps/ws-gateway/src/index.ts` — Redis pubsub → WebSocket fan-out
- `apps/web/src/lib/ws.ts` — Client hooks: `useMarketSocket`, `useCvdStream`, `useSignalStream`
- `apps/orderflow-workers/src/triggers/evaluator.py` — Trigger evaluation loop (consumes `market:large_print` + others)

### Python workers
| Path | Role |
|---|---|
| `src/ingest/binance.py` | Binance True-L2 crypto via CCXT Pro |
| `src/ingest/ccxt_ingest.py` | Generic CCXT Pro ingestor (Coinbase + Kraken; bybit/okx ready) |
| `src/analytics/streaming.py` | Subscribes ticks + OB → publishes `cvd_update`, `large_print`, `sweep_detected`, `imbalance_update` |
| `src/analytics/cvd.py` | CVD + delta math |
| `src/analytics/imbalance.py` | Bid/ask imbalance |
| `src/analytics/sweeps.py` | Sweep + large-print detection |
| `src/analytics/regime.py` | 3-state HMM regime detector (library) |
| `src/analytics/regime_publisher.py` | Fits HMM on 1m bars per asset class every 60s → `market:regime` Redis hash |
| `src/analytics/divergence.py` | Bullish/bearish divergence detector |
| `src/analytics/divergence_publisher.py` | Scans 15m bars every 120s → `market:divergences` Redis list |
| `src/analytics/volume_profile.py` | VPOC/VAH/VAL |
| `src/ingest/persistence.py` | Redis pubsub → TimescaleDB hypertables |
| Not yet shipped: `alpaca.py`, `oanda.py`, futures/commodities ingest | Blocked on user-supplied API keys — see `docs/USER_TODO.md` |

## Redis channels (live in prod)

Published by ingest + streaming workers, consumed by trigger-evaluator + WS gateway:

```
market:ticks               raw trade prints
market:orderbook           top-20-level book snapshots
market:cvd_update          {instrument, exchange, cvd, delta_1s, delta_60s}
market:large_print         {instrument, side, price, size, notional_usd}
market:sweep_detected      SweepEvent
market:imbalance_update    {top5_imbalance, top5_dominant, …}
market:regime              HASH — field per asset class, regime-publisher writes
market:divergences         LIST — divergence-publisher writes
signal:triggered:<userId>  per-user signal fan-out
```

## Freemium gates

All gates are enforced server-side. The client shows UI hints but **never trusts the client**.

| Feature | Free | Pro |
|---|---|---|
| Signal setups | 3 | Unlimited |
| Instruments/setup | 5 | 10 |
| Scans/24h | 10 | Unlimited |
| Scan scope | Single market | Cross-market |
| AI calls/day | 10 (Haiku only) | Unlimited (metered $) |
| History | 7 days | Full |
| Notification channels | Email, Push | + Telegram, Webhook |
| Footprint, Heatmap, DOM | — | ✓ |
| CSV export, API access | — | ✓ |

Gate responses: `HTTP 403 { error: 'tier_gate', feature, tierRequired, upgradeUrl }`.

## Data quality labels

- **[True L2]** — Crypto only (Binance/Coinbase/Kraken CCXT Pro WebSocket order book)
- **[Inferred]** — Stocks, futures, forex, commodities (delta/CVD derived from OHLCV via price-position approximation)

Always display the appropriate badge in the UI. Never present inferred data as True L2.

## Graceful degradation (missing creds)

OrderFlow is designed to run with partial credentials without crashing user-visible flows:

- **`RESEND_API_KEY` unset** → `email.ts` exposes `isEmailEnabled() === false`. Registration creates accounts in `active` state instead of `pending_verification` (no other way to unblock the user). Verification-email send is wrapped in try/catch so a Resend outage doesn't kill signup.
- **`ANTHROPIC_API_KEY` unset** → `notification-dispatcher` skips the AI explanation and uses a fallback string. Signal events still persist + dispatch.
- **`STRIPE_*` unset** → /billing/upgrade renders but checkout will 500. UI shows Free-tier banner.
- **Non-crypto ingest workers absent** → dashboard tiles for stocks/futures/forex/commodities/resources show `"ingest pending"` with a tooltip — honest, not "no data".

See `docs/USER_TODO.md` for what each key unlocks.

## LLM cost model

Token credit is stored in `token_ledger.balance_cents`. Pro subscription includes $10/mo. Top-ups available ($10/$25/$50/$100). All usage logged to `llm_calls` table.

Model assignment by feature:
- Haiku 4.5: `signal_triage`, `signal_explanation` (free), `tape_narrator`, `qa_retrieval`
- Sonnet 4.6: `signal_explanation` (premium), `scan_narrative`, `regime_narration`
- Opus 4.7: `deep_analysis`, `whale_forensic`, `daily_recap`, `scan_synthesis`

Prompt caching: system prompt block has `cache_control: { type: 'ephemeral' }` on every call.

## Conventions

- All numeric values in UI use `font-family: 'JetBrains Mono', monospace`
- Colors: buy = `#22d3ee`, sell = `#f97366`, warn = `#fbbf24`, ok = `#22c55e`
- Tier gate JSON is always `{ error: 'tier_gate', feature, tierRequired: 'premium', upgradeUrl }`
- Soft-delete signals by setting `status = 'archived'` (preserves event history)
- TimescaleDB hypertables auto-reapply via `db:migrate` — no manual `psql -f` needed
- Mobile work loads from `/var/www/design-system/`; do not bundle Material/Liquid Glass locally (VPS master rule)
