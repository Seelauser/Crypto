# OrderFlow Analytics — Codebase Guide

Professional order-flow analytics SaaS. Six asset classes: Crypto (True L2), US Stocks, US Futures, Forex, Commodities, Resources (all Inferred). Two core products: **Order Flow Signals** and **Live Scans**.

## Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 15, React 19, Tailwind, lightweight-charts v4, Zustand |
| API | Fastify 5 (REST), Next.js Route Handlers |
| Real-time | WebSocket Gateway (ws + Redis pubsub fan-out) |
| AI | Anthropic SDK — Haiku 4.5 / Sonnet 4.6 / Opus 4.7 |
| DB | PostgreSQL 16 + TimescaleDB hypertables (via Prisma) |
| Cache | Redis (BullMQ queues, rate limits, cooldowns, market state) |
| Workers | Python 3.12 (asyncio + CCXT Pro ingest, analytics) |
| Node workers | TypeScript (notification dispatcher, daily recap) |
| Monorepo | pnpm workspaces + Turborepo |

## Monorepo structure

```
apps/
  web/          Next.js 15 app (auth, dashboard, charts, billing, settings)
  api/          Fastify REST API (signals, scans, notifications)
  ws-gateway/   WebSocket fan-out server
  orderflow-workers/  Python ingest + analytics + trigger evaluator
  workers/      Node.js notification dispatcher + daily recap
packages/
  db/           Prisma schema + client
  types/        Shared TypeScript interfaces
  llm-prompts/  Prompt builders + system prompt (cached)
infra/
  docker-compose.dev.yml   TimescaleDB + Redis for local dev
  docker-compose.prod.yml  Full production stack with Traefik
```

## Dev setup

```bash
# 1. Start DB + Redis
docker compose -f infra/docker-compose.dev.yml up -d

# 2. Install deps
pnpm install

# 3. Migrate DB
pnpm db:migrate

# 4. Set env vars (copy .env.example → .env.local)
cp .env.example apps/web/.env.local

# 5. Start all services
pnpm dev
```

Services on dev:
- Next.js web: http://localhost:3000
- Fastify API: http://localhost:4000
- WS Gateway: ws://localhost:4001

## Key files

### Auth & limits
- `apps/web/src/lib/auth.ts` — NextAuth v5 credentials provider
- `apps/web/src/lib/limits.ts` — Free vs Pro feature gates (single source of truth)
- `apps/web/src/middleware.ts` — Route protection

### Billing
- `apps/web/src/lib/stripe.ts` — Checkout sessions + top-up
- `apps/web/src/app/api/billing/webhook/route.ts` — Stripe webhook (subscription + token credit)

### LLM
- `packages/llm-prompts/src/system.ts` — System prompt with `cache_control: ephemeral`
- `apps/api/src/llm/router.ts` — Three-tier model selector + cost accounting
- `apps/web/src/app/api/signals/[id]/explain/route.ts` — Per-event AI explanation

### Real-time
- `apps/ws-gateway/src/index.ts` — Redis pubsub → WebSocket fan-out
- `apps/web/src/lib/ws.ts` — Client hooks: useMarketSocket, useCvdStream, useSignalStream
- `apps/orderflow-workers/src/triggers/evaluator.py` — Trigger evaluation loop

### Python workers
- `src/ingest/binance.py` — True L2 crypto ingest (CCXT Pro)
- `src/ingest/alpaca.py` — US stocks inferred data
- `src/ingest/oanda.py` — Forex inferred data
- `src/analytics/cvd.py` — CVD + delta computation
- `src/analytics/imbalance.py` — Bid/ask imbalance
- `src/analytics/sweeps.py` — Sweep + large print detection
- `src/analytics/regime.py` — HMM regime detector
- `src/analytics/volume_profile.py` — VPOC/VAH/VAL

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

- **[True L2]** — Crypto only (Binance CCXT Pro WebSocket order book)
- **[Inferred]** — Stocks, futures, forex, commodities (delta/CVD derived from OHLCV via price-position approximation)

Always display the appropriate badge in the UI. Never present inferred data as True L2.

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
- TimescaleDB hypertables (`market_ticks`, `ohlcv_bars`, `order_book_snapshots`) are created via `packages/db/prisma/timescale.sql` — run after `prisma migrate`
