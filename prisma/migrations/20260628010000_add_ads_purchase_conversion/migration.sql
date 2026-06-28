-- Fire-once guard for the Google Ads Purchase conversion: one row per paid Stripe
-- Checkout Session whose web conversion already fired. Prevents double-counting when
-- the success page is refreshed/reopened. session_id is also the transaction_id sent
-- to Google (and the id a future server-side offline upload must reuse for dedup).
CREATE TABLE IF NOT EXISTS "ads_purchase_conversion" (
  "session_id" TEXT PRIMARY KEY,
  "fired_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);
