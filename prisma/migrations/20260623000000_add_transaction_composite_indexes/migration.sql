-- Composite indexes so per-user, time-ranged transaction queries stay fast as the
-- table grows (the weekly-heatmap GROUP BY, tax-report year-range scans, dashboards).
-- Without these, those queries scan a power user's entire row set (50-60k rows).
--
-- Plain CREATE INDEX is fine at the current ~142k rows (sub-second, brief lock).
-- For a much larger / high-traffic table, run each as CREATE INDEX CONCURRENTLY
-- (outside a transaction) instead to avoid blocking writes.

CREATE INDEX IF NOT EXISTS "transactions_user_id_tx_timestamp_idx"
  ON "transactions" ("user_id", "tx_timestamp");

CREATE INDEX IF NOT EXISTS "transactions_wallet_address_tx_timestamp_idx"
  ON "transactions" ("wallet_address", "tx_timestamp");
