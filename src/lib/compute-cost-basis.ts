import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { computeCostBasisForTransactions } from "@/lib/tax-calculator";
import { canonicalTypeForCategory } from "@/lib/transaction-categorizer";

// ── Spam-airdrop income guard ───────────────────────────────────────────────
// Moralis tags a large amount of spam as `airdrop`, and price enrichment can attach a
// garbage price to a spam token (a ticker collision, or a low-liquidity DEX quote). The
// two multiply: a 2.17-TRILLION-unit "Ark" airdrop × a $0.0001 quote booked as $266M of
// ordinary income (and minted a $266M FMV cost-basis lot). We DON'T want to book spam as
// income. An airdrop receipt is treated as spam — is_income cleared, flagged for manual
// review instead of booked — when its token quantity is absurd (spam dumps billions/
// trillions of units) OR a single receipt's value is implausibly high (a misprice tell).
// Genuinely valuable airdrops (reasonable quantity AND reasonable value) keep is_income.
const SPAM_AIRDROP_MAX_UNITS = 1_000_000_000; // ≥1B units of one airdropped token ⇒ spam
const SPAM_AIRDROP_MAX_VALUE_USD = 50_000; // a single airdrop worth >$50k ⇒ likely a misprice

/**
 * Clear is_income (and flag for review) on implausible airdrop receipts, so mispriced spam
 * isn't booked as income. Scoped to the airdrop/receive types Moralis produces so exchange
 * income (interest/staking, keyed by userId) is untouched. Runs BEFORE the cost-basis engine
 * so no phantom income event or FMV lot is ever created; idempotent (safe every recompute).
 */
export async function unflagSpamAirdropIncome(walletAddresses: string[]): Promise<number> {
  if (walletAddresses.length === 0) return 0;
  const affected = await prisma.$executeRawUnsafe(
    `
    UPDATE transactions
    SET is_income = false, needs_cost_basis_review = true
    WHERE wallet_address = ANY($1::text[])
      AND is_income = true
      AND type IN ('token receive', 'nft receive', 'receive')
      AND (ABS(amount_value) >= ${SPAM_AIRDROP_MAX_UNITS} OR ABS(value_usd) > ${SPAM_AIRDROP_MAX_VALUE_USD})
    `,
    walletAddresses,
  );
  if (affected > 0) console.log(`[Income Detect] Un-flagged ${affected} implausible (spam) airdrop income rows`);
  return affected;
}

/**
 * Apply the user's remembered type mappings (from the unmapped-type mapper): remap any transaction
 * whose type still equals a mapped rawType to the canonical type, preserving the original label in
 * original_type and setting is_income for the income category. Idempotent (already-remapped rows no
 * longer match rawType). Runs at the start of every recompute, so BOTH the map-types action AND
 * future syncs of the same raw type auto-apply the mapping without re-prompting.
 */
export async function applyUserTypeMappings(userId: string, walletAddresses: string[]): Promise<void> {
  const mappings = await prisma.userTypeMapping.findMany({ where: { userId } });
  for (const m of mappings) {
    const canonical = canonicalTypeForCategory(m.category);
    if (!canonical) continue;
    await prisma.transaction.updateMany({
      where: {
        OR: [{ wallet_address: { in: walletAddresses } }, { userId }],
        type: m.rawType,
      },
      data: {
        type: canonical,
        original_type: m.rawType,
        is_income: m.category.trim().toLowerCase() === "income",
        identified: true,
      },
    });
  }
}

/**
 * Recompute cost basis and gain/loss for all of a user's transactions.
 * Called automatically after sync/import, and manually via /api/cost-basis/compute.
 * Fire-and-forget safe — errors are logged but never thrown.
 */
