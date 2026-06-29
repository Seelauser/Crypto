# OrderFlow Operations Runbook

Live deployment of `https://orderflow-beast.com` on VPS `srv860116` (147.93.57.246).

> For **how the system actually works** end-to-end (data flows, signal pipeline, honest gaps, improvement vectors), see [`ARCHITECTURE.md`](./ARCHITECTURE.md). This document is the **runbook** — what to do when something needs operating, not how it's designed.

## Quick state check

```bash
# All OrderFlow services (should be 16 running)
systemctl list-units --type=service 'orderflow-*' --no-pager --no-legend

# Public smoke (200 OK)
curl -sI https://orderflow-beast.com/ https://orderflow-beast.com/login https://orderflow-beast.com/try | head -20

# Live ingest rate (last 60s, per exchange)
sudo -u postgres psql -p 5433 -d orderflow -c \
  "SELECT exchange, count(*) AS n, max(ts) AS latest FROM market_ticks WHERE ts > now() - interval '60 seconds' GROUP BY 1;"

# Live regime + divergences (Redis is now password-protected — use -a flag or REDIS_URL from .env)
REDIS_PASS=$(grep REDIS_URL /srv/projects/orderflow/.env | sed 's|.*://:\([^@]*\)@.*|\1|')
redis-cli -a "$REDIS_PASS" HGETALL market:regime
redis-cli -a "$REDIS_PASS" LLEN market:divergences
```

## The 16 systemd services

All units live under `/etc/systemd/system/orderflow-*.service`. Configured with `EnvironmentFile=/srv/projects/orderflow/.env`, `Restart=always`, `RestartSec=15`, journaled.

**Port binding (2026-06-23):** `orderflow-api` binds to `127.0.0.1:4000` and `orderflow-ws` binds to `127.0.0.1:4001` — not 0.0.0.0. This is set via `API_HOST`/`WS_HOST` env vars read by `dist/server.js` and `dist/index.js`.

| Unit | Purpose | Port | Dependencies |
|---|---|---|---|
| `orderflow-web.service` | Next.js (standalone) | 3100 | nginx, redis, pg |
| `orderflow-api.service` | Fastify REST API | 4000 | pg, redis |
| `orderflow-ws.service` | WebSocket gateway | 4001 | redis |
| `orderflow-ingest-binance.service` | Binance L2 ingest (CCXT Pro) | — | redis |
| `orderflow-ingest-coinbase.service` | Coinbase L2 ingest | — | redis |
| `orderflow-ingest-kraken.service` | Kraken L2 ingest | — | redis |
| `orderflow-ingest-bybit.service` | Bybit L2 ingest (keyless) | — | redis |
| `orderflow-ingest-okx.service` | OKX L2 ingest (keyless, public books5/books) | — | redis |
| `orderflow-persistence.service` | Redis pubsub → TimescaleDB | — | redis, pg |
| `orderflow-streaming.service` | CVD/large-print/sweep analytics | — | redis |
| `orderflow-divergence-publisher.service` | Bullish/bearish divergence scanner (120s loop) | — | pg, redis, persistence |
| `orderflow-regime-publisher.service` | HMM regime detector (60s loop, writes `market:regime` hash) | — | pg, redis, persistence |
| `orderflow-derivatives-publisher.service` | Binance futures funding/OI poller (30s loop, keyless → `market:derivatives` + `derivatives_metrics`) | — | pg, redis |
| `orderflow-trigger-evaluator.service` | Listens to analytics events, fires user signals | — | redis, api |
| `orderflow-notification-dispatcher.service` | Email/push/Telegram fan-out for signal events | — | redis, api |

Plus one timer:

| Unit | Schedule |
|---|---|
| `orderflow-daily-recap.timer` | Daily LLM recap (Opus 4.7) |

## Restart order after a recreate

If TimescaleDB hypertables are recreated (e.g. after Prisma migrations
that touch the same DB), Prisma's pool and psycopg's prepared statements
hold stale table OIDs. **Restart in this order:**

```bash
# 1. (Idempotent) re-apply hypertables — auto-done by db:migrate now
cd /srv/projects/orderflow && pnpm --filter @orderflow/db db:timescale

# 2. Restart workers that hold DB connections
systemctl restart orderflow-persistence \
                  orderflow-divergence-publisher \
                  orderflow-regime-publisher

# 3. Restart web (Prisma client)
systemctl restart orderflow-web
```

## Web redeploy

After any web code change:

