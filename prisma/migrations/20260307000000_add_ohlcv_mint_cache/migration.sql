-- Cache table for OHLCV mint lookups
-- Persists 404/null results so subsequent enrichment runs skip already-failed mints
CREATE TABLE IF NOT EXISTS "ohlcv_mint_cache" (
  "mint_address" VARCHAR(255) NOT NULL,
  "has_data" BOOLEAN NOT NULL DEFAULT false,
  "checked_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "ohlcv_mint_cache_pkey" PRIMARY KEY ("mint_address")
);
