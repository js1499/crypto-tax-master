/**
 * Postgres VarChar length caps for the Transaction model (prisma/schema.prisma).
 *
 * Any string written to one of these columns MUST fit its cap or the whole
 * prisma.transaction.create / createMany throws Prisma P2000 ("The provided value
 * for the column is too long for the column's type", Postgres SQLSTATE 22001). In a
 * batched createMany that fails the ENTIRE batch — which, depending on the caller,
 * either forces the CSV importer's binary-split fallback all the way down to slow
 * singleton inserts, or (wallet/exchange sync) silently drops the whole chunk.
 *
 * Spam / scam tokens routinely carry symbol/name strings far longer than 50 chars
 * (promotional junk, URLs, emoji), so every externally-sourced string must be clamped
 * at the DB write boundary. Keep this table in sync with the @db.VarChar(n) annotations
 * on `model Transaction`. Numeric overflow is a SEPARATE concern (Decimal(30,15) →
 * SQLSTATE 22003 → Prisma P2020) and is NOT handled here.
 */
export const TX_VARCHAR_LIMITS: Record<string, number> = {
  type: 50,
  subtype: 50,
  original_type: 50,
  status: 30,
  source: 100,
  source_type: 30,
  asset_symbol: 50,
  asset_address: 255,
  asset_chain: 30,
  incoming_asset_symbol: 50,
  incoming_asset_address: 255,
  wallet_address: 100,
  counterparty_address: 100,
  tx_hash: 255,
  chain: 30,
  holding_period: 10,
};

/**
 * Truncate a string to `max` Unicode code points. Postgres VarChar(n) counts
 * characters (code points), not UTF-16 units — and slicing by UTF-16 units can split
 * a surrogate pair, leaving a lone surrogate that Postgres rejects as invalid UTF-8.
 * Array.from() iterates by code point, so this never produces a split pair.
 */
export function clampVarchar(value: string, max: number): string {
  // Fast path: UTF-16 length is an upper bound on code-point count, so if it already
  // fits there's nothing to do (the overwhelming majority of rows).
  if (value.length <= max) return value;
  const codePoints = Array.from(value);
  if (codePoints.length <= max) return value;
  return codePoints.slice(0, max).join("");
}

/**
 * Clamp every known Transaction VarChar string field on a row object to its schema
 * cap, IN PLACE, and return the same object. Non-string values and unknown keys are
 * left untouched, so this is safe to call on a Prisma.TransactionCreateManyInput /
 * TransactionCreateInput — Decimal / Date / Boolean / relation fields are ignored.
 * Pass `stats` to count how many fields were actually shortened (for observability).
 */
export function clampTxStrings<T extends object>(row: T, stats?: { clamped: number }): T {
  const rec = row as Record<string, unknown>;
  for (const key in TX_VARCHAR_LIMITS) {
    const v = rec[key];
    if (typeof v === "string") {
      const clamped = clampVarchar(v, TX_VARCHAR_LIMITS[key]);
      if (clamped !== v) {
        rec[key] = clamped;
        if (stats) stats.clamped++;
      }
    }
  }
  return row;
}
