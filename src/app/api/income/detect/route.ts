import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { rateLimitAPI, createRateLimitResponse } from "@/lib/rate-limit";

/**
 * Known airdrop / merkle distributor program IDs.
 * Transactions interacting with these programs are income events.
 */
const AIRDROP_PROGRAM_IDS = new Set([
  "meRjbQXFNf5En86FXT2YPz1dQzLj4Yb3xK8u1MVgqpb", // Jupiter Merkle Distributor
  "MERLuDFBMmsHnsBPZw2sDQZHvXFMwp8EdjudcU2HKky",  // Merkle Distributor v2 (common)
]);

// JUP Jupuary distributor program IDs — handled separately with asset_symbol = 'JUP'
// filter because their signatures contain multiple token transfers (JUP + USDC + SOL).
const JUP_AIRDROP_PROGRAM_IDS = new Set([
  // Note: 61DFfe... was removed — it's used for OTC swaps (JUP↔USDC), not airdrops.
  "DiS3nNjFVMieMgmiQFm6wgJL7nevk4NrhXKLbtEH1Z2R", // Jupuary distributor v2
]);


/**
 * POST /api/income/detect
 *
 * Cross-references transactions with helius_raw_transactions to detect
 * airdrop/income events and flags them with is_income = true.
 */
export async function POST(request: NextRequest) {
  const log = (msg: string) => console.log(`[Income Detect] ${msg}`);

  try {
    const rateLimitResult = rateLimitAPI(request, 5);
    if (!rateLimitResult.success) {
      return createRateLimitResponse(rateLimitResult.remaining, rateLimitResult.reset);
    }

    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    log(`Starting income detection for user ${user.id}`);

    // Get user's wallet addresses
    const wallets = await prisma.wallet.findMany({
      where: { userId: user.id },
      select: { address: true },
    });
    const walletAddresses = wallets.map((w) => w.address);

    if (walletAddresses.length === 0) {
      return NextResponse.json({ status: "success", flagged: 0, message: "No wallets found" });
    }

    // Reset all is_income flags first (idempotent)
    await prisma.$executeRawUnsafe(`
      UPDATE transactions SET is_income = false
      WHERE wallet_address = ANY($1::text[]) AND is_income = true
    `, walletAddresses);

    let totalFlagged = 0;

    // ── Rule 1: CLAIM_REWARDS type transactions ──
    const claimRewardsResult = await prisma.$executeRawUnsafe(`
      UPDATE transactions SET is_income = true
      WHERE wallet_address = ANY($1::text[])
        AND type = 'CLAIM_REWARDS'
    `, walletAddresses);
    const claimRewardsFlagged = typeof claimRewardsResult === 'number' ? claimRewardsResult : 0;
    log(`Rule 1 (CLAIM_REWARDS): flagged ${claimRewardsFlagged}`);
    totalFlagged += claimRewardsFlagged;

    // ── Rule 2: STREAMFLOW_TIMELOCK WITHDRAW transactions ──
    // Cross-reference with helius_raw_transactions using EXISTS to avoid duplicates
    const streamflowResult = await prisma.$executeRawUnsafe(`
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
    const streamflowFlagged = typeof streamflowResult === 'number' ? streamflowResult : 0;
    log(`Rule 2 (STREAMFLOW_TIMELOCK): flagged ${streamflowFlagged}`);
    totalFlagged += streamflowFlagged;

    // ── Rule 3: Known airdrop program IDs ──
    // Check raw_payload instructions for known merkle distributor programs
    // Skip $0 value tokens (e.g. mockJUP test tokens from airdrop checkers)
    const programIds = Array.from(AIRDROP_PROGRAM_IDS);
    const airdropResult = await prisma.$executeRawUnsafe(`
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
    `, walletAddresses, programIds);
    const airdropFlagged = typeof airdropResult === 'number' ? airdropResult : 0;
    log(`Rule 3 (Airdrop programs): flagged ${airdropFlagged}`);
    totalFlagged += airdropFlagged;

    // ── Rule 4: JUP Jupuary airdrops (asset-filtered to avoid USDC/SOL false positives) ──
    const jupProgramIds = Array.from(JUP_AIRDROP_PROGRAM_IDS);
    const jupAirdropResult = await prisma.$executeRawUnsafe(`
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
    `, walletAddresses, jupProgramIds);
    const jupAirdropFlagged = typeof jupAirdropResult === 'number' ? jupAirdropResult : 0;
    log(`Rule 4 (JUP Jupuary airdrops): flagged ${jupAirdropFlagged}`);
    totalFlagged += jupAirdropFlagged;

    // ── Summary ──
    // Get total income value
    const incomeStats = await prisma.$queryRawUnsafe(`
      SELECT
        COUNT(*) as count,
        COALESCE(SUM(value_usd), 0) as total_value_usd
      FROM transactions
      WHERE wallet_address = ANY($1::text[]) AND is_income = true
    `, walletAddresses) as Array<{ count: bigint; total_value_usd: number }>;

    const stats = incomeStats[0];

    // Breakdown by source
    const breakdown = await prisma.$queryRawUnsafe(`
      SELECT
        asset_symbol,
        type,
        COUNT(*) as count,
        ROUND(SUM(value_usd)::numeric, 2) as total_value_usd,
        EXTRACT(YEAR FROM MIN(tx_timestamp))::int as earliest_year,
        EXTRACT(YEAR FROM MAX(tx_timestamp))::int as latest_year
      FROM transactions
      WHERE wallet_address = ANY($1::text[]) AND is_income = true
      GROUP BY asset_symbol, type
      ORDER BY SUM(value_usd) DESC
    `, walletAddresses);

    log(`Done. Total flagged: ${totalFlagged}, Total income value: $${stats.total_value_usd}`);

    return NextResponse.json({
      status: "success",
      flagged: totalFlagged,
      totalIncomeTransactions: Number(stats.count),
      totalIncomeValueUsd: Number(stats.total_value_usd),
      breakdown,
    });
  } catch (error) {
    console.error("[Income Detect] Error:", error);
    return NextResponse.json(
      { status: "error", error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
