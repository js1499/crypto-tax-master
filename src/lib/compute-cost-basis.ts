import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { computeCostBasisForTransactions } from "@/lib/tax-calculator";

/**
 * Recompute cost basis and gain/loss for all of a user's transactions.
 * Called automatically after sync/import, and manually via /api/cost-basis/compute.
 * Fire-and-forget safe — errors are logged but never thrown.
 */
export async function recomputeCostBasis(userId: string): Promise<void> {
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
      walletAddresses
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
  } catch (error) {
    // Never throw — this runs as a background step after sync/import
    console.error("[Cost Basis] Auto-compute failed:", error);
  }
}

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

    // Rule 1: CLAIM_REWARDS / HARVEST_REWARD type (staking rewards, farming, etc.)
    await prisma.$executeRawUnsafe(`
      UPDATE transactions SET is_income = true
      WHERE wallet_address = ANY($1::text[]) AND type IN ('CLAIM_REWARDS', 'HARVEST_REWARD')
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

    // Rule 5: INITIALIZE_ACCOUNT with value > $0.01
    // When a new token account is created and funded, the user received a new asset
    // they never held before — strong airdrop/reward signal.
    await prisma.$executeRawUnsafe(`
      UPDATE transactions SET is_income = true
      WHERE wallet_address = ANY($1::text[])
        AND type = 'INITIALIZE_ACCOUNT'
        AND is_income = false
        AND ABS(value_usd) > 0.01
    `, walletAddresses);

    // Rule 6: TRANSFER_IN where someone else paid the gas fee (airdrop detection)
    // If the fee_payer is NOT the user's wallet, the user received tokens without
    // initiating the transaction — this is an airdrop, reward, or gift.
    // Uses a CTE with pre-filtered helius signatures to avoid slow LIKE scans.
    await prisma.$executeRawUnsafe(`
      WITH airdrop_sigs AS (
        SELECT signature
        FROM helius_raw_transactions
        WHERE wallet_address = ANY($1::text[])
          AND fee_payer IS NOT NULL
          AND fee_payer != ANY($1::text[])
      )
      UPDATE transactions t SET is_income = true
      WHERE t.wallet_address = ANY($1::text[])
        AND t.type = 'TRANSFER_IN'
        AND t.is_income = false
        AND ABS(t.value_usd) > 0.01
        AND EXISTS (
          SELECT 1 FROM airdrop_sigs a
          WHERE t.tx_hash LIKE a.signature || '%'
        )
    `, walletAddresses);

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
