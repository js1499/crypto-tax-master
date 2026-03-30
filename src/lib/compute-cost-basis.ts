import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { computeCostBasisForTransactions } from "@/lib/tax-calculator";

/**
 * Recompute cost basis and gain/loss for all of a user's transactions.
 * Called automatically after sync/import, and manually via /api/cost-basis/compute.
 * Fire-and-forget safe — errors are logged but never thrown.
 */
export async function recomputeCostBasis(userId: string, perWallet?: boolean): Promise<void> {
  try {
    const userWithWallets = await prisma.user.findUnique({
      where: { id: userId },
      include: { wallets: true },
    });

    if (!userWithWallets) return;

    const walletAddresses = userWithWallets.wallets.map(w => w.address);
    const costBasisMethod = (userWithWallets.costBasisMethod || "FIFO") as "FIFO" | "LIFO" | "HIFO";

    // Build query conditions (same logic as cost-basis/compute endpoint)
    const orConditions: Prisma.TransactionWhereInput[] = [];

    if (walletAddresses.length > 0) {
      orConditions.push({ wallet_address: { in: walletAddresses } });
    }

    orConditions.push({
      AND: [{ source_type: "csv_import" }, { userId }],
    });

    const userExchanges = await prisma.exchange.findMany({
      where: { userId },
      select: { name: true },
    });
    const exchangeNames = userExchanges.map(e => e.name);
    if (exchangeNames.length > 0) {
      orConditions.push({
        AND: [{ source_type: "exchange_api" }, { source: { in: exchangeNames } }],
      });
    }

    const allTransactions = await prisma.transaction.findMany({
      where: {
        OR: orConditions,
        status: { in: ["confirmed", "completed", "pending"] },
      },
      orderBy: { tx_timestamp: "asc" },
    });

    if (allTransactions.length === 0) return;

    const results = computeCostBasisForTransactions(
      allTransactions,
      costBasisMethod,
      walletAddresses,
      perWallet,
    );

    // Bulk update via single raw SQL using VALUES list
    // This replaces 77+ sequential Prisma batch calls with one DB round trip
    if (results.length === 0) return;

    const CHUNK_SIZE = 5000; // Postgres can handle large VALUES lists efficiently
    for (let i = 0; i < results.length; i += CHUNK_SIZE) {
      const chunk = results.slice(i, i + CHUNK_SIZE);
      const valuesList = chunk.map(r => {
        const cb = r.costBasisUsd !== null ? r.costBasisUsd.toString() : 'NULL';
        const gl = r.gainLossUsd !== null ? r.gainLossUsd.toString() : 'NULL';
        return `(${r.transactionId}, ${cb}::numeric(30,15), ${gl}::numeric(30,15))`;
      }).join(',\n');

      await prisma.$executeRawUnsafe(`
        UPDATE transactions AS t
        SET cost_basis_usd = v.cb, gain_loss_usd = v.gl
        FROM (VALUES ${valuesList}) AS v(id, cb, gl)
        WHERE t.id = v.id
      `);
    }

    console.log(`[Cost Basis] Auto-computed for ${results.length} transactions (${costBasisMethod})`);

    // ── Auto-detect income (airdrops, rewards, vesting claims) ──
    await detectIncomeTransactions(walletAddresses);
    await detectGamblingTransactions(walletAddresses);
  } catch (error) {
    // Never throw — this runs as a background step after sync/import
    console.error("[Cost Basis] Auto-compute failed:", error);
  }
}

// ── Gambling detection ──────────────────────────────────────────────────

/** Known gambling/casino wallet addresses on Solana */
const GAMBLING_ADDRESSES = new Set([
  "G9X7F4JzLzbSGMCndiBdWNi5YzZZakmtkdwq7xS3Q3FE", // Stake.com hot wallet
  "J3ngcdbvfsofDmXphVpJdBPCATqU3uippVN8wqf7yCc2", // Flip.gg wallet
]);

