import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { rateLimitAPI, createRateLimitResponse, rateLimitByUser } from "@/lib/rate-limit";
import * as Sentry from "@sentry/nextjs";
import { recomputeCostBasis } from "@/lib/compute-cost-basis";
import { invalidateTaxReportCache } from "@/lib/tax-report-cache";
import { getUserPlan, countUserTransactions, LIMIT_TAX_YEAR } from "@/lib/plan-limits";
import {
  getWalletTransactions,
  getWalletTransactionsAllChains,
  getWalletTransactionsChunk,
  dumpRawMoralisToDb,
  isValidEthAddress,
  clearPriceCache,
  SUPPORTED_CHAINS,
  WalletTransaction,
} from "@/lib/moralis-transactions";
import { evmDedupKey } from "@/lib/evm-dedup";
import {
  getSolanaWalletTransactions,
  isValidSolanaAddress,
  clearHeliusPriceCache,
  dumpRawHeliusToDb,
} from "@/lib/helius-transactions";
import {
  initSyncState,
  nextPendingChain,
  applyChunkResult,
  isSyncComplete,
  syncProgressFraction,
  syncProgressSummary,
  resolveSyncWindow,
  MAX_PAGES_PER_CHUNK,
  type SyncCursorState,
} from "@/lib/sync-cursor";

// Configure for long-running operations on Vercel
export const maxDuration = 800; // 13 minutes max execution time
export const runtime = "nodejs";

/**
 * Dedup + batch-insert a set of fetched transactions for a user. Shared by the legacy
 * one-shot sync and the resumable chunked path so there is a SINGLE insert implementation.
 *
 * Dedup keys on a per-leg, per-wallet key (not the bare EVM hash, which every transfer leg
 * + both self-transfer wallets share and which silently drops legs). We ALSO look up the
 * legacy bare hash so a full re-sync of a wallet synced BEFORE the per-leg key existed is
 * not double-inserted. Honors `remainingCapacity` (plan limit) by truncating.
 */
