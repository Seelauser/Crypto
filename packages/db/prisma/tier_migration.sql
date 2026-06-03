-- tier_migration.sql — one-shot, idempotent upgrade of the UserTier enum
-- from { free, premium } to { free, starter, pro }.
--
-- WHY THIS IS HAND-WRITTEN: the project uses `prisma db push` (no migration
-- history). `db push` reconciles an enum value removal by recreating the type,
-- which FAILS if any row still references the removed value ('premium'). So the
-- data must be migrated to 'pro' BEFORE `db push` drops 'premium'. Postgres also
-- forbids `ALTER TYPE ... ADD VALUE` inside the same transaction that then uses
-- the new value, hence the explicit COMMITs.
--
-- RUN ORDER (production):
--   1. psql -f packages/db/prisma/tier_migration.sql   (this file)
--   2. pnpm db:push                                     (drops the now-unused 'premium')
--   3. restart orderflow-web + orderflow-persistence    (refresh cached enum OIDs)
--
-- Safe to run more than once.

-- 1. Add the new values (no-op if they already exist).
ALTER TYPE "UserTier" ADD VALUE IF NOT EXISTS 'starter';
COMMIT;
ALTER TYPE "UserTier" ADD VALUE IF NOT EXISTS 'pro';
COMMIT;

-- 2. Migrate existing paid users: premium → pro. Existing 'premium' subscribers
--    keep every feature (pro is the superset), so this is behavior-preserving.
UPDATE "users" SET tier = 'pro' WHERE tier = 'premium';
COMMIT;

-- 'premium' is intentionally left in the enum here; `prisma db push` (step 2 of
-- the run order) removes it once no rows reference it.
