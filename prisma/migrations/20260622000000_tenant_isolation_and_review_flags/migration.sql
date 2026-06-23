-- Migration: tenant_isolation_and_review_flags
--
-- Purpose:
--   1. Add owner foreign keys (User -> Transaction, User -> Securities*) so tenant
--      isolation is enforced by the database, not just by query filters.
--   2. Backfill transactions.user_id from the owning wallet.
--   3. Wipe exchange-synced transactions (they had no reliable per-user key);
--      users re-sync afterward and new rows are written WITH user_id.
--   4. Add cost-basis "needs review" flags (crypto transactions + securities events).
--
-- RUN ONCE, then run `npx prisma generate`. Wrapped in a single transaction.
-- Order matters: clean/backfill BEFORE adding the foreign keys.

BEGIN;

-- 1) New columns ------------------------------------------------------------
ALTER TABLE "transactions"
  ADD COLUMN IF NOT EXISTS "needs_cost_basis_review" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "securities_taxable_events"
  ADD COLUMN IF NOT EXISTS "needs_cost_basis_review" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS "transactions_needs_cost_basis_review_idx"
  ON "transactions" ("needs_cost_basis_review");

-- 2) Backfill transactions.user_id from the owning wallet, ONLY when the
--    address maps to exactly one user (avoids shared-address mis-attribution).
UPDATE "transactions" t
SET "user_id" = w."userId"
FROM "Wallet" w
WHERE t."wallet_address" = w."address"
  AND t."user_id" IS NULL
  AND (
    SELECT COUNT(DISTINCT w2."userId") FROM "Wallet" w2
    WHERE w2."address" = t."wallet_address"
  ) = 1;

-- 3) Wipe exchange-synced transactions (no reliable per-user key existed).
--    Users re-sync; the sync routes now write user_id on every row.
DELETE FROM "transactions" WHERE "source_type" = 'exchange_api';

-- 4) Reset exchange sync cursors so the next sync refetches full history.
UPDATE "Exchange" SET "lastSyncAt" = NULL;

-- 5) Clean dangling owner references so the foreign keys can be added.
UPDATE "transactions" SET "user_id" = NULL
  WHERE "user_id" IS NOT NULL AND "user_id" NOT IN (SELECT "id" FROM "User");
DELETE FROM "securities_taxable_events"     WHERE "user_id" NOT IN (SELECT "id" FROM "User");
DELETE FROM "securities_lots"               WHERE "user_id" NOT IN (SELECT "id" FROM "User");
DELETE FROM "securities_wash_sales"         WHERE "user_id" NOT IN (SELECT "id" FROM "User");
DELETE FROM "securities_dividends"          WHERE "user_id" NOT IN (SELECT "id" FROM "User");
DELETE FROM "securities_transactions"       WHERE "user_id" NOT IN (SELECT "id" FROM "User");
DELETE FROM "securities_equivalence_groups" WHERE "user_id" NOT IN (SELECT "id" FROM "User");
DELETE FROM "securities_tax_settings"       WHERE "userId"  NOT IN (SELECT "id" FROM "User");
DELETE FROM "brokerages"                    WHERE "userId"  NOT IN (SELECT "id" FROM "User");

-- 6) Owner foreign keys -----------------------------------------------------
--    Transaction.user_id is nullable; Cascade only removes rows that are owned.
ALTER TABLE "transactions" DROP CONSTRAINT IF EXISTS "transactions_user_id_fkey";
ALTER TABLE "transactions"
  ADD CONSTRAINT "transactions_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "securities_transactions" DROP CONSTRAINT IF EXISTS "securities_transactions_user_id_fkey";
ALTER TABLE "securities_transactions"
  ADD CONSTRAINT "securities_transactions_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "securities_lots" DROP CONSTRAINT IF EXISTS "securities_lots_user_id_fkey";
ALTER TABLE "securities_lots"
  ADD CONSTRAINT "securities_lots_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "securities_taxable_events" DROP CONSTRAINT IF EXISTS "securities_taxable_events_user_id_fkey";
ALTER TABLE "securities_taxable_events"
  ADD CONSTRAINT "securities_taxable_events_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "securities_wash_sales" DROP CONSTRAINT IF EXISTS "securities_wash_sales_user_id_fkey";
ALTER TABLE "securities_wash_sales"
  ADD CONSTRAINT "securities_wash_sales_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "securities_dividends" DROP CONSTRAINT IF EXISTS "securities_dividends_user_id_fkey";
ALTER TABLE "securities_dividends"
  ADD CONSTRAINT "securities_dividends_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "securities_equivalence_groups" DROP CONSTRAINT IF EXISTS "securities_equivalence_groups_user_id_fkey";
ALTER TABLE "securities_equivalence_groups"
  ADD CONSTRAINT "securities_equivalence_groups_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- securities_tax_settings and brokerages use a camelCase "userId" column (no @map).
ALTER TABLE "securities_tax_settings" DROP CONSTRAINT IF EXISTS "securities_tax_settings_userId_fkey";
ALTER TABLE "securities_tax_settings"
  ADD CONSTRAINT "securities_tax_settings_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "brokerages" DROP CONSTRAINT IF EXISTS "brokerages_userId_fkey";
ALTER TABLE "brokerages"
  ADD CONSTRAINT "brokerages_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
