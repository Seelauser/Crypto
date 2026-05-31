.PHONY: dev db-up db-down migrate seed typecheck lint test push-clean

# ── Local dev ─────────────────────────────────────────────────────────────────

dev:
	docker compose -f infra/docker-compose.dev.yml up -d
	pnpm dev

db-up:
	docker compose -f infra/docker-compose.dev.yml up -d

db-down:
	docker compose -f infra/docker-compose.dev.yml down

migrate:
	pnpm --filter @orderflow/db db:migrate
	psql "$(DATABASE_URL)" -f packages/db/prisma/timescale.sql

seed:
	pnpm --filter @orderflow/db db:seed

# ── Quality ───────────────────────────────────────────────────────────────────

typecheck:
	pnpm typecheck

lint:
	pnpm lint

test:
	pnpm test
	cd apps/orderflow-workers && uv run pytest tests/ -v

# ── Python workers ────────────────────────────────────────────────────────────

workers-install:
	cd apps/orderflow-workers && uv sync

ingest-binance:
	cd apps/orderflow-workers && uv run python -m src.ingest.binance

ingest-alpaca:
	cd apps/orderflow-workers && uv run python -m src.ingest.alpaca

ingest-oanda:
	cd apps/orderflow-workers && uv run python -m src.ingest.oanda

evaluator:
	cd apps/orderflow-workers && uv run python -m src.triggers.evaluator

scan-worker:
	cd apps/orderflow-workers && uv run python -m src.ingest.scan_worker

# ── Node workers ──────────────────────────────────────────────────────────────

dispatcher:
	cd apps/workers && pnpm tsx notification-dispatcher.ts

recap:
	cd apps/workers && pnpm tsx daily-recap.ts

# ── Telegram ──────────────────────────────────────────────────────────────────

telegram-webhook:
	@echo "Setting Telegram webhook to ${NEXTAUTH_URL}/api/telegram/webhook"
	curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook?url=${NEXTAUTH_URL}/api/telegram/webhook&secret_token=${TELEGRAM_WEBHOOK_SECRET}" | jq .

# ── Production ────────────────────────────────────────────────────────────────

build:
	pnpm build

prod-up:
	docker compose -f infra/docker-compose.prod.yml up -d

prod-down:
	docker compose -f infra/docker-compose.prod.yml down