async function persistTransactions(
  userId: string,
  transactions: WalletTransaction[],
  remainingCapacity: number,
): Promise<{ added: number; skipped: number; errors: number }> {
  let added = 0;
  let skipped = 0;
  let errors = 0;
  if (transactions.length === 0) return { added, skipped, errors };

  const lookupSet = new Set<string>();
  for (const tx of transactions) {
    const key = evmDedupKey(tx as { tx_hash?: string | null; id?: string | null; wallet_address?: string | null });
    if (key) lookupSet.add(key);
    const raw = (tx as { tx_hash?: string | null }).tx_hash;
    if (raw) lookupSet.add(raw);
  }
  const txHashes = [...lookupSet];

  const existingHashes = new Set<string>();
  if (txHashes.length > 0) {
    const hashChunkSize = 500;
    for (let h = 0; h < txHashes.length; h += hashChunkSize) {
      const hashChunk = txHashes.slice(h, h + hashChunkSize);
      const existing = await prisma.transaction.findMany({
        where: { tx_hash: { in: hashChunk } },
        select: { tx_hash: true },
      });
      for (const row of existing) {
        if (row.tx_hash) existingHashes.add(row.tx_hash);
      }
    }
  }

  const toInsert = [];
  for (const tx of transactions) {
    const dedupKey = evmDedupKey(tx as { tx_hash?: string | null; id?: string | null; wallet_address?: string | null });
    const rawHash = (tx as { tx_hash?: string | null }).tx_hash;
    if (
      (dedupKey && existingHashes.has(dedupKey)) ||
      (rawHash && rawHash !== dedupKey && existingHashes.has(rawHash))
    ) {
      skipped++;
      continue;
    }
    toInsert.push({
      userId,
      type: tx.type,
      // Use the on-chain receipt status (reverted txns -> "failed") so they're
      // excluded from cost-basis/tax instead of treated as real transfers.
      status: tx.status || "confirmed",
      source: tx.source,
      source_type: "wallet",
      asset_symbol: tx.asset_symbol,
      asset_address: tx.asset_address || null,
      asset_chain: tx.asset_chain,
      amount_value: tx.amount_value,
      price_per_unit: tx.price_per_unit,
      value_usd: tx.value_usd,
      fee_usd: tx.fee_usd,
      tx_timestamp: tx.tx_timestamp,
      tx_hash: dedupKey,
      wallet_address: tx.wallet_address,
      counterparty_address: tx.counterparty_address || null,
      chain: tx.chain,
      block_number: tx.block_number ? BigInt(tx.block_number) : null,
      explorer_url: tx.explorer_url || null,
      identified: false,
      is_income: tx.is_income ?? false,
      notes: tx.notes || null,
      incoming_asset_symbol: tx.incoming_asset_symbol || null,
      incoming_amount_value: tx.incoming_amount_value || null,
      incoming_value_usd: tx.incoming_value_usd || null,
    });
  }

  // Enforce transaction limit — truncate to remaining capacity
  if (remainingCapacity !== Infinity && toInsert.length > remainingCapacity) {
    console.log(`[Wallet Sync] Truncating ${toInsert.length} transactions to ${remainingCapacity} (plan limit)`);
    toInsert.splice(remainingCapacity);
  }

  if (toInsert.length > 0) {
    const insertChunkSize = 500;
    for (let c = 0; c < toInsert.length; c += insertChunkSize) {
      const chunk = toInsert.slice(c, c + insertChunkSize);
      try {
        const result = await prisma.transaction.createMany({
          data: chunk,
          skipDuplicates: true,
        });
        added += result.count;
        skipped += chunk.length - result.count;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[Wallet Sync] Batch insert error: ${errorMessage}`);
        errors += chunk.length;
      }
    }
  }

  return { added, skipped, errors };
}

/**
 * Resumable chunked sync for ONE wallet. The client calls this repeatedly, passing back
 * the `syncState` we return, until `done` is true. Each call does one bounded unit of
 * work — for EVM, up to MAX_PAGES_PER_CHUNK pages of the next unfinished chain (fetched,
 * priced, then persisted immediately). This keeps every request far under the serverless
 * timeout and makes progress durable: a timeout only loses the in-flight chunk, never
 * everything. Solana is not chunked (Helius wallets are small) — it runs its existing
 * one-shot fetch on the first call and reports `done: true`.
 */
async function handleResumableChunk(params: {
  user: { id: string };
  wallet: { id: string; address: string; name: string; provider: string; chains: string | null; lastSyncAt: Date | null; syncStartDate: Date | null; syncEndDate: Date | null };
  chainsOverride?: string[];
  startTime?: number;
  endTime?: number;
  fullSync?: boolean;
  syncState?: SyncCursorState;
  remainingCapacity: number;
  requestStartTime: number;
}): Promise<NextResponse> {
  const { user, wallet, chainsOverride, startTime, endTime, fullSync, remainingCapacity, requestStartTime } = params;
  let syncState = params.syncState;
  const isSolana = wallet.provider === "solana";

  // Effective [start, end] window: persisted per-wallet window (hard bound) combined with
  // any explicit request override and incremental lastSyncAt. Used on the INIT call; the
  // resumable EVM path then carries it on syncState across chunks.
  const window = resolveSyncWindow({
    bodyStartTime: startTime,
    bodyEndTime: endTime,
    walletStartMs: wallet.syncStartDate?.getTime() ?? null,
    walletEndMs: wallet.syncEndDate?.getTime() ?? null,
    lastSyncMs: wallet.lastSyncAt?.getTime() ?? null,
    fullSync,
  });
  const emptyWindowResponse = NextResponse.json({
    status: "success",
    done: true,
    transactionsAdded: 0,
    transactionsSkipped: 0,
    chunkAdded: 0,
    chunkSkipped: 0,
    progress: 1,
  });

  // ---------- Solana: not chunked; full one-shot on the (single) init call ----------
  if (isSolana) {
    if (!isValidSolanaAddress(wallet.address)) {
      return NextResponse.json({ error: `${wallet.name}: Invalid Solana wallet address` }, { status: 400 });
    }
    if (!process.env.HELIUS_API_KEY) {
      return NextResponse.json({ error: `${wallet.name}: HELIUS_API_KEY not configured` }, { status: 500 });
    }
    if (window.empty) {
      console.log(`[Wallet Sync] ${wallet.name} (solana): sync window already covered; nothing to fetch.`);
      return emptyWindowResponse;
    }

    const result = await getSolanaWalletTransactions(wallet.address, window.startTime, window.endTime);
    const persisted = await persistTransactions(user.id, result.transactions, remainingCapacity);
    if (result.rawHeliusTransactions.length > 0) {
      await dumpRawHeliusToDb(wallet.address, result.rawHeliusTransactions);
    }
    await prisma.wallet.update({ where: { id: wallet.id }, data: { lastSyncAt: new Date() } });
    await invalidateTaxReportCache(user.id);
    console.log(`[Wallet Sync] ${wallet.name} (solana) one-shot: ${persisted.added} added, ${persisted.skipped} skipped`);
    return NextResponse.json({
      status: "success",
      done: true,
      transactionsAdded: persisted.added,
      transactionsSkipped: persisted.skipped,
      chunkAdded: persisted.added,
      chunkSkipped: persisted.skipped,
      progress: 1,
    });
  }

  // ---------- EVM: bounded chunk per request ----------
  if (!isValidEthAddress(wallet.address)) {
    return NextResponse.json({ error: `${wallet.name}: Invalid EVM wallet address` }, { status: 400 });
  }
  if (!process.env.MORALIS_API_KEY) {
    return NextResponse.json({ error: `${wallet.name}: MORALIS_API_KEY not configured` }, { status: 500 });
  }

  // INIT: build state on the first request (no syncState yet).
  if (!syncState) {
    let chainsToSync: string[] = [];
    if (chainsOverride && chainsOverride.length > 0) chainsToSync = chainsOverride;
    else if (wallet.chains) chainsToSync = wallet.chains.split(",").map((c: string) => c.trim());
    else chainsToSync = ["eth", "polygon", "bsc", "arbitrum", "optimism", "base", "avalanche"];
    chainsToSync = chainsToSync.filter((c) => SUPPORTED_CHAINS[c]);
    if (chainsToSync.length === 0) {
      return NextResponse.json({ error: `${wallet.name}: No supported chains configured` }, { status: 400 });
    }
    if (window.empty) {
      console.log(`[Wallet Sync] ${wallet.name}: sync window already covered; nothing to fetch.`);
      return emptyWindowResponse;
    }
    syncState = initSyncState(wallet.id, chainsToSync, window.startTime ?? null, window.endTime ?? null);
    const win = window.startTime
      ? `from ${new Date(window.startTime).toISOString().slice(0, 10)}${window.endTime ? ` to ${new Date(window.endTime).toISOString().slice(0, 10)}` : ""}`
      : window.endTime ? `up to ${new Date(window.endTime).toISOString().slice(0, 10)}` : "full history";
    console.log(`[Wallet Sync] ${wallet.name} resumable start: chains=${chainsToSync.join(",")}, ${win}`);
  }

  if (syncState.walletId !== wallet.id) {
    return NextResponse.json({ error: "syncState does not match the requested wallet" }, { status: 400 });
  }

  // Process ONE chunk of the next unfinished chain.
  let chunkAdded = 0;
  let chunkSkipped = 0;
  const chain = nextPendingChain(syncState);
  if (chain) {
    const chunk = await getWalletTransactionsChunk(wallet.address, chain.chain, {
      cursor: chain.cursor,
      startTime: syncState.startTime ?? undefined,
      endTime: syncState.endTime ?? undefined,
      maxPages: MAX_PAGES_PER_CHUNK,
    });
    const persisted = await persistTransactions(user.id, chunk.transactions, remainingCapacity);
    chunkAdded = persisted.added;
    chunkSkipped = persisted.skipped;
    // Store the raw Moralis payloads for this chunk (audit: raw vs. our categorization/P&L).
    await dumpRawMoralisToDb(wallet.address, chain.chain, chunk.rawTransactions);
    applyChunkResult(syncState, chain, {
      nextCursor: chunk.nextCursor,
      added: persisted.added,
      skipped: persisted.skipped,
      errors: persisted.errors,
      pages: chunk.pagesFetched,
      raw: chunk.rawCount,
    });
    if (chain.done && chunk.nextCursor !== null) {
      console.warn(`[Wallet Sync] ${wallet.name}: ${chain.chain} hit the per-chain page bound (${chain.pages}); oldest history beyond it was NOT fetched.`);
    }
  }

  const done = isSyncComplete(syncState);
  if (done) {
    await prisma.wallet.update({ where: { id: wallet.id }, data: { lastSyncAt: new Date() } });
    await invalidateTaxReportCache(user.id);
    console.log(`[Wallet Sync] ${wallet.name} resumable COMPLETE: ${syncProgressSummary(syncState)} (last chunk ${((Date.now() - requestStartTime) / 1000).toFixed(1)}s)`);
  }

  return NextResponse.json({
    status: "success",
    done,
    syncState,
    transactionsAdded: syncState.totalAdded,
    transactionsSkipped: syncState.totalSkipped,
    chunkAdded,
    chunkSkipped,
    progress: done ? 1 : syncProgressFraction(syncState),
    summary: syncProgressSummary(syncState),
  });
}

/**
 * POST /api/wallets/sync
 * Sync transactions from a wallet using Moralis API
 * Body: {
 *   walletId?: string,    // Optional: sync specific wallet, otherwise sync all user wallets
 *   chains?: string[],    // Optional: specific chains to sync (only used as override)
 *   startTime?: number,   // Optional: Unix timestamp in milliseconds
 *   endTime?: number,     // Optional: Unix timestamp in milliseconds
 *   fullSync?: boolean    // Optional: if true, ignores lastSyncAt and fetches all history
 * }
 */
export async function POST(request: NextRequest) {
  const requestStartTime = Date.now();

  try {
    // Validate environment
    const hasMoralis = !!process.env.MORALIS_API_KEY;
    const hasHelius = !!process.env.HELIUS_API_KEY;
    if (!hasMoralis && !hasHelius) {
      console.error("[Wallet Sync] FATAL: No API keys configured (MORALIS/HELIUS)");
      return NextResponse.json(
        { error: "Wallet sync is not configured. No API keys set for wallet providers." },
        { status: 500 }
      );
    }

    // Rate limiting
    const rateLimitResult = rateLimitAPI(request, 10);
    if (!rateLimitResult.success) {
      return createRateLimitResponse(rateLimitResult.remaining, rateLimitResult.reset);
    }

    // Authentication
    const user = await getCurrentUser(request);
    if (!user) {
      console.error("[Wallet Sync] Auth failed");
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const userRateLimit = rateLimitByUser(user.id, 5);
    if (!userRateLimit.success) {
      return createRateLimitResponse(userRateLimit.remaining, userRateLimit.reset);
    }

    // Parse request
    const body = await request.json();
    const { walletId, chains: chainsOverride, startTime, endTime, fullSync, resumable } = body;
    const syncState = body.syncState as SyncCursorState | undefined;

    // Load wallets
    const where: any = { userId: user.id };
    if (walletId) {
      where.id = walletId;
    }

    const wallets = await prisma.wallet.findMany({ where });

    if (wallets.length === 0) {
      return NextResponse.json(
        { error: "No wallets found. Please add a wallet first." },
        { status: 400 }
      );
    }

    console.log(`[Wallet Sync] User ${user.id} syncing ${wallets.length} wallet(s): ${wallets.map(w => `${w.name}/${w.provider}`).join(", ")}${fullSync ? " (full)" : ""}`);

    // Check transaction limit for user's plan
    const userPlan = await getUserPlan(user.id);
    const currentTxCount = await countUserTransactions(user.id);
    let remainingCapacity = userPlan.transactionLimit === Infinity
      ? Infinity
      : Math.max(0, userPlan.transactionLimit - currentTxCount);

    if (remainingCapacity <= 0 && userPlan.transactionLimit !== Infinity) {
      return NextResponse.json(
        { error: `${LIMIT_TAX_YEAR} transaction limit reached (${userPlan.transactionLimit.toLocaleString()} for ${userPlan.planName} plan). Upgrade your plan to sync more transactions.` },
        { status: 403 }
      );
    }

    // Clear price caches for fresh sync
    clearPriceCache();
    clearHeliusPriceCache();

    // ── Resumable chunked path (opt-in) ──
    // The client sends `resumable: true` (and thereafter passes back `syncState`) to sync
    // ONE wallet across many short requests, each doing a bounded chunk. This keeps every
    // request under the serverless timeout and persists progress per chunk, so a huge
    // wallet no longer fails whole-hog. Callers that omit `resumable` keep the legacy
    // one-shot behavior below (fine for small CSV/manual syncs).
    if (resumable || syncState) {
      const targetId = syncState?.walletId || walletId;
      const wallet = targetId ? wallets.find((w) => w.id === targetId) : wallets[0];
      if (!wallet) {
        return NextResponse.json({ error: "Wallet not found for resumable sync" }, { status: 400 });
      }
      return await handleResumableChunk({
        user,
        wallet,
        chainsOverride,
        startTime,
        endTime,
        fullSync,
        syncState,
        remainingCapacity,
        requestStartTime,
      });
    }

    let totalAdded = 0;
    let totalSkipped = 0;
    let totalErrors = 0;
    const errors: string[] = [];
    const syncResults: { walletId: string; address: string; name: string; added: number; skipped: number; chains: string[] }[] = [];

    // Sync each wallet
    for (let i = 0; i < wallets.length; i++) {
      const wallet = wallets[i];

      try {
        const isSolana = wallet.provider === "solana";

        // Validate wallet address based on provider
        if (isSolana) {
          if (!isValidSolanaAddress(wallet.address)) {
            console.error(`[Wallet Sync] SKIP ${wallet.name}: invalid Solana address`);
            errors.push(`${wallet.name}: Invalid Solana wallet address`);
            totalErrors++;
            continue;
          }
          if (!process.env.HELIUS_API_KEY) {
            console.error(`[Wallet Sync] SKIP ${wallet.name}: HELIUS_API_KEY not set`);
            errors.push(`${wallet.name}: HELIUS_API_KEY not configured`);
            totalErrors++;
            continue;
          }
        } else {
          if (!isValidEthAddress(wallet.address)) {
            console.error(`[Wallet Sync] SKIP ${wallet.name}: invalid EVM address`);
            errors.push(`${wallet.name}: Invalid EVM wallet address`);
            totalErrors++;
            continue;
          }
          if (!process.env.MORALIS_API_KEY) {
            console.error(`[Wallet Sync] SKIP ${wallet.name}: MORALIS_API_KEY not set`);
            errors.push(`${wallet.name}: MORALIS_API_KEY not configured`);
            totalErrors++;
            continue;
          }
        }

        // Determine chains to sync (only for EVM wallets)
        let chainsToSync: string[] = [];

        if (!isSolana) {
          if (chainsOverride && chainsOverride.length > 0) {
            chainsToSync = chainsOverride;
          } else if (wallet.chains) {
            chainsToSync = wallet.chains.split(",").map((c: string) => c.trim());
          } else {
            chainsToSync = ["eth", "polygon", "bsc", "arbitrum", "optimism", "base", "avalanche"];
          }

          // Filter to only supported chains
          chainsToSync = chainsToSync.filter((c) => SUPPORTED_CHAINS[c]);

          if (chainsToSync.length === 0) {
            console.error(`[Wallet Sync] SKIP ${wallet.name}: no supported chains`);
            errors.push(`${wallet.name}: No supported chains configured`);
            totalErrors++;
            continue;
          }
        }

        // Determine effective [start, end] window: persisted per-wallet window (hard
        // bound) combined with any explicit request override and incremental lastSyncAt.
        const window = resolveSyncWindow({
          bodyStartTime: startTime,
          bodyEndTime: endTime,
          walletStartMs: wallet.syncStartDate?.getTime() ?? null,
          walletEndMs: wallet.syncEndDate?.getTime() ?? null,
          lastSyncMs: wallet.lastSyncAt?.getTime() ?? null,
          fullSync,
        });
        if (window.empty) {
          console.log(`[Wallet Sync] ${wallet.name}: sync window already covered; nothing to fetch.`);
          syncResults.push({ walletId: wallet.id, address: wallet.address, name: wallet.name, added: 0, skipped: 0, chains: isSolana ? ["solana"] : chainsToSync });
          continue;
        }
        const effectiveStartTime = window.startTime;
        const effectiveEndTime = window.endTime;

        const syncMode = effectiveStartTime
          ? `from ${new Date(effectiveStartTime).toISOString().slice(0, 10)}${effectiveEndTime ? ` to ${new Date(effectiveEndTime).toISOString().slice(0, 10)}` : ""}`
          : effectiveEndTime ? `up to ${new Date(effectiveEndTime).toISOString().slice(0, 10)}` : "full history";
        console.log(`[Wallet Sync] ${wallet.name} (${isSolana ? "solana" : chainsToSync.join(",")}) — ${syncMode}`);

        // Fetch transactions from the appropriate provider
        const fetchStart = Date.now();
        let transactions: WalletTransaction[] = [];
        let rawHeliusData: any[] = [];

        if (isSolana) {
          const result = await getSolanaWalletTransactions(
            wallet.address,
            effectiveStartTime,
            effectiveEndTime
          );
          transactions = result.transactions;
          rawHeliusData = result.rawHeliusTransactions;
        } else {
          if (chainsToSync.length === 1) {
            transactions = await getWalletTransactions(
              wallet.address,
              chainsToSync[0],
              effectiveStartTime,
              effectiveEndTime
            );
          } else {
            transactions = await getWalletTransactionsAllChains(
              wallet.address,
              chainsToSync,
              effectiveStartTime,
              effectiveEndTime
            );
          }
        }

        const fetchDuration = Date.now() - fetchStart;

        // Transaction type breakdown
        const typeCounts: Record<string, number> = {};
        for (const tx of transactions) {
          typeCounts[tx.type] = (typeCounts[tx.type] || 0) + 1;
        }
        const priced = transactions.filter((tx) => tx.value_usd && parseFloat(tx.value_usd.toString()) > 0).length;
        console.log(`[Wallet Sync] ${wallet.name}: ${transactions.length} tx in ${fetchDuration}ms | types: ${JSON.stringify(typeCounts)} | ${priced}/${transactions.length} priced`);

        // Store transactions in database (dedup + batch insert; shared with the
        // resumable path via persistTransactions).
        const saveStart = Date.now();
        const persisted = await persistTransactions(user.id, transactions, remainingCapacity);
        const walletAdded = persisted.added;
        const walletSkipped = persisted.skipped;
        const walletErrors = persisted.errors;
        totalAdded += walletAdded;
        totalSkipped += walletSkipped;
        totalErrors += walletErrors;

        // Decrease remaining capacity after this wallet
        if (remainingCapacity !== Infinity) {
          remainingCapacity = Math.max(0, remainingCapacity - walletAdded);
        }

        const saveDuration = Date.now() - saveStart;
        console.log(`[Wallet Sync] ${wallet.name} saved: ${walletAdded} added, ${walletSkipped} dupes skipped, ${walletErrors} errors (${saveDuration}ms)`);

        syncResults.push({
          walletId: wallet.id,
          address: wallet.address,
          name: wallet.name,
          added: walletAdded,
          skipped: walletSkipped,
          chains: isSolana ? ["solana"] : chainsToSync,
        });

        // Update wallet lastSyncAt
        await prisma.wallet.update({
          where: { id: wallet.id },
          data: { lastSyncAt: new Date() },
        });

        // Dump raw Helius data to DB AFTER main transactions are saved
        if (rawHeliusData.length > 0) {
          await dumpRawHeliusToDb(wallet.address, rawHeliusData);
        }

      } catch (error) {
        console.error(`[Wallet Sync] FAILED ${wallet.name}:`, error);
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        errors.push(`${wallet.name}: ${errorMessage}`);
        totalErrors++;
      }
    }

    // Summary
    const totalDuration = Date.now() - requestStartTime;
    console.log(`[Wallet Sync] Done in ${(totalDuration / 1000).toFixed(1)}s: ${totalAdded} added, ${totalSkipped} skipped, ${totalErrors} errors across ${wallets.length} wallet(s)${errors.length > 0 ? ` | errors: ${errors.join(" | ")}` : ""}`);

    // Invalidate tax report cache after transaction mutations
    // Note: cost basis is NOT auto-computed here — run enrichment first, then compute
    await invalidateTaxReportCache(user.id);

    const response = {
      status: "success",
      message: `Synced ${wallets.length} wallet(s) in ${(totalDuration / 1000).toFixed(1)}s`,
      transactionsAdded: totalAdded,
      transactionsSkipped: totalSkipped,
      wallets: syncResults,
      errors: errors.length > 0 ? errors : undefined,
      metrics: {
        walletsSynced: wallets.length,
        transactionsAdded: totalAdded,
        transactionsSkipped: totalSkipped,
        errorCount: totalErrors,
        syncDurationMs: totalDuration,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    const totalDuration = Date.now() - requestStartTime;
    console.error(`[Wallet Sync] FATAL after ${(totalDuration / 1000).toFixed(1)}s:`, error);

    Sentry.captureException(error, {
      tags: { endpoint: "/api/wallets/sync" },
    });

    return NextResponse.json(
      {
        error: "Failed to sync wallets",
        details: process.env.NODE_ENV === "development" ? (error instanceof Error ? error.message : "Unknown error") : "An internal error occurred",
      },
      { status: 500 }
    );
  }
}
