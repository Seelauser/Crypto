# OrderFlow Beast — Master Rework Guideline

## Unified Technical Specification · v2.0 · 2026-06-03

> **Purpose of this document**
> This is the single source of truth for the full platform rework. It cross-references every
> gap identified in `ARCHITECTURE.docx` (the as-built snapshot of 2026-06-03), integrates the
> API research, subscription model, and chart engine specification developed in the enhancement
> sessions, and produces a prioritised, executable work plan. Every section maps directly to
> existing code paths or new files that need to be created.
> 
> **Do not treat this as additive feature documentation.** It supersedes the improvement vectors
> in `ARCHITECTURE.docx §11`. Use it as the rework brief handed to any developer joining the
> project.

-----

## Table of contents

1. [Executive gap analysis](#1-executive-gap-analysis)
1. [Target architecture](#2-target-architecture)
1. [Subscription tier model](#3-subscription-tier-model)
1. [API connection registry](#4-api-connection-registry)
1. [Ingest layer rework](#5-ingest-layer-rework)
1. [TimescaleDB schema changes](#6-timescaledb-schema-changes)
1. [Redis surface expansion](#7-redis-surface-expansion)
1. [Order flow chart engine](#8-order-flow-chart-engine)
1. [Placement signal engine](#9-placement-signal-engine)
1. [Backend API routes](#10-backend-api-routes)
1. [Tier-gate system rework](#11-tier-gate-system-rework)
1. [Notification system fix](#12-notification-system-fix)
1. [Infrastructure hygiene fixes](#13-infrastructure-hygiene-fixes)
1. [Ordered work plan](#14-ordered-work-plan)
1. [Environment variable registry](#15-environment-variable-registry)
1. [Complete file map](#16-complete-file-map)

-----

## 1. Executive gap analysis

Cross-reference of `ARCHITECTURE.docx §10` (honest gaps) against the full rework scope.
Each gap is assigned a severity and a resolution reference.

|#  |Gap (from ARCHITECTURE.docx)                                          |Severity|Resolution|
|---|----------------------------------------------------------------------|--------|----------|
|G1 |Scans worker code exists but no systemd unit → jobs queue forever     |Critical|§13.1     |
|G2 |5 of 6 asset classes return synthetic GBM data                        |Critical|§5.2–5.4  |
|G3 |Notifications silently no-op (Resend/VAPID/Telegram creds absent)     |Critical|§12       |
|G4 |No continuous aggregates → bars API does full tick scan per request   |High    |§6.3      |
|G5 |`order_book_snapshots` has no retention policy → unbounded growth     |High    |§6.4      |
|G6 |In-memory registration rate limit → DoSable, lost on restart          |Medium  |§13.2     |
|G7 |No `/api/auth/resend` route → blocked users have no recourse          |Medium  |§13.3     |
|G8 |CVD state resets on streaming worker restart                          |Medium  |§13.4     |
|G9 |Trigger-evaluator setup cache is 30s TTL                              |Low     |§13.5     |
|G10|Only two tiers (`free` / `premium`) — `starter` tier missing entirely |Critical|§3, §11   |
|G11|Chart is `lightweight-charts` default — no order flow placement layer |Critical|§8, §9    |
|G12|No CoinGlass, Bybit, OKX, Deribit, Glassnode, Polygon connections     |Critical|§4, §5    |
|G13|Footprint route exists but writes nothing to it from streaming.py     |High    |§5.1, §8  |
|G14|No tier enforcement on WS gateway channels                            |High    |§7.2      |
|G15|Stripe billing hardcoded to `premium` — incompatible with 3-tier model|High    |§11.2     |

-----

## 2. Target architecture

The rework expands the current 13-unit systemd stack to 20 units. New units are marked `[NEW]`.
Existing units are marked `[MODIFY]` or `[KEEP]`.

```
                        ┌──────────────────────────────┐
                        │       Browser (Next 15)       │
                        └──────────────┬───────────────┘
                                       │ HTTPS + WSS
                          ┌────────────┴────────────┐
                          │                         │
               ┌──────────▼──────────┐   ┌──────────▼──────────┐
               │   Next.js :3100     │   │  WS Gateway :4001   │
               │   (web app)         │   │  (Redis fan-out)    │
               │   [MODIFY]          │   │  [MODIFY: tier gate]│
               └────┬───────┬────────┘   └──────────▲──────────┘
                    │       │                        │
                    │       └──► Fastify API :4000   │
                    │            [MODIFY]            │
                    ▼                 │              │
        ┌─────────────────┐          ▼              │
        │  Postgres 16    │    ┌──────────────┐     │
        │  + TimescaleDB  │    │   Redis 7    │─────┘
        │  [MODIFY schema]│    │  [EXPAND]    │
        └────────▲────────┘    └──────┬───────┘
                 │                    │
                 │         ┌──────────┴─────────────────────────────────┐
                 │         │         Python workers                      │
                 │         │                                             │
                 │         │  EXISTING (keep / modify):                  │
                 │         │  ├─ ingest-binance.service      [MODIFY]   │
                 │         │  ├─ ingest-coinbase.service     [KEEP]     │
                 │         │  ├─ ingest-kraken.service       [KEEP]     │
                 │         │  ├─ persistence.service         [MODIFY]   │
                 │         │  ├─ streaming.service           [MODIFY]   │
                 │         │  ├─ trigger-evaluator.service   [MODIFY]   │
                 │         │  ├─ notification-dispatcher.service [MOD]  │
                 │         │  ├─ regime-publisher.service    [KEEP]     │
                 │         │  └─ divergence-publisher.service [KEEP]    │
                 │         │                                             │
                 │         │  NEW:                                       │
                 │         │  ├─ ingest-bybit.service        [NEW]      │
                 │         │  ├─ ingest-okx.service          [NEW]      │
                 │         │  ├─ ingest-alpaca.service       [NEW]      │
                 │         │  ├─ ingest-deribit.service      [NEW]      │
                 │         │  ├─ coinglass-poller.service    [NEW]      │
                 │         │  ├─ glassnode-poller.service    [NEW]      │
                 │         │  ├─ footprint-builder.service   [NEW]      │
                 │         │  ├─ ob-retention.timer          [NEW]      │
                 │         │  └─ orderflow-scan-worker.service [NEW]    │
                 │         └─────────────────────────────────────────────┘
                 │                    │
                 └────────────────────┘
                       persistence + reads
```

**Total after rework: 22 systemd units** (13 existing + 9 new).

-----

## 3. Subscription tier model

The existing code has two tiers (`free` / `premium`). The rework introduces three:
`free` / `starter` / `pro`. The Stripe billing system must be updated to reflect this.

### 3.1 Tier definitions

|Feature                          |Free              |Starter ($19/mo)  |Pro ($49/mo)        |
|---------------------------------|------------------|------------------|--------------------|
|Crypto pairs                     |BTC, ETH, SOL only|All 50+           |All 50+             |
|Stock data                       |Synthetic only    |15-min delayed    |Real-time           |
|Forex / Futures                  |Synthetic only    |Synthetic only    |Real-time           |
|OHLCV history                    |7 days            |30 days           |90 days             |
|CVD (basic line)                 |✓                 |✓                 |✓                   |
|CVD size tiers (retail/inst)     |✗                 |✓                 |✓                   |
|Footprint / delta candles        |✗                 |✓                 |✓                   |
|Order book heatmap               |✗                 |✓                 |✓                   |
|Imbalance heatband               |✗                 |✓                 |✓                   |
|Volume profile / POC             |✗                 |✓                 |✓                   |
|Large print markers              |✓ (hook)          |✓                 |✓                   |
|Sweep markers                    |✗                 |✓                 |✓                   |
|Funding rate overlay             |✗                 |✓                 |✓                   |
|Open interest overlay            |✗                 |✓                 |✓                   |
|Liquidation level markers        |✗                 |✓                 |✓                   |
|Long/short ratio panel           |✗                 |✓                 |✓                   |
|Cross-exchange aggregated book   |✗                 |✗                 |✓                   |
|IV surface / GEX (options)       |✗                 |✗                 |✓                   |
|Dark pool print markers          |✗                 |✗                 |✓                   |
|Exchange netflow (on-chain)      |✗                 |✗                 |✓                   |
|Whale deposit markers            |✗                 |✗                 |✓                   |
|Signal setups                    |3 max             |Unlimited         |Unlimited           |
|Instruments per setup            |5                 |10                |Unlimited           |
|Scans per day                    |0                 |10                |Unlimited           |
|AI signal explanation            |✗                 |Haiku 4.5 (10/day)|Sonnet 4.6 (metered)|
|AI deep analysis                 |✗                 |✗                 |Opus 4.7 (metered)  |
|AI token credit included         |✗                 |✗                 |$10/mo              |
|Email + push notifications       |✗                 |✓                 |✓                   |
|Telegram alerts                  |✗                 |✗                 |✓                   |
|Placement signal markers on chart|✗                 |✓                 |✓                   |
|AI placement explanation tooltip |✗                 |Haiku             |Sonnet              |
|Regime label (HMM state)         |✗                 |✓                 |✓                   |
|Divergence markers               |✗                 |✓                 |✓                   |

### 3.2 Database change required

```sql
-- packages/db/prisma/migrations/YYYYMMDD_add_starter_tier.sql
-- Current: tier is an enum with 'free' | 'premium'
-- Target: 'free' | 'starter' | 'pro'

ALTER TYPE user_tier ADD VALUE 'starter';
ALTER TYPE user_tier ADD VALUE 'pro';
-- Rename existing 'premium' → 'pro' in a separate migration
UPDATE "User" SET tier = 'pro' WHERE tier = 'premium';
```

```prisma
// packages/db/prisma/schema.prisma — update enum
enum UserTier {
  free
  starter
  pro
}
```

### 3.3 Stripe product mapping

Three Stripe products must be created:

- `prod_starter` → Price: $19/mo recurring
- `prod_pro` → Price: $49/mo recurring
- Keep existing top-up SKUs ($10 / $25 / $50 / $100) — unchanged

Update `apps/web/src/app/api/billing/checkout/route.ts`:

```typescript
// Replace single priceId with tier-based selection
const PRICE_IDS: Record<string, string> = {
  starter: process.env.STRIPE_PRICE_STARTER!,
  pro:     process.env.STRIPE_PRICE_PRO!,
}
```

Update `apps/web/src/app/api/billing/webhook/route.ts`:

- `checkout.session.completed` → read `metadata.tier` from session → set `user.tier` accordingly
- Token credit on Pro checkout: $10 balance. Starter: $0 (no token credit).

### 3.4 `limits.ts` rewrite

The existing `apps/web/src/lib/limits.ts` only knows `free` and `premium`. Full rewrite:

```typescript
// apps/web/src/lib/limits.ts — full replacement

export type Tier = 'free' | 'starter' | 'pro'

export const TIER_RANK: Record<Tier, number> = { free: 0, starter: 1, pro: 2 }

export function tierAtLeast(userTier: Tier, required: Tier): boolean {
  return TIER_RANK[userTier] >= TIER_RANK[required]
}

export const LIMITS = {
  signalSetups:        { free: 3,    starter: Infinity, pro: Infinity },
  instrumentsPerSetup: { free: 5,    starter: 10,       pro: Infinity },
  scansPerDay:         { free: 0,    starter: 10,       pro: Infinity },
  historyDays:         { free: 7,    starter: 30,       pro: 90       },
  aiCallsPerDay:       { free: 0,    starter: 10,       pro: Infinity }, // starter = Haiku quota
  tokenCreditCents:    { free: 0,    starter: 0,        pro: 1000     }, // $10/mo
} as const

// 403 shape — unchanged from existing
export function tierGateResponse(feature: string, required: Tier) {
  return Response.json(
    { error: 'tier_gate', feature, tierRequired: required, upgradeUrl: '/plan' },
    { status: 403 }
  )
}
```

-----

## 4. API connection registry

Complete registry of all external API connections required. Organised by tier dependency.
Each entry shows: what it provides, how it connects, rate limits, cost, and which env var gates it.

### 4.1 Free tier — exchange WebSocket feeds (all $0)

#### Binance WebSocket API

- **Provides:** OHLCV ticks, L2 order book (snapshot + diff), CVD raw material, large print events, liquidation stream, funding rate
- **Connection:** `wss://fstream.binance.com/stream` (futures), `wss://stream.binance.com:9443/stream` (spot)
- **Rate limits:** 1,200 req-weight/min REST · 10 msg/sec per WS connection · 1,024 streams/connection · 1,000 connections/IP
- **Existing file:** `apps/orderflow-workers/src/ingest/binance.py` ✓ (KEEP, minor modify)
- **Channels needed:**
  - `<symbol>@aggTrade` — executed trades with aggressor side
  - `<symbol>@depth@100ms` — order book diff updates
  - `<symbol>@forceOrder` — liquidation events
  - `<symbol>@markPrice@1s` — funding rate + mark price (futures)
  - `<symbol>@bookTicker` — best bid/offer

#### Bybit WebSocket API (NEW)

- **Provides:** Perpetuals L2 book, trade tape, OI per instrument, funding, liquidations
- **Connection:** `wss://stream.bybit.com/v5/public/linear` (perps), `wss://stream.bybit.com/v5/public/spot`
- **Rate limits:** 600 req/5-sec window · max 500 WS connections/5 min · max 1,000 connections/IP
- **New file:** `apps/orderflow-workers/src/ingest/bybit.py`
- **Channels needed:**
  - `orderbook.50.<symbol>` — 50-level L2 snapshot + diff
  - `publicTrade.<symbol>` — trade tape with direction
  - `tickers.<symbol>` — OI, funding, mark price
  - `liquidation.<symbol>` — forced closure events

#### OKX WebSocket API (NEW)

- **Provides:** Spot + swap L2 book, trades, funding, OI, options Greeks
- **Connection:** `wss://ws.okx.com:8443/ws/v5/public`
- **Rate limits:** 20 req/2-sec per endpoint (most restrictive of the three)
- **New file:** `apps/orderflow-workers/src/ingest/okx.py`
- **Channels needed:**
  - `books5` — 5-level BBO (low-latency path)
  - `books` — 400-level full depth (full heatmap)
  - `trades` — trade tape
  - `funding-rate` — perp funding
  - `open-interest` — real-time OI
  - `opt-summary` — options Greeks, IV, OI

#### Coinbase Advanced Trade WebSocket (EXISTING)

- **Provides:** L3 order-by-order feed (unique among major exchanges — exposes individual order IDs)
- **Connection:** `wss://advanced-trade-ws.coinbase.com`
- **Existing file:** `apps/orderflow-workers/src/ingest/ccxt_ingest.py` (selected via `EXCHANGE=coinbase`)
- **Action:** Keep existing. No change.

#### Kraken WebSocket (EXISTING)

- **Provides:** Spot order book, trade tape
- **Existing file:** `apps/orderflow-workers/src/ingest/ccxt_ingest.py` (selected via `EXCHANGE=kraken`)
- **Rate limits:** ~1 req/sec public endpoints
- **Action:** Keep existing. No change.

#### Deribit WebSocket (NEW)

- **Provides:** Crypto options order book, trade executions, IV per strike, Greeks, OI — the dominant crypto options venue
- **Connection:** `wss://www.deribit.com/ws/api/v2`
- **Rate limits:** No hard rate limit on market data WebSocket streams
- **New file:** `apps/orderflow-workers/src/ingest/deribit.py`
- **Channels needed:**
  - `book.{instrument_name}.100ms` — options order book
  - `trades.{instrument_name}.100ms` — options executions
  - `ticker.{instrument_name}.100ms` — IV, delta, gamma, OI per strike
  - `deribit_price_index.{index_name}` — underlying price reference

### 4.2 Starter tier — CoinGlass API (paid, shared infrastructure)

- **Provides:** Cross-exchange aggregated OI, funding rates (OI-weighted), liquidation heatmaps, long/short ratios, taker buy/sell volume, ETF flows
- **Type:** REST + polling (not WebSocket). Polled every 60 seconds by `coinglass-poller.service`.
- **Plan required:** Hobbyist $29/mo minimum (30 req/min, 80 endpoints, ≤1 min updates). Upgrade to Standard $299/mo when platform has 50+ paying users.
- **New file:** `apps/orderflow-workers/src/ingest/coinglass_poller.py`
- **Endpoints polled:**
  
  ```
  GET /api/futures/openInterest/aggregated-history   → PUBLISH market:oi:<instrument>
  GET /api/futures/fundingRate/oi-weight-ohlc-history → PUBLISH market:funding:<instrument>
  GET /api/futures/liquidation/heatmap/model2        → PUBLISH market:liquidations:<instrument>
  GET /api/futures/longShortRatio                    → PUBLISH market:longshort:<instrument>
  ```
- **Env var:** `COINGLASS_API_KEY`
- **Cost at scale:** $29/mo shared across all Starter + Pro users. Upgrade to Standard ($299) at ~50 users.

### 4.3 Starter tier — Polygon.io Starter (stocks, delayed)

- **Provides:** US equities OHLCV (15-min delayed), options chain basics
- **Plan required:** Starter $29/mo (unlimited calls, 15-min delayed, 5yr history, delayed WebSocket)
- **Existing file:** `apps/orderflow-workers/src/ingest/alpaca.py` — **code complete, no systemd unit, no key**
- **Action:** Wire `alpaca.py` systemd unit AND add Polygon as alternative source for delayed stock bars
- **Env var:** `POLYGON_API_KEY` (new), `ALPACA_API_KEY` (existing, unwired)

### 4.4 Pro tier — Polygon.io Developer (stocks, real-time)

- **Provides:** Real-time US equity quotes, trade tape, options chain with full Greeks, dark pool ATS prints
- **Plan required:** Developer $79/mo (real-time, 15yr history, full WebSocket)
- **Endpoints:**
  
  ```
  WSS wss://socket.polygon.io/stocks  → channel: T.* (trades), Q.* (quotes)
  WSS wss://socket.polygon.io/options → channel: T.O:* (options trades)
  GET /v2/last/trade/{stocksTicker}   → last trade
  GET /v3/trades/{optionsTicker}      → options tape
  GET /v2/snapshot/locale/us/markets/stocks/tickers → dark pool via ATS flag
  ```
- **New file:** `apps/orderflow-workers/src/ingest/polygon_stocks.py`
- **Env var:** `POLYGON_API_KEY` (same key, plan determines access level)

### 4.5 Pro tier — Glassnode API (on-chain)

- **Provides:** Exchange wallet inflows/outflows, whale cohort movements, LTH/STH supply ratios — macro context layer
- **Plan required:** Advanced $175/mo (hourly data, 800+ metrics)
- **Type:** REST polling only (no WebSocket). Polled every 3600 seconds (1h cadence matches data resolution).
- **New file:** `apps/orderflow-workers/src/ingest/glassnode_poller.py`
- **Endpoints polled:**
  
  ```
  GET /v1/metrics/distribution/exchange_net_position_change → netflow
  GET /v1/metrics/transactions/transfers_to_exchanges_count  → whale deposits
  GET /v1/metrics/supply/lth_sum                            → long-term holders
  ```
- **Env var:** `GLASSNODE_API_KEY`
- **Cost:** $175/mo fixed, shared across all Pro users. Break-even at ~4 Pro subscribers.

### 4.6 Existing connections — keep

|Connection         |Existing file                       |Status                |Action                                         |
|-------------------|------------------------------------|----------------------|-----------------------------------------------|
|Binance (CCXT Pro) |`ingest/binance.py`                 |Live                  |Modify: add `forceOrder` + `markPrice` channels|
|Coinbase (CCXT Pro)|`ingest/ccxt_ingest.py`             |Live                  |Keep                                           |
|Kraken (CCXT Pro)  |`ingest/ccxt_ingest.py`             |Live                  |Keep                                           |
|Stripe             |`api/billing/`                      |Wired, needs keys     |Modify: 3-tier product mapping                 |
|Resend (email)     |`workers/notification-dispatcher.ts`|Code wired, key absent|Owner action: add `RESEND_API_KEY`             |

-----

## 5. Ingest layer rework

### 5.1 Modify `streaming.py` — add footprint output

The existing `streaming.py` computes CVD, imbalance, and sweep detection but does not compute
footprint data (buy/sell volume per price level per bar). This is the highest-value missing
computation for the chart.

Add to `apps/orderflow-workers/src/analytics/streaming.py`:

```python
# Add to the per-instrument state dict (around line 45):
state[instrument]['footprint_accumulator'] = {}  # { price_level: {'buy': 0, 'sell': 0} }
state[instrument]['current_bar_open_ts'] = None
state[instrument]['current_bar_tf'] = '1m'  # configurable

# Add tick handler (called from existing tick processing loop):
def accumulate_footprint(state, instrument, price, size, side, ts):
    price_level = round(price, 2)  # tick size rounding
    acc = state[instrument]['footprint_accumulator']
    if price_level not in acc:
        acc[price_level] = {'buy': 0, 'sell': 0}
    acc[price_level][side] += size

# Add bar-close handler — publish and reset:
def publish_footprint_bar(redis, instrument, ts, open_, high, low, close, acc):
    levels = [
        {'p': price, 'b': v['buy'], 's': v['sell'], 'd': v['buy'] - v['sell']}
        for price, v in sorted(acc.items())
    ]
    total_buy  = sum(l['b'] for l in levels)
    total_sell = sum(l['s'] for l in levels)
    bar = {
        'ts': ts, 'o': open_, 'h': high, 'l': low, 'c': close,
        'buy_vol': total_buy, 'sell_vol': total_sell,
        'delta': total_buy - total_sell,
        'levels': levels
    }
    redis.publish(f'market:footprint:{instrument}', json.dumps(bar))
    # Also persist to TimescaleDB via persistence service
    redis.publish('persist:footprint', json.dumps({'instrument': instrument, 'bar': bar}))
    # Reset accumulator
    return {}
```

Also add to existing CVD state — persist to Redis HASH every 60 seconds (fixes gap G8):

```python
# Every 60s, snapshot CVD baseline:
redis.hset(f'cvd:baseline:{instrument}', mapping={
    'cvd': state[instrument]['cvd'],
    'ts': int(time.time())
})
# On worker startup, restore from snapshot:
baseline = redis.hget(f'cvd:baseline:{instrument}', 'cvd')
if baseline:
    state[instrument]['cvd'] = float(baseline)
```

### 5.2 New file: `ingest/bybit.py`

```python
# apps/orderflow-workers/src/ingest/bybit.py
# Pattern mirrors existing binance.py (CCXT Pro style)

import ccxtpro
import asyncio, json, os
from redis.asyncio import Redis

INSTRUMENTS = os.getenv('BYBIT_INSTRUMENTS', 'BTC/USDT:USDT,ETH/USDT:USDT,SOL/USDT:USDT').split(',')

async def run():
    redis = Redis.from_url(os.environ['REDIS_URL'])
    exchange = ccxtpro.bybit({'enableRateLimit': True})
    try:
        while True:
            try:
                tasks = [watch_instrument(exchange, redis, inst) for inst in INSTRUMENTS]
                await asyncio.gather(*tasks)
            except Exception as e:
                print(f'[bybit] reconnecting after error: {e}')
                await asyncio.sleep(5)
    finally:
        await exchange.close()

async def watch_instrument(exchange, redis, symbol):
    async for ob in exchange.watch_order_book(symbol, limit=50):
        payload = {
            'instrument': symbol, 'exchange': 'bybit',
            'ts': exchange.milliseconds(),
            'bids': ob['bids'][:20], 'asks': ob['asks'][:20]
        }
        await redis.publish(f'market:orderbook:{symbol}', json.dumps(payload))

if __name__ == '__main__':
    asyncio.run(run())
```

Similarly pattern for `okx.py` and `deribit.py` — same structure, different exchange and channel names.

### 5.3 New systemd unit: `ingest-bybit.service`

```ini
# /etc/systemd/system/orderflow-ingest-bybit.service
[Unit]
Description=OrderFlow Beast — Bybit ingest worker
After=network.target redis.service

[Service]
Type=simple
User=orderflow
WorkingDirectory=/opt/orderflow/apps/orderflow-workers
EnvironmentFile=/opt/orderflow/.env
ExecStart=/opt/orderflow/.venv/bin/python -m src.ingest.bybit
Restart=always
RestartSec=10s
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

Identical pattern for: `orderflow-ingest-okx.service`, `orderflow-ingest-alpaca.service`,
`orderflow-ingest-deribit.service`, `orderflow-coinglass-poller.service`,
`orderflow-glassnode-poller.service`, `orderflow-footprint-builder.service`,
`orderflow-scan-worker.service` (this one already exists as code — just needs the unit file).

### 5.4 Wire existing `alpaca.py` (fix gap G2 for stocks)

```bash
# Steps to activate alpaca.py (code-complete, no unit file):
# 1. Add ALPACA_API_KEY to /opt/orderflow/.env
# 2. Create unit file at /etc/systemd/system/orderflow-ingest-alpaca.service
# 3. systemctl daemon-reload
# 4. systemctl enable --now orderflow-ingest-alpaca.service
# Effort: ~30 minutes
```

-----

## 6. TimescaleDB schema changes

### 6.1 New hypertables

```sql
-- packages/db/prisma/timescale.sql additions

-- Footprint bars (written by footprint-builder.service)
CREATE TABLE IF NOT EXISTS footprint_bars (
    ts          TIMESTAMPTZ NOT NULL,
    instrument  TEXT        NOT NULL,
    exchange    TEXT        NOT NULL,
    timeframe   TEXT        NOT NULL DEFAULT '1m',
    open        NUMERIC     NOT NULL,
    high        NUMERIC     NOT NULL,
    low         NUMERIC     NOT NULL,
    close       NUMERIC     NOT NULL,
    buy_vol     NUMERIC     NOT NULL DEFAULT 0,
    sell_vol    NUMERIC     NOT NULL DEFAULT 0,
    delta       NUMERIC     NOT NULL DEFAULT 0,
    -- levels stored as JSONB: [{"p": price, "b": buy, "s": sell, "d": delta}]
    levels      JSONB       NOT NULL DEFAULT '[]'
);
SELECT create_hypertable('footprint_bars', 'ts',
    chunk_time_interval => INTERVAL '1 day',
    if_not_exists => TRUE);
CREATE UNIQUE INDEX IF NOT EXISTS footprint_bars_pkey
    ON footprint_bars (instrument, exchange, timeframe, ts);
-- Retention: 30 days (footprint data is large)
SELECT add_retention_policy('footprint_bars', INTERVAL '30 days');

-- Derivatives data (written by coinglass-poller.service)
CREATE TABLE IF NOT EXISTS derivatives_metrics (
    ts          TIMESTAMPTZ NOT NULL,
    instrument  TEXT        NOT NULL,
    source      TEXT        NOT NULL,  -- 'coinglass'
    metric      TEXT        NOT NULL,  -- 'oi' | 'funding' | 'longshort' | 'liquidations'
    value       NUMERIC,
    metadata    JSONB       DEFAULT '{}'
);
SELECT create_hypertable('derivatives_metrics', 'ts',
    chunk_time_interval => INTERVAL '1 day',
    if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS derivatives_metrics_lookup
    ON derivatives_metrics (instrument, metric, ts DESC);
SELECT add_retention_policy('derivatives_metrics', INTERVAL '90 days');

-- On-chain metrics (written by glassnode-poller.service) — Pro only
CREATE TABLE IF NOT EXISTS onchain_metrics (
    ts          TIMESTAMPTZ NOT NULL,
    instrument  TEXT        NOT NULL,
    metric      TEXT        NOT NULL,  -- 'netflow' | 'whales' | 'lth_supply'
    value       NUMERIC,
    entity      TEXT                   -- exchange name or cohort label
);
SELECT create_hypertable('onchain_metrics', 'ts',
    chunk_time_interval => INTERVAL '7 days',
    if_not_exists => TRUE);
SELECT add_retention_policy('onchain_metrics', INTERVAL '365 days');

-- Options data (written by deribit + polygon ingest)
CREATE TABLE IF NOT EXISTS options_events (
    ts          TIMESTAMPTZ NOT NULL,
    instrument  TEXT        NOT NULL,  -- underlying (BTC, ETH, AAPL...)
    source      TEXT        NOT NULL,  -- 'deribit' | 'polygon'
    strike      NUMERIC,
    expiry      DATE,
    option_type TEXT,                  -- 'call' | 'put'
    iv          NUMERIC,
    delta       NUMERIC,
    gamma       NUMERIC,
    premium     NUMERIC,
    oi          NUMERIC,
    volume      NUMERIC
);
SELECT create_hypertable('options_events', 'ts',
    chunk_time_interval => INTERVAL '1 day',
    if_not_exists => TRUE);
SELECT add_retention_policy('options_events', INTERVAL '30 days');
```

### 6.2 Modify existing hypertables

```sql
-- Fix gap G5: add retention policy to order_book_snapshots
SELECT add_retention_policy('order_book_snapshots', INTERVAL '14 days');

-- Extend market_ticks to include exchange source (Bybit / OKX ticks will now arrive)
ALTER TABLE market_ticks ADD COLUMN IF NOT EXISTS exchange TEXT NOT NULL DEFAULT 'binance';
```

### 6.3 Continuous aggregates (fix gap G4 — critical for Pro launch)

```sql
-- 1-minute OHLCV aggregate
CREATE MATERIALIZED VIEW ohlcv_1m
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 minute', ts) AS bucket,
    instrument,
    exchange,
    FIRST(price, ts)  AS open,
    MAX(price)        AS high,
    MIN(price)        AS low,
    LAST(price, ts)   AS close,
    SUM(qty)          AS volume
FROM market_ticks
GROUP BY bucket, instrument, exchange;

-- Refresh policy: update every 30 seconds
SELECT add_continuous_aggregate_policy('ohlcv_1m',
    start_offset => INTERVAL '2 hours',
    end_offset   => INTERVAL '30 seconds',
    schedule_interval => INTERVAL '30 seconds');

-- 5-minute, 15-minute, 1-hour aggregates (same pattern)
CREATE MATERIALIZED VIEW ohlcv_5m  WITH (timescaledb.continuous) AS
    SELECT time_bucket('5 minutes', ts) AS bucket, instrument, exchange,
           FIRST(price,ts) AS open, MAX(price) AS high, MIN(price) AS low,
           LAST(price,ts) AS close, SUM(qty) AS volume
    FROM market_ticks GROUP BY bucket, instrument, exchange;

CREATE MATERIALIZED VIEW ohlcv_15m WITH (timescaledb.continuous) AS
    SELECT time_bucket('15 minutes', ts) AS bucket, instrument, exchange,
           FIRST(price,ts) AS open, MAX(price) AS high, MIN(price) AS low,
           LAST(price,ts) AS close, SUM(qty) AS volume
    FROM market_ticks GROUP BY bucket, instrument, exchange;

CREATE MATERIALIZED VIEW ohlcv_1h  WITH (timescaledb.continuous) AS
    SELECT time_bucket('1 hour', ts) AS bucket, instrument, exchange,
           FIRST(price,ts) AS open, MAX(price) AS high, MIN(price) AS low,
           LAST(price,ts) AS close, SUM(qty) AS volume
    FROM market_ticks GROUP BY bucket, instrument, exchange;
```

Update `apps/web/src/app/api/markets/[instrument]/bars/route.ts` to query the appropriate
aggregate view instead of running `time_bucket` over raw ticks:

```typescript
// Replace lines 79-190 in bars/route.ts:
const VIEW_MAP: Record<string, string> = {
  '1m': 'ohlcv_1m', '5m': 'ohlcv_5m', '15m': 'ohlcv_15m', '1h': 'ohlcv_1h'
}
const view = VIEW_MAP[tf] ?? 'ohlcv_1m'
// Query: SELECT * FROM {view} WHERE instrument=$1 AND ts BETWEEN $2 AND $3
```

### 6.4 Retention policy for `order_book_snapshots` (fix gap G5)

```sql
-- 14-day retention prevents unbounded growth
-- At 600k rows/30 days, this caps the table at ~280k rows permanently
SELECT add_retention_policy('order_book_snapshots', INTERVAL '14 days');
```

-----

## 7. Redis surface expansion

### 7.1 New channels

Add to the existing Redis surface table (ARCHITECTURE.docx §9):

|Key / channel               |Type  |Producer                |Consumer                             |Tier    |
|----------------------------|------|------------------------|-------------------------------------|--------|
|`market:ticks:<inst>`       |pubsub|all ingest workers      |persistence, streaming, evaluator, ws|free+   |
|`market:orderbook:<inst>`   |pubsub|all ingest workers      |persistence, streaming, ws           |starter+|
|`market:footprint:<inst>`   |pubsub|streaming.py            |ws-gateway, footprint-builder        |starter+|
|`market:funding:<inst>`     |pubsub|coinglass-poller        |ws-gateway, evaluator                |starter+|
|`market:oi:<inst>`          |pubsub|coinglass-poller        |ws-gateway, evaluator                |starter+|
|`market:liquidations:<inst>`|pubsub|coinglass-poller        |ws-gateway, evaluator                |starter+|
|`market:longshort:<inst>`   |pubsub|coinglass-poller        |ws-gateway                           |starter+|
|`market:options:<inst>`     |pubsub|deribit + polygon ingest|ws-gateway                           |pro     |
|`market:darkpool:<inst>`    |pubsub|polygon ingest          |ws-gateway                           |pro     |
|`market:onchain:<inst>`     |pubsub|glassnode-poller        |ws-gateway                           |pro     |
|`cvd:baseline:<inst>`       |HASH  |streaming.py (every 60s)|streaming.py (on startup)            |internal|
|`footprint:state:<inst>`    |HASH  |streaming.py            |footprint-builder                    |internal|

### 7.2 WS gateway tier enforcement (fix gap G14)

Add to `apps/ws-gateway/src/index.ts` after JWT verification:

```typescript
const CHANNEL_TIER: Record<string, Tier> = {
  'market:ticks':       'free',
  'market:cvd_update':  'free',
  'market:large_print': 'free',
  'market:orderbook':   'starter',
  'market:footprint':   'starter',
  'market:sweep_detected': 'starter',
  'market:imbalance_update': 'starter',
  'market:funding':     'starter',
  'market:oi':          'starter',
  'market:liquidations':'starter',
  'market:longshort':   'starter',
  'market:regime':      'starter',
  'market:divergences': 'starter',
  'signal:triggered':   'starter',
  'market:options':     'pro',
  'market:darkpool':    'pro',
  'market:onchain':     'pro',
}

function channelAllowed(channel: string, userTier: Tier): boolean {
  const prefix = channel.split(':').slice(0, 2).join(':')
  const required = (CHANNEL_TIER[prefix] ?? 'pro') as Tier
  return TIER_RANK[userTier] >= TIER_RANK[required]
}

// In subscription handler — before redis.subscribe(channel):
if (!channelAllowed(channel, session.tier)) {
  ws.send(JSON.stringify({ error: 'tier_gate', channel, tierRequired: CHANNEL_TIER[channel] }))
  return
}
```

-----

## 8. Order flow chart engine

The chart is the product’s USP surface. Order flow placement is the *primary* visual output —
price candlesticks are scaffolding. The full implementation spec is in the companion document
`ORDERFLOW_CHART_TECHNICAL_DOC.md`. This section provides the integration summary and
cross-references the existing codebase.

### 8.1 Existing chart touchpoints

|Existing file                                                 |Current state                                         |Rework action                                        |
|--------------------------------------------------------------|------------------------------------------------------|-----------------------------------------------------|
|`apps/web/src/components/dashboard/LiveCvdGrid.tsx`           |Renders CVD tiles, no chart                           |Keep for dashboard; OrderFlowChart is a new component|
|`apps/web/src/lib/ws.ts`                                      |`useMarketSocket`, `useCvdStream`, `useInstrumentTick`|Keep hooks; add `useChartSocket` on top              |
|`apps/web/src/app/api/markets/[instrument]/bars/route.ts`     |OHLCV + synthetic fallback                            |Modify: query continuous aggregate views (§6.3)      |
|`apps/web/src/app/api/markets/[instrument]/footprint/route.ts`|Route exists; no data source                          |Wire to `footprint_bars` hypertable                  |

### 8.2 New chart component tree

```
apps/web/src/
└── components/chart/
    ├── OrderFlowChart.tsx         ← main component (tier-aware)
    ├── ChartToolbar.tsx           ← timeframe picker, layer toggles
    ├── TierGateOverlay.tsx        ← blurred locked-layer upgrade hints
    ├── SignalTooltip.tsx          ← placement signal + AI explanation
    ├── SourceBadge.tsx            ← live / delayed / synthetic watermark
    └── panes/
        ├── MainPane.tsx           ← price + order flow overlays
        ├── CvdDeltaPane.tsx       ← CVD + delta histogram
        ├── DerivativesPane.tsx    ← OI / funding / L/S ratio
        └── OnchainOptionsPane.tsx ← netflow or options put/call ratio

apps/web/src/lib/chart/
    ├── types.ts                   ← shared type definitions
    ├── resolveDataSources.ts      ← tier → ChartDataSources resolver
    ├── initLayers.ts              ← lightweight-charts series initialiser
    ├── useChartSocket.ts          ← WebSocket subscription manager
    └── placementEngine.ts        ← order flow signal scoring engine
```

### 8.3 Pane layout specification

```
┌──────────────────────────────────────────────────────────────────┐
│  PANE 0 — Main price pane  (70% of total chart height)           │
│                                                                  │
│  Z-order (back to front):                                        │
│  1. Order book heatmap         background wash   [starter+]      │
│  2. OHLCV candlesticks                           [all tiers]     │
│  3. CVD line overlay           purple, right Y   [free+]         │
│  4. Imbalance heatband         green/red fill    [starter+]      │
│  5. Volume profile sidebar     left margin       [starter+]      │
│  6. Footprint delta coloring   candle fill mod   [starter+]      │
│  7. Large print markers    ●   circle on candle  [free+]         │
│  8. Sweep markers          ⚡  bolt icon         [starter+]      │
│  9. Liquidation levels     ─── dashed line       [starter+]      │
│  10. GEX / dark pool marks ◆   diamond marker    [pro]           │
│  11. Placement signal ▲▼   arrow + confidence %  [starter+]      │
│  12. Divergence markers    ↕   price/CVD fork    [starter+]      │
│  13. Regime label          pill badge top-left   [starter+]      │
├──────────────────────────────────────────────────────────────────┤
│  PANE 1 — CVD + Delta  (15% height)              [starter+]      │
│   Histogram: buy delta (green) / sell delta (red) per bar        │
│   Line: cumulative CVD      purple                               │
│   Line: retail CVD (dotted) gray      ← size tier [starter+]    │
│   Line: institutional CVD   amber     ← size tier [starter+]    │
├──────────────────────────────────────────────────────────────────┤
│  PANE 2 — Derivatives  (10% height)              [starter+]      │
│   Toggle between: OI line / funding rate area / L/S bar          │
├──────────────────────────────────────────────────────────────────┤
│  PANE 3 — On-chain / Options  (5% height)        [pro only]      │
│   Crypto: exchange netflow bars                                  │
│   Stocks: options put/call ratio                                 │
└──────────────────────────────────────────────────────────────────┘
```

-----

## 9. Placement signal engine

The placement engine is the core product differentiator. It translates raw order flow events
into a confidence-scored placement recommendation displayed directly on the chart.

### 9.1 Signal trigger types and weights

|Trigger                |Weight|Data source                                 |Min tier|
|-----------------------|------|--------------------------------------------|--------|
|`cvd_divergence`       |25    |CVD vs price direction                      |free    |
|`sweep_with_absorption`|22    |sweep + large passive bid/ask absorbing     |starter |
|`delta_exhaustion`     |18    |footprint delta flips at POC level          |starter |
|`ob_wall_flip`         |15    |large limit order appeared/removed from book|starter |
|`dark_pool_confluence` |15    |dark pool print aligns with OB support      |pro     |
|`large_print_cluster`  |12    |3+ prints ≥$50k in same zone within 30s     |free    |
|`imbalance_extreme`    |10    |bid/ask ratio > 3:1 or < 1:3                |starter |
|`liquidation_approach` |10    |price within 0.5% of a liquidation cluster  |starter |
|`cvd_cross`            |8     |CVD crosses zero or user-defined threshold  |free    |
|`funding_extreme`      |8     |funding rate ±0.1% (crowding reversal)      |starter |

**Scoring:** `confidence = min(100, round((sum_of_weights / 143) * 100))`

**Minimum to emit marker:** 30 (requires at least 2 moderate triggers or 1 strong trigger).

**Direction logic:**

- If `cvd_divergence` triggered and CVD is net positive → `long`
- If `cvd_divergence` triggered and CVD is net negative → `short`
- If `sweep_with_absorption` triggered → direction from sweep side
- Otherwise → `neutral`

**Strength tiers:**

- 30–49 confidence → strength 1 (small marker, no AI call)
- 50–69 confidence → strength 2 (medium marker, Haiku explanation on hover)
- 70–100 confidence → strength 3 (large marker, auto AI explanation)

### 9.2 AI explanation integration

When a signal fires at strength ≥ 2, the `SignalTooltip` component calls
`/api/signals/chart-explain` with the signal context. The route calls the LLM router:

```typescript
// apps/web/src/app/api/signals/chart-explain/route.ts
// Tier guard: starter+ only
// Model: Haiku (starter), Sonnet (pro)

const prompt = `
Market: ${instrument} at ${price}
Triggers fired: ${triggers.join(', ')}
CVD: ${cvdValue} (${cvdDirection})
Recent large prints: ${largePrints.length} in zone
OI: ${oiValue} (${oiDelta > 0 ? 'rising' : 'falling'})
Funding: ${fundingRate}%

In 2 sentences: explain why this is a potential ${direction} placement zone
and what institutional traders are likely doing here.
`
```

### 9.3 New trigger types to add to `evaluator.py`

Existing trigger types in `evaluator.py` (lines 110–150):

- `cvd_cross` ✓
- `bid_ask_imbalance` ✓
- `large_print` ✓
- `sweep` ✓

Add to evaluator:

```python
# New trigger handlers to add:
'delta_exhaustion'       # requires footprint data — fires when delta at POC flips
'liquidation_approach'   # requires coinglass liquidation data — new channel
'funding_extreme'        # requires coinglass funding data — new channel
'ob_wall_flip'           # requires order book diff — track wall appearances/disappearances
```

-----

## 10. Backend API routes

### 10.1 New routes required

```
# Tier: free+
GET /api/markets/[instrument]/bars
  MODIFY: query ohlcv_{tf} continuous aggregate view instead of raw time_bucket
  Add: source field includes exchange list (multi-exchange aggregated for pro)

# Tier: starter+
GET /api/markets/[instrument]/footprint
  MODIFY: wire to footprint_bars hypertable (was empty, now populated by streaming.py)
  Query: SELECT * FROM footprint_bars WHERE instrument=$1 AND timeframe=$2 AND ts BETWEEN $3 AND $4

GET /api/markets/[instrument]/orderbook-history
  NEW: query order_book_snapshots with resolution parameter
  Returns: snapshots array for heatmap rendering

GET /api/markets/[instrument]/volume-profile
  NEW: aggregate footprint_bars by price level for time window
  Returns: { profile, poc, vah, val }

GET /api/markets/[instrument]/derivatives
  NEW: proxy for CoinGlass data (metric: oi | funding | liquidations | longshort)
  Backend reads from derivatives_metrics hypertable (written by coinglass-poller)

# Tier: pro
GET /api/markets/[instrument]/options-flow
  NEW: proxy for Polygon.io options trades + Deribit options events
  Backend reads from options_events hypertable

GET /api/markets/[instrument]/dark-pool
  NEW: proxy for Polygon.io ATS prints
  Backend reads from a dark_pool_prints table (new)

GET /api/markets/[instrument]/onchain
  NEW: proxy for Glassnode metrics
  Backend reads from onchain_metrics hypertable

# Tier: starter+
GET /api/signals/chart-markers
  NEW: return SignalMarker[] for an instrument + time range
  Reads from signal_events table, formats for chart rendering

POST /api/signals/chart-explain
  NEW: AI explanation for a placement signal
  Calls LLM router with signal context
  Rate limited: 10/day (starter Haiku), unlimited metered (pro Sonnet)
```

### 10.2 Middleware pattern for all new routes

All chart data routes must use the `requireChartTier` middleware pattern:

```typescript
// Pattern for every new route:
export async function GET(req: NextRequest, { params }: { params: { instrument: string } }) {
  const guard = await requireChartTier(req, 'starter') // or 'pro'
  if (!guard.allowed) return guard.response

  // ... route logic using guard.tier for conditional data enrichment
}
```

-----

## 11. Tier-gate system rework

### 11.1 What exists vs what’s needed

**Current state:** `limits.ts` has two tiers. The chart has no tier awareness.
All API routes either require authentication or are open — no per-tier data gating exists
on chart data routes.

**Target state:** Three tiers. Every chart data route enforces its minimum tier.
The WS gateway enforces tiers per channel. The chart component reads `ChartDataSources`
resolved from tier and renders only what is unlocked, with blurred ghost overlays for locked layers.

### 11.2 Stripe billing update (fix gap G15)

```typescript
// apps/web/src/app/api/billing/webhook/route.ts
// In the checkout.session.completed handler:

case 'checkout.session.completed': {
  const session = event.data.object as Stripe.Checkout.Session
  const tier = session.metadata?.tier as 'starter' | 'pro' | undefined
  if (!tier) break  // defensive

  await prisma.user.update({
    where: { id: session.metadata!.userId },
    data: {
      tier,
      // Only credit tokens for Pro
      ...(tier === 'pro' ? {
        tokenLedger: { upsert: {
          create: { balanceCents: 1000 },
          update: { balanceCents: { increment: 1000 } }
        }}
      } : {})
    }
  })
  break
}
```

-----

## 12. Notification system fix

### 12.1 Fix gap G3 — notifications silently no-op

**Current state:** All 4 notification channels (email, push, Telegram, webhook) are
code-wired but silently fail if creds are absent. Users never know their signals fired.

**Immediate owner actions (zero code, see USER_TODO.md):**

1. Set `RESEND_API_KEY` in `/opt/orderflow/.env` → email notifications activate
1. Set `VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` → browser push activates
1. Set `TELEGRAM_BOT_TOKEN` → Telegram activates

**Code fix required:** In `apps/workers/notification-dispatcher.ts`, add a startup check
that logs which channels are active:

```typescript
const activeChannels = {
  email:    !!process.env.RESEND_API_KEY,
  push:     !!process.env.VAPID_PUBLIC_KEY,
  telegram: !!process.env.TELEGRAM_BOT_TOKEN,
  webhook:  true  // always available to Pro users
}
console.log('[dispatcher] Active notification channels:', activeChannels)
```

### 12.2 Tier-gate Telegram to Pro only

Telegram is a Pro-tier feature per the subscription model. Add to dispatcher:

```typescript
if (channel === 'telegram' && user.tier !== 'pro') continue
```

-----

## 13. Infrastructure hygiene fixes

### 13.1 Fix G1 — Deploy scan worker (30 minutes)

```bash
# The scan worker code exists at:
# apps/orderflow-workers/src/ingest/scan_worker.py
# Just needs a systemd unit:

cat > /etc/systemd/system/orderflow-scan-worker.service << 'EOF'
[Unit]
Description=OrderFlow Beast — Scan worker
After=network.target redis.service postgresql.service

[Service]
Type=simple
User=orderflow
WorkingDirectory=/opt/orderflow/apps/orderflow-workers
EnvironmentFile=/opt/orderflow/.env
ExecStart=/opt/orderflow/.venv/bin/python -m src.ingest.scan_worker
Restart=always
RestartSec=10s

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now orderflow-scan-worker.service
# Effort: 30 minutes. Impact: scans go from perpetually pending to working.
```

### 13.2 Fix G6 — Move registration rate limit to Redis

```typescript
// apps/web/src/app/api/auth/register/route.ts
// Replace in-memory Map rate limiter with Redis:

import { redis } from '@/lib/redis'

async function checkRegistrationRateLimit(ip: string): Promise<boolean> {
  const key = `ratelimit:register:${ip}`
  const count = await redis.incr(key)
  if (count === 1) await redis.expire(key, 60)
  return count <= 5
}
```

### 13.3 Fix G7 — Add `/api/auth/resend` route

```typescript
// apps/web/src/app/api/auth/resend/route.ts  (NEW FILE)
export async function POST(req: NextRequest) {
  const { email } = await req.json()
  const user = await prisma.user.findUnique({ where: { email } })
  if (!user || user.status !== 'pending_verification') {
    return Response.json({ ok: true })  // silent — don't reveal user existence
  }
  await sendVerificationEmail(user)  // reuse existing email helper
  return Response.json({ ok: true })
}
```

Add a “Resend verification email” button to the login page for users with
`status === 'pending_verification'`.

### 13.4 Fix G8 — Persist CVD baselines

See §5.1 — the 60-second Redis snapshot of CVD state in `streaming.py`.

### 13.5 Fix G9 — Reduce setup cache TTL

```python
# apps/orderflow-workers/src/triggers/evaluator.py
# Change SETUP_CACHE_TTL from 30s to 5s (line ~165):
SETUP_CACHE_TTL = 5  # was 30
```

-----

## 14. Ordered work plan

Sequenced by dependency and impact. Each task is self-contained and assignable.

### Phase 0 — Critical fixes (no new features, 1 day)

|Task                                                                 |File(s)                                            |Effort|Unblocks      |
|---------------------------------------------------------------------|---------------------------------------------------|------|--------------|
|P0-1: Deploy scan worker systemd unit                                |`/etc/systemd/system/orderflow-scan-worker.service`|30 min|Scans work    |
|P0-2: Add `RESEND_API_KEY`, `VAPID_*`, `TELEGRAM_BOT_TOKEN` to `.env`|`.env`                                             |30 min|Notifications |
|P0-3: Retention policy on `order_book_snapshots`                     |`timescale.sql`                                    |10 min|DB growth cap |
|P0-4: Reduce evaluator cache TTL 30s → 5s                            |`triggers/evaluator.py:~165`                       |5 min |Faster signals|

### Phase 1 — Database foundation (1 day)

|Task                                             |File(s)                                 |Effort|
|-------------------------------------------------|----------------------------------------|------|
|P1-1: Create continuous aggregates (1m/5m/15m/1h)|`timescale.sql` (§6.3)                  |3h    |
|P1-2: Update bars API to query aggregate views   |`api/markets/[instrument]/bars/route.ts`|1h    |
|P1-3: Create `footprint_bars` hypertable         |`timescale.sql` (§6.1)                  |30 min|
|P1-4: Create `derivatives_metrics` hypertable    |`timescale.sql` (§6.1)                  |30 min|
|P1-5: Create `onchain_metrics` hypertable        |`timescale.sql` (§6.1)                  |30 min|
|P1-6: Create `options_events` hypertable         |`timescale.sql` (§6.1)                  |30 min|
|P1-7: Migrate User tier enum → `free/starter/pro`|`schema.prisma`, migration              |1h    |

### Phase 2 — Tier system (1 day)

|Task                                       |File(s)                                  |Effort|
|-------------------------------------------|-----------------------------------------|------|
|P2-1: Rewrite `limits.ts` for 3 tiers      |`lib/limits.ts` (§3.4)                   |1h    |
|P2-2: Add `requireChartTier` middleware    |`api/_middleware/chartTierGuard.ts`      |1h    |
|P2-3: Update Stripe billing for 3 tiers    |`api/billing/checkout`, `webhook` (§11.2)|2h    |
|P2-4: Add WS gateway tier enforcement      |`ws-gateway/src/index.ts` (§7.2)         |2h    |
|P2-5: Move registration rate limit to Redis|`api/auth/register/route.ts` (§13.2)     |30 min|
|P2-6: Add `/api/auth/resend` route         |`api/auth/resend/route.ts` (§13.3)       |1h    |

### Phase 3 — Ingest expansion (2–3 days)

|Task                                             |File(s)                               |Effort|
|-------------------------------------------------|--------------------------------------|------|
|P3-1: Wire `alpaca.py` + systemd unit            |`ingest/alpaca.py`, systemd unit      |1h    |
|P3-2: Add footprint computation to `streaming.py`|`analytics/streaming.py` (§5.1)       |3h    |
|P3-3: Persist CVD baseline to Redis every 60s    |`analytics/streaming.py` (§5.1, §13.4)|1h    |
|P3-4: Write `bybit.py` + systemd unit            |`ingest/bybit.py` (§5.2, §5.3)        |2h    |
|P3-5: Write `okx.py` + systemd unit              |`ingest/okx.py`                       |2h    |
|P3-6: Write `deribit.py` + systemd unit          |`ingest/deribit.py` (§4.1)            |2h    |
|P3-7: Write `coinglass_poller.py` + systemd unit |`ingest/coinglass_poller.py` (§4.2)   |2h    |
|P3-8: Write `glassnode_poller.py` + systemd unit |`ingest/glassnode_poller.py` (§4.5)   |2h    |
|P3-9: Write `polygon_stocks.py` + systemd unit   |`ingest/polygon_stocks.py` (§4.4)     |2h    |

### Phase 4 — Chart data API routes (2 days)

|Task                                         |File(s)                                      |Effort|
|---------------------------------------------|---------------------------------------------|------|
|P4-1: Wire `footprint/route.ts` to hypertable|`api/markets/[instrument]/footprint/route.ts`|1h    |
|P4-2: Build `orderbook-history/route.ts`     |NEW (§10.1)                                  |2h    |
|P4-3: Build `volume-profile/route.ts`        |NEW (§10.1)                                  |2h    |
|P4-4: Build `derivatives/route.ts`           |NEW — CoinGlass proxy (§10.1)                |2h    |
|P4-5: Build `options-flow/route.ts`          |NEW — Polygon proxy (§10.1)                  |2h    |
|P4-6: Build `dark-pool/route.ts`             |NEW — Polygon ATS proxy (§10.1)              |1h    |
|P4-7: Build `onchain/route.ts`               |NEW — Glassnode proxy (§10.1)                |1h    |
|P4-8: Build `signals/chart-markers/route.ts` |NEW (§10.1)                                  |1h    |
|P4-9: Build `signals/chart-explain/route.ts` |NEW — LLM router call (§9.2)                 |2h    |

### Phase 5 — Chart engine (3–4 days)

|Task                                               |File(s)                       |Effort|
|---------------------------------------------------|------------------------------|------|
|P5-1: Write `lib/chart/types.ts`                   |NEW                           |1h    |
|P5-2: Write `lib/chart/resolveDataSources.ts`      |NEW (§8, chart doc §3.2)      |2h    |
|P5-3: Write `lib/chart/initLayers.ts`              |NEW (chart doc §6.2)          |3h    |
|P5-4: Write `lib/chart/useChartSocket.ts`          |NEW (chart doc §5)            |2h    |
|P5-5: Write `lib/chart/placementEngine.ts`         |NEW (§9, chart doc §7)        |4h    |
|P5-6: Build `OrderFlowChart.tsx`                   |NEW (chart doc §8.2)          |4h    |
|P5-7: Build `TierGateOverlay.tsx`                  |NEW (chart doc §9)            |2h    |
|P5-8: Build `SignalTooltip.tsx`                    |NEW                           |2h    |
|P5-9: Build `ChartToolbar.tsx`                     |NEW                           |2h    |
|P5-10: Add new evaluator triggers to `evaluator.py`|`triggers/evaluator.py` (§9.3)|3h    |

### Phase 6 — Polish (1–2 days)

|Task                                              |File(s)                         |Effort|
|--------------------------------------------------|--------------------------------|------|
|P6-1: Centralize logging → pino + correlation IDs |All workers                     |3h    |
|P6-2: Health-check endpoints on all workers       |All workers                     |2h    |
|P6-3: Mobile audit for /signals, /scans, /settings|Various pages                   |4h    |
|P6-4: ESLint flat config migration                |`.eslintrc` / `eslint.config.js`|1h    |

**Total estimated effort: ~14–17 working days** for a single developer.
With two developers in parallel (one on ingest/backend, one on chart/frontend), this is
**~8–10 days** to a production-ready enhanced system.

-----

## 15. Environment variable registry

All environment variables required post-rework. Variables that exist today are marked `[EXISTS]`.

```bash
# Database
DATABASE_URL=postgresql://...                     [EXISTS]
REDIS_URL=redis://...                             [EXISTS]

# Auth
NEXTAUTH_SECRET=...                               [EXISTS]
NEXTAUTH_URL=https://orderflow-beast.com          [EXISTS]

# Stripe — existing (update with new price IDs)
STRIPE_SECRET_KEY=sk_live_...                     [EXISTS — needs key]
STRIPE_WEBHOOK_SECRET=whsec_...                   [EXISTS — needs key]
STRIPE_PRICE_STARTER=price_...                    [NEW — Stripe dashboard]
STRIPE_PRICE_PRO=price_...                        [NEW — replace STRIPE_PRICE_PRO]

# Notifications
RESEND_API_KEY=re_...                             [EXISTS — needs key]
VAPID_PUBLIC_KEY=...                              [EXISTS — needs key]
VAPID_PRIVATE_KEY=...                             [EXISTS — needs key]
TELEGRAM_BOT_TOKEN=...                            [EXISTS — needs key]

# Existing exchanges (CCXT Pro)
EXCHANGE=binance                                  [EXISTS]
BINANCE_API_KEY=...                               [EXISTS — optional for public data]

# New exchange connections
BYBIT_INSTRUMENTS=BTC/USDT:USDT,ETH/USDT:USDT   [NEW]
OKX_INSTRUMENTS=BTC-USDT-SWAP,ETH-USDT-SWAP     [NEW]
DERIBIT_INSTRUMENTS=BTC-PERPETUAL,ETH-PERPETUAL  [NEW]

# New paid data APIs
COINGLASS_API_KEY=cg_...                          [NEW — $29/mo minimum]
POLYGON_API_KEY=...                               [NEW — $29/mo Starter or $79/mo Developer]
ALPACA_API_KEY=...                                [EXISTS — code-complete, needs key]
ALPACA_API_SECRET=...                             [EXISTS — needs key]
GLASSNODE_API_KEY=...                             [NEW — $175/mo Advanced, Pro tier only]

# LLM
ANTHROPIC_API_KEY=sk-ant-...                      [EXISTS]
```

-----

## 16. Complete file map

### Modify (existing files that change)

```
apps/orderflow-workers/src/
├── ingest/binance.py              Add forceOrder + markPrice channels
├── ingest/persistence.py          Accept footprint events for new hypertable
├── analytics/streaming.py         Add footprint accumulator + CVD baseline persist
└── triggers/evaluator.py          Add 4 new trigger types; reduce cache TTL

apps/ws-gateway/src/index.ts       Add channelAllowed() tier enforcement

apps/web/src/
├── lib/
│   ├── limits.ts                  Full rewrite: 3 tiers, LIMITS object, tierAtLeast()
│   ├── ws.ts                      Minor: export channel list constant
│   └── auth.ts                    Minor: expose tier in JWT session object
├── middleware.ts                  Ensure /api/markets/* accessible to free tier
└── app/api/
    ├── markets/[instrument]/
    │   ├── bars/route.ts           Query continuous aggregate views
    │   └── footprint/route.ts      Wire to footprint_bars hypertable
    ├── billing/
    │   ├── checkout/route.ts       3-tier product mapping
    │   └── webhook/route.ts        3-tier tier-setting + conditional token credit
    └── auth/register/route.ts      Redis rate limiter

packages/db/prisma/
├── schema.prisma                  UserTier enum: free | starter | pro
└── timescale.sql                  New hypertables + continuous aggregates + retention policies
```

### Create (new files)

```
apps/orderflow-workers/src/ingest/
├── bybit.py                       Bybit WS ingest (L2 book, trades, OI, funding, liq)
├── okx.py                         OKX WS ingest (L2 book, trades, funding, OI, options)
├── deribit.py                     Deribit WS ingest (options order book, Greeks, IV)
├── polygon_stocks.py              Polygon WS ingest (stocks, options, dark pool)
├── coinglass_poller.py            CoinGlass REST poller (OI, funding, liquidations, L/S)
└── glassnode_poller.py            Glassnode REST poller (netflow, whales, LTH/STH)

/etc/systemd/system/
├── orderflow-scan-worker.service  [CRITICAL — fix G1]
├── orderflow-ingest-bybit.service
├── orderflow-ingest-okx.service
├── orderflow-ingest-alpaca.service
├── orderflow-ingest-deribit.service
├── orderflow-coinglass-poller.service
├── orderflow-glassnode-poller.service
├── orderflow-footprint-builder.service
└── orderflow-ob-retention.timer

apps/web/src/
├── lib/chart/
│   ├── types.ts
│   ├── resolveDataSources.ts
│   ├── initLayers.ts
│   ├── useChartSocket.ts
│   └── placementEngine.ts
├── components/chart/
│   ├── OrderFlowChart.tsx
│   ├── ChartToolbar.tsx
│   ├── TierGateOverlay.tsx
│   ├── SignalTooltip.tsx
│   ├── SourceBadge.tsx
│   └── panes/
│       ├── MainPane.tsx
│       ├── CvdDeltaPane.tsx
│       ├── DerivativesPane.tsx
│       └── OnchainOptionsPane.tsx
└── app/api/
    ├── markets/[instrument]/
    │   ├── orderbook-history/route.ts
    │   ├── volume-profile/route.ts
    │   ├── derivatives/route.ts
    │   ├── options-flow/route.ts
    │   ├── dark-pool/route.ts
    │   └── onchain/route.ts
    ├── signals/
    │   ├── chart-markers/route.ts
    │   └── chart-explain/route.ts
    ├── auth/resend/route.ts
    └── _middleware/chartTierGuard.ts
```

-----

## Appendix A — API cost summary at scale

|API                     |Plan               |Monthly cost                 |Shared across    |Break-even users   |
|------------------------|-------------------|-----------------------------|-----------------|-------------------|
|Exchange WS feeds       |Free               |$0                           |All users        |n/a                |
|CoinGlass               |Hobbyist → Standard|$29 → $299                   |All Starter + Pro|2 Starter users    |
|Polygon.io              |Starter → Developer|$29 → $79                    |All Starter + Pro|2 Starter users    |
|Glassnode               |Advanced           |$175                         |All Pro users    |4 Pro users        |
|Tardis.dev (optional)   |From $50           |$50+                         |Internal only    |n/a                |
|**Total infrastructure**|                   |**~$233/mo** (Starter launch)|                 |**13 paying users**|
|**Total infrastructure**|                   |**~$553/mo** (Pro launch)    |                 |**12 Pro users**   |

At 200 Starter + 50 Pro users: revenue ≈ $6,250/mo, infra ≈ $553/mo = **91% gross margin**.

-----

## Appendix B — The honest remaining synthetic paths post-rework

After completing all phases, these data paths remain synthetic or absent:

|Asset class         |Remaining gap                   |Fix cost                   |
|--------------------|--------------------------------|---------------------------|
|Forex (EURUSD etc.) |`oanda.py` code-complete, no key|1h + OANDA API key         |
|Futures (ES, NQ, CL)|No worker yet                   |3h + Polygon/Databento key |
|Commodities         |No worker yet                   |3h + data feed subscription|

These are legitimate post-v2 items. Everything else in the 5-of-6 synthetic gap is resolved
by Phase 3 (stocks via Alpaca + Polygon, crypto options via Deribit).

-----

*End of master rework document.*
*Companion: `ORDERFLOW_CHART_TECHNICAL_DOC.md` (chart engine implementation detail)*
*Source: `ARCHITECTURE.docx` (existing system as-built, 2026-06-03)*