-- Securities correctness fixes:
--  - original_acquisition_date: TRANSFER_IN holding-period carryover (bug #16)
--  - dedupe_hash + unique index: idempotent CSV re-import so createMany(skipDuplicates)
--    actually drops re-uploaded rows without merging legitimately-identical trades (bug #12)
ALTER TABLE "securities_transactions" ADD COLUMN IF NOT EXISTS "original_acquisition_date" DATE;
ALTER TABLE "securities_transactions" ADD COLUMN IF NOT EXISTS "dedupe_hash" TEXT;

-- Unique per (user_id, dedupe_hash). Postgres treats NULLs as distinct, so existing
-- rows (dedupe_hash NULL) are unaffected; only new imports (non-null hash) are deduped.
CREATE UNIQUE INDEX IF NOT EXISTS "securities_transactions_user_id_dedupe_hash_key"
  ON "securities_transactions" ("user_id", "dedupe_hash");
