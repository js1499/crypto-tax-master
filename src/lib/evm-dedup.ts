const EVM_HASH_RE = /^0x[0-9a-fA-F]{64}$/;

/**
 * Build a per-leg, per-wallet dedup key for a synced transaction record.
 *
 * A bare EVM tx hash is shared by EVERY transfer leg of one on-chain tx (e.g. an
 * airdrop of 2+ ERC-20s, or native + ERC-20 in one tx) AND by both wallets of a
 * self-transfer. Using it as the unique key silently drops legs — `createMany`
 * `skipDuplicates` (and the global `tx_hash` unique) keep only one. For EVM records we
 * instead key on the record's unique per-leg `id` plus the wallet being synced, so no
 * leg is dropped and the two legs of a self-transfer both survive.
 *
 * Non-EVM records pass through unchanged: Solana sub-tx ids ("sig-0", "sig-1") and
 * exchange ids are already unique per leg, and the Solana price-enrichment join relies
 * on `SPLIT_PART(tx_hash, '-', 1) = signature`, which must not change.
 *
 * The key stays `<hash>-...` so the raw hash is still recoverable as the segment before
 * the first "-" (a bare EVM hash contains no "-").
 */
export function evmDedupKey(rec: {
  tx_hash?: string | null;
  id?: string | null;
  wallet_address?: string | null;
}): string | null {
  if (rec.tx_hash && EVM_HASH_RE.test(rec.tx_hash) && rec.id) {
    return `${rec.id}-${(rec.wallet_address || "").toLowerCase()}`;
  }
  return rec.tx_hash ?? null;
}