/** Known gambling platform program IDs */
const GAMBLING_PROGRAM_IDS = [
  "fLiPgg2yTvmgfhiPkKriAHkDmmXGP6CdeFX9UF5o7Zc", // Flip.gg program
  "VRFzZoJdhFWL8rkvu87LpKM3RbcVezpMEc6X5GVDr7y", // ORAO VRF (casino randomness)
  "VRFCBePmGTpZ234BhbzNNzmyg39Rgdd6VgdfhHwKypU", // ORAO VRF callback
];

/** Known gambling token mints */
const GAMBLING_TOKEN_MINTS = new Set([
  "RLBxxFkseAZ4RgJH3Sqn8jXxhmGoz9jWxDNJMh8pL7a", // Rollbit RLB
  "VVWAy5U2KFd1p8AdchjUxqaJbZPBeP5vUQRZtAy8hyc", // Flip.gg FLIPGG
  "SCSuPPNUSypLBsV4darsrYNg4ANPgaGhKhsA3GmMyjz", // SolCasino SCS
]);

/** Helius source values that indicate gambling */
const GAMBLING_SOURCES = new Set([
  "FOXY_COINFLIP",
  "FOXY_RAFFLE",
  "FOXY_AUCTION",
]);

/** Prediction market program IDs (flagged for review, not auto-classified) */
const PREDICTION_MARKET_PROGRAM_IDS = [
  "dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH", // Drift BET
];

/** Helius transaction types that are gambling */
const GAMBLING_TX_TYPES = new Set([
  "PLACE_BET", "PLACE_SOL_BET", "CREATE_BET", "CREATE_RAFFLE", "BUY_TICKETS",
]);

/**
 * Detect and flag gambling transactions.
 * Sets the transaction type to a gambling-prefixed type and adds a note.
 */
