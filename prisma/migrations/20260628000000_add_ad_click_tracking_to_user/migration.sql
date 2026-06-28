-- Google Ads click-ID capture (+ optional first-touch UTM) persisted onto the
-- user at signup. Hand-written SQL applied via `prisma db execute` (matches the
-- add_cost_basis_method precedent). Table name is the quoted, capitalized "User".

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "ad_click_id" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "ad_click_id_type" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "ad_click_captured_at" TIMESTAMPTZ;

-- Optional first-touch attribution. Safe to drop these four columns (and the
-- matching schema fields + capture block) if you don't want UTM tracking.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "utm_source" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "utm_medium" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "utm_campaign" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "landing_path" TEXT;