export async function recomputeCostBasis(
  userId: string,
  perWallet?: boolean,
): Promise<{ computed: number; needsReview: number }> {
  const EMPTY = { computed: 0, needsReview: 0 };
  try {
    const userWithWallets = await prisma.user.findUnique({
      where: { id: userId },
      include: { wallets: true },
    });

    if (!userWithWallets) return EMPTY;

    const walletAddresses = userWithWallets.wallets.map(w => w.address);
    const costBasisMethod = (userWithWallets.costBasisMethod || "FIFO") as "FIFO" | "LIFO" | "HIFO";
    const country = (userWithWallets as any).country || "US";

    // Apply the user's remembered type mappings (remap unknown types → canonical, preserve
    // original) BEFORE computing, so both manual mapping and future syncs take effect here.
    await applyUserTypeMappings(userId, walletAddresses);

    // Clear spam-airdrop income BEFORE the engine reads is_income, so mispriced spam is
    // never booked as income nor mints a phantom FMV lot. See unflagSpamAirdropIncome.
    await unflagSpamAirdropIncome(walletAddresses);

    // Tenant isolation: a row is the user's if it's from one of their wallets
    // (wallet_address) OR explicitly owned by them (userId, for CSV/exchange). The
    // leaky exchange `source`-name branch is gone; wallet_address scoping is safe
    // (a user only matches addresses they added) and keeps shared wallets working.
    const allTransactions = await prisma.transaction.findMany({
      where: {
        OR: [
          { wallet_address: { in: walletAddresses } },
          { userId },
        ],
        status: { in: ["confirmed", "completed", "pending"] },
        // CSV imports carry their own user-provided gain/loss (from the field
        // mapper's "net gain/loss" column) — never recompute/overwrite them.
        source_type: { not: "csv_import" },
      },
      orderBy: { tx_timestamp: "asc" },
    });

    if (allTransactions.length === 0) return EMPTY;

    const results = computeCostBasisForTransactions(
      allTransactions,
      costBasisMethod,
      walletAddresses,
      perWallet,
      country,
    );

    // Bulk update via single raw SQL using VALUES list
    // This replaces 77+ sequential Prisma batch calls with one DB round trip
    if (results.length === 0) return EMPTY;

    // Flag disposals whose cost basis could not be determined, so the UI / sync
    // progress bar can surface them for review. "Missing" = the engine produced a
    // disposal (gain/loss is not null) but with NO basis, or a ZERO basis while
    // booking a positive gain (i.e. the full proceeds were taxed). Stablecoins get
    // basis forced = proceeds, so they never match this.
    // needsReview is computed centrally by computeCostBasisForTransactions so the rule
    // lives in one place (engine + report + this recompute all agree).
    const needsReviewCount = results.filter((r) => r.needsReview).length;

    const CHUNK_SIZE = 5000; // Postgres can handle large VALUES lists efficiently
    for (let i = 0; i < results.length; i += CHUNK_SIZE) {
      const chunk = results.slice(i, i + CHUNK_SIZE);
      const valuesList = chunk.map(r => {
        const cb = r.costBasisUsd !== null ? r.costBasisUsd.toString() : 'NULL';
        const gl = r.gainLossUsd !== null ? r.gainLossUsd.toString() : 'NULL';
        const hp = r.holdingPeriod ? `'${r.holdingPeriod}'` : 'NULL';
        const da = r.dateAcquired ? `'${r.dateAcquired.toISOString()}'::timestamptz` : 'NULL';
        const ncbr = r.needsReview ? 'true' : 'false';
        return `(${r.transactionId}, ${cb}::numeric(30,15), ${gl}::numeric(30,15), ${hp}::varchar(10), ${da}, ${ncbr}::boolean)`;
      }).join(',\n');

      await prisma.$executeRawUnsafe(`
        UPDATE transactions AS t
        SET cost_basis_usd = v.cb, gain_loss_usd = v.gl, holding_period = v.hp, date_acquired = v.da, needs_cost_basis_review = v.ncbr
        FROM (VALUES ${valuesList}) AS v(id, cb, gl, hp, da, ncbr)
        WHERE t.id = v.id
      `);
    }

    console.log(`[Cost Basis] Auto-computed for ${results.length} transactions (${costBasisMethod}); ${needsReviewCount} need cost-basis review`);

    // ── Auto-detect income (airdrops, rewards, vesting claims) ──
    await detectIncomeTransactions(walletAddresses, country);
    await detectGamblingTransactions(walletAddresses);

    return { computed: results.length, needsReview: needsReviewCount };
  } catch (error) {
    // Never throw — this runs as a background step after sync/import
    console.error("[Cost Basis] Auto-compute failed:", error);
    return EMPTY;
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
async function detectIncomeTransactions(walletAddresses: string[], country: string = "US"): Promise<void> {
  try {
    if (walletAddresses.length === 0) return;

    // Reset existing flags — but ONLY for the Solana rows the rules below re-flag.
    // EVM rows (chain = eth/polygon/...) and CSV imports (null wallet_address) carry
    // an is_income flag set upstream (Moralis income categories, CSV field mapper);
    // an unscoped reset would silently clobber it and NOTHING here re-flags them,
    // dropping airdrop income and later producing zero-basis disposals. Mirrors the
    // scoping in /api/income/detect.
    await prisma.$executeRawUnsafe(`
      UPDATE transactions SET is_income = false
      WHERE wallet_address = ANY($1::text[]) AND is_income = true
        AND (chain IS NULL OR chain = 'solana')
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