async function detectGamblingTransactions(walletAddresses: string[]): Promise<void> {
  try {
    if (walletAddresses.length === 0) return;

    // Rule 1: Helius transaction types (already classified by Helius)
    const r1 = await prisma.$executeRawUnsafe(`
      UPDATE transactions SET notes = COALESCE(notes, '') || CASE WHEN notes IS NULL OR notes = '' THEN '[Gambling]' ELSE ' [Gambling]' END
      WHERE wallet_address = ANY($1::text[])
        AND type IN ('PLACE_BET', 'PLACE_SOL_BET', 'CREATE_BET', 'CREATE_RAFFLE', 'BUY_TICKETS')
        AND (notes IS NULL OR notes NOT LIKE '%[Gambling]%')
    `, walletAddresses);

    // Rule 2: Transfers to/from known gambling addresses
    const gamblingAddrs = Array.from(GAMBLING_ADDRESSES);
    await prisma.$executeRawUnsafe(`
      UPDATE transactions SET notes = COALESCE(notes, '') || CASE WHEN notes IS NULL OR notes = '' THEN '[Gambling]' ELSE ' [Gambling]' END
      WHERE wallet_address = ANY($1::text[])
        AND counterparty_address = ANY($2::text[])
        AND (notes IS NULL OR notes NOT LIKE '%[Gambling]%')
    `, walletAddresses, gamblingAddrs);

    // Rule 3: Transactions involving gambling token mints
    const gamblingMints = Array.from(GAMBLING_TOKEN_MINTS);
    await prisma.$executeRawUnsafe(`
      UPDATE transactions SET notes = COALESCE(notes, '') || CASE WHEN notes IS NULL OR notes = '' THEN '[Gambling]' ELSE ' [Gambling]' END
      WHERE wallet_address = ANY($1::text[])
        AND (asset_address = ANY($2::text[]) OR incoming_asset_address = ANY($2::text[]))
        AND (notes IS NULL OR notes NOT LIKE '%[Gambling]%')
    `, walletAddresses, gamblingMints);

    // Rule 4: Helius source indicates gambling platform
    const gamblingSources = Array.from(GAMBLING_SOURCES);
    await prisma.$executeRawUnsafe(`
      UPDATE transactions t SET notes = COALESCE(t.notes, '') || CASE WHEN t.notes IS NULL OR t.notes = '' THEN '[Gambling]' ELSE ' [Gambling]' END
      WHERE t.wallet_address = ANY($1::text[])
        AND (t.notes IS NULL OR t.notes NOT LIKE '%[Gambling]%')
        AND EXISTS (
          SELECT 1 FROM helius_raw_transactions h
          WHERE t.tx_hash LIKE h.signature || '%'
            AND h.wallet_address = t.wallet_address
            AND h.helius_source = ANY($2::text[])
        )
    `, walletAddresses, gamblingSources);

    // Rule 5: Helius raw data contains known gambling program IDs
    await prisma.$executeRawUnsafe(`
      UPDATE transactions t SET notes = COALESCE(t.notes, '') || CASE WHEN t.notes IS NULL OR t.notes = '' THEN '[Gambling]' ELSE ' [Gambling]' END
      WHERE t.wallet_address = ANY($1::text[])
        AND (t.notes IS NULL OR t.notes NOT LIKE '%[Gambling]%')
        AND EXISTS (
          SELECT 1 FROM helius_raw_transactions h
          WHERE t.tx_hash LIKE h.signature || '%'
            AND h.wallet_address = t.wallet_address
            AND EXISTS (
              SELECT 1 FROM jsonb_array_elements(h.raw_payload->'instructions') instr
              WHERE instr->>'programId' = ANY($2::text[])
            )
        )
    `, walletAddresses, GAMBLING_PROGRAM_IDS);

    // Rule 6: Flag prediction markets for review (not auto-classified as gambling)
    await prisma.$executeRawUnsafe(`
      UPDATE transactions t SET notes = COALESCE(t.notes, '') || CASE WHEN t.notes IS NULL OR t.notes = '' THEN '[Prediction Market - Review]' ELSE ' [Prediction Market - Review]' END
      WHERE t.wallet_address = ANY($1::text[])
        AND (t.notes IS NULL OR t.notes NOT LIKE '%[Prediction Market%')
        AND EXISTS (
          SELECT 1 FROM helius_raw_transactions h
          WHERE t.tx_hash LIKE h.signature || '%'
            AND h.wallet_address = t.wallet_address
            AND EXISTS (
              SELECT 1 FROM jsonb_array_elements(h.raw_payload->'instructions') instr
              WHERE instr->>'programId' = ANY($2::text[])
            )
        )
    `, walletAddresses, PREDICTION_MARKET_PROGRAM_IDS);

    const result = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*) as cnt FROM transactions
      WHERE wallet_address = ANY($1::text[]) AND notes LIKE '%[Gambling]%'
    `, walletAddresses) as Array<{ cnt: bigint }>;

    const predResult = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*) as cnt FROM transactions
      WHERE wallet_address = ANY($1::text[]) AND notes LIKE '%[Prediction Market%'
    `, walletAddresses) as Array<{ cnt: bigint }>;

    console.log(`[Gambling Detect] Flagged ${result[0].cnt} gambling transactions, ${predResult[0].cnt} prediction market transactions`);
  } catch (error) {
    console.error("[Gambling Detect] Failed:", error);
  }
}

// ── Airdrop / income detection ─────────────────────────────────────────

/**
 * Known airdrop / merkle distributor program IDs.
 */
const AIRDROP_PROGRAM_IDS = [
  "meRjbQXFNf5En86FXT2YPz1dQzLj4Yb3xK8u1MVgqpb", // Jupiter Merkle Distributor
  "MERLuDFBMmsHnsBPZw2sDQZHvXFMwp8EdjudcU2HKky",  // Merkle Distributor v2
];

// JUP Jupuary distributor program IDs — handled separately with asset_symbol filter
// because their signatures contain multiple token transfers (JUP + USDC + SOL).
const JUP_AIRDROP_PROGRAM_IDS = [
  // Note: 61DFfe... was removed — it's used for OTC swaps (JUP↔USDC), not airdrops.
  "DiS3nNjFVMieMgmiQFm6wgJL7nevk4NrhXKLbtEH1Z2R", // Jupuary distributor v2
];