```bash
cd /srv/projects/orderflow
pnpm web:deploy        # build + stage public/static + restart orderflow-web
# OR
pnpm web:build         # build + stage only (don't touch the running unit)
```

The helper at `scripts/web-build.sh` runs `pnpm --filter @orderflow/web build` and then copies the two asset directories Next.js standalone-output doesn't auto-copy (`apps/web/public` and `apps/web/.next/static` into `apps/web/.next/standalone/apps/web/`).

## Database

Two Postgres clusters on this VPS — keep them straight:

| Cluster | Port | Hosts |
|---|---|---|
| pg14 | 5432 | goaty, solbatcher, susyx |
| **pg16** | **5433** | **orderflow** (TimescaleDB extension required) |

Connect:
```bash
sudo -u postgres psql -p 5433 -d orderflow
```

Hypertables: `market_ticks`, `ohlcv_bars`, `order_book_snapshots`. SQL definitions in `packages/db/prisma/timescale.sql`. Auto-applied by `pnpm db:migrate` / `db:push`.

## Redis

Single instance at `127.0.0.1:6379`. **Password-protected since 2026-06-23.** Password stored in `REDIS_URL` in `/srv/projects/orderflow/.env` (format: `redis://:PASSWORD@127.0.0.1:6379`).

Channels + keys are documented in `CLAUDE.md` ("Redis channels (live in prod)").

Common debug:
```bash
# Extract password from .env for CLI use
REDIS_PASS=$(grep REDIS_URL /srv/projects/orderflow/.env | sed 's|.*://:\([^@]*\)@.*|\1|')

redis-cli -a "$REDIS_PASS" pubsub channels 'market:*'
redis-cli -a "$REDIS_PASS" psubscribe 'market:cvd_update'
redis-cli -a "$REDIS_PASS" HGETALL market:regime
redis-cli -a "$REDIS_PASS" LRANGE market:divergences 0 5
```

> **Note:** If Redis auth fails, all 16 services will fail to connect. Check `requirepass` in `/etc/redis/redis.conf` matches the password in `.env`.

## nginx

Server block at `/etc/nginx/sites-enabled/orderflow-beast.com`. Terminates TLS (Let's Encrypt cert auto-renews via certbot.timer), proxies to `127.0.0.1:3100`. WebSocket upgrade headers proxy to `127.0.0.1:4001` for `/ws` (if path exists).

Reload after config edits:
```bash
nginx -t && systemctl reload nginx
```

## Logs

```bash
journalctl -u orderflow-web -f                    # web request log
journalctl -u orderflow-persistence -n 30         # ingest write rate (stats lines)
journalctl -u orderflow-regime-publisher -n 20    # regime fits
journalctl -u orderflow-trigger-evaluator -n 50   # signal firing
```

## Disaster recovery

| Failure | Recovery |
|---|---|
| Hypertables wiped (Prisma migration dropped them) | `pnpm --filter @orderflow/db db:timescale` then restart workers per "Restart order" above. Auto-prevented since session 17 (db:migrate now chains db:timescale). |
| Web build broken (typecheck fail) | Roll back the failing commit and `pnpm web:deploy`. The previous build stays in `.next/standalone` until overwritten. |
| Redis flushed | All caches/queues lost; analytics state rebuilds from live stream within ~60s. Signal-cooldown state resets (users may see duplicate notifications for ~1m). |
| Postgres lost | Restore from VPS backup (Hostinger). Hypertable retention defaults to 30 days. |
| Anthropic key revoked | Notification dispatcher swallows the AI call failure and uses a fallback string; signals still fire. |

## Cost telemetry

Anthropic spend is tracked in the `llm_calls` table (per-call cost in cents). Daily roll-up by the recap timer. Cross-reference with Susy X's Cost Center if the same key is shared (it shouldn't be — see CLAUDE.md "AI" section).

## Adding a new ingest worker (template)

The Coinbase/Kraken workers are clones of the generic `apps/orderflow-workers/src/ingest/ccxt_ingest.py` with different `EXCHANGE_ID` env var. To add Bybit:

1. Copy `/etc/systemd/system/orderflow-ingest-coinbase.service` → `orderflow-ingest-bybit.service`, set `Environment=EXCHANGE_ID=bybit`.
2. `systemctl daemon-reload && systemctl enable --now orderflow-ingest-bybit`.
3. Verify with `journalctl -u orderflow-ingest-bybit -n 10`.

For non-crypto sources (Alpaca, OANDA), the worker has to be written first — see `docs/USER_TODO.md` for what's blocked on credentials vs code.