/**
 * Detect and flag income transactions (airdrops, rewards, vesting claims).
 * Idempotent — resets and re-detects every time.
 */
async function detectIncomeTransactions(walletAddresses: string[]): Promise<void> {
  try {
    if (walletAddresses.length === 0) return;

    // Reset existing flags
    await prisma.$executeRawUnsafe(`
      UPDATE transactions SET is_income = false
      WHERE wallet_address = ANY($1::text[]) AND is_income = true
    `, walletAddresses);

    // Rule 1: CLAIM_REWARDS type (staking rewards, etc.)
    await prisma.$executeRawUnsafe(`
      UPDATE transactions SET is_income = true
      WHERE wallet_address = ANY($1::text[]) AND type = 'CLAIM_REWARDS'
    `, walletAddresses);

    // Rule 2: Streamflow vesting claims
    await prisma.$executeRawUnsafe(`
      UPDATE transactions t SET is_income = true
      WHERE t.wallet_address = ANY($1::text[])
        AND t.type = 'WITHDRAW'
        AND t.is_income = false
        AND EXISTS (
          SELECT 1 FROM helius_raw_transactions h
          WHERE h.wallet_address = t.wallet_address
            AND h.helius_source = 'STREAMFLOW_TIMELOCK'
            AND h.helius_type = 'WITHDRAW'
            AND t.tx_hash LIKE h.signature || '%'
        )
    `, walletAddresses);

    // Rule 3: Known airdrop program IDs (Jupiter Merkle Distributor, etc.)
    // Skip $0 value tokens (e.g. mockJUP test tokens from airdrop checkers)
    await prisma.$executeRawUnsafe(`
      UPDATE transactions t SET is_income = true
      WHERE t.wallet_address = ANY($1::text[])
        AND t.type IN ('TRANSFER_IN', 'INITIALIZE_ACCOUNT')
        AND t.is_income = false
        AND ABS(t.value_usd) > 0.01
        AND EXISTS (
          SELECT 1 FROM helius_raw_transactions h
          WHERE h.wallet_address = t.wallet_address
            AND t.tx_hash LIKE h.signature || '%'
            AND EXISTS (
              SELECT 1 FROM jsonb_array_elements(h.raw_payload->'instructions') instr
              WHERE instr->>'programId' = ANY($2::text[])
            )
        )
    `, walletAddresses, AIRDROP_PROGRAM_IDS);

    // Rule 4: JUP Jupuary airdrops — same logic as Rule 3 but restricted to JUP asset
    // to avoid false-flagging USDC/SOL transfers sharing the same Helius signature.
    await prisma.$executeRawUnsafe(`
      UPDATE transactions t SET is_income = true
      WHERE t.wallet_address = ANY($1::text[])
        AND t.type IN ('TRANSFER_IN', 'INITIALIZE_ACCOUNT')
        AND t.asset_symbol = 'JUP'
        AND t.is_income = false
        AND EXISTS (
          SELECT 1 FROM helius_raw_transactions h
          WHERE h.wallet_address = t.wallet_address
            AND t.tx_hash LIKE h.signature || '%'
            AND EXISTS (
              SELECT 1 FROM jsonb_array_elements(h.raw_payload->'instructions') instr
              WHERE instr->>'programId' = ANY($2::text[])
            )
        )
    `, walletAddresses, JUP_AIRDROP_PROGRAM_IDS);

    const result = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*) as cnt, COALESCE(SUM(value_usd), 0) as total
      FROM transactions
      WHERE wallet_address = ANY($1::text[]) AND is_income = true
    `, walletAddresses) as Array<{ cnt: bigint; total: number }>;

    console.log(`[Income Detect] Flagged ${result[0].cnt} income transactions ($${Number(result[0].total).toFixed(2)})`);
  } catch (error) {
    console.error("[Income Detect] Failed:", error);
  }
}
