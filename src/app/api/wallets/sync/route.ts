import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { rateLimitAPI, createRateLimitResponse, rateLimitByUser } from "@/lib/rate-limit";
import * as Sentry from "@sentry/nextjs";
import {
  getWalletTransactions,
  getWalletTransactionsAllChains,
  isValidEthAddress,
  clearPriceCache,
  SUPPORTED_CHAINS,
  WalletTransaction,
} from "@/lib/moralis-transactions";
import {
  getSolanaWalletTransactions,
  isValidSolanaAddress,
  clearHeliusPriceCache,
  dumpRawHeliusToDb,
} from "@/lib/helius-transactions";
import { enrichHistoricalPrices } from "@/lib/enrich-prices";

// Configure for long-running operations on Vercel
export const maxDuration = 800; // 13 minutes max execution time
export const runtime = "nodejs";

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
    const { walletId, chains: chainsOverride, startTime, endTime, fullSync } = body;

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

    // Clear price caches for fresh sync
    clearPriceCache();
    clearHeliusPriceCache();

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

        // Determine effective start time for incremental sync
        let effectiveStartTime = startTime;
        if (!fullSync && !startTime && wallet.lastSyncAt) {
          effectiveStartTime = wallet.lastSyncAt.getTime();
        }

        const syncMode = effectiveStartTime ? `incremental from ${new Date(effectiveStartTime).toISOString()}` : "full history";
        console.log(`[Wallet Sync] ${wallet.name} (${isSolana ? "solana" : chainsToSync.join(",")}) — ${syncMode}`);

        // Fetch transactions from the appropriate provider
        const fetchStart = Date.now();
        let transactions: WalletTransaction[] = [];
        let rawHeliusData: any[] = [];

        if (isSolana) {
          const result = await getSolanaWalletTransactions(
            wallet.address,
            effectiveStartTime,
            endTime
          );
          transactions = result.transactions;
          rawHeliusData = result.rawHeliusTransactions;
        } else {
          if (chainsToSync.length === 1) {
            transactions = await getWalletTransactions(
              wallet.address,
              chainsToSync[0],
              effectiveStartTime,
              endTime
            );
          } else {
            transactions = await getWalletTransactionsAllChains(
              wallet.address,
              chainsToSync,
              effectiveStartTime,
              endTime
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

        // Store transactions in database (batch approach for performance)
        const saveStart = Date.now();
        let walletAdded = 0;
        let walletSkipped = 0;
        let walletErrors = 0;

        // Batch duplicate check
        const txHashes = transactions
          .map((tx) => tx.tx_hash)
          .filter((h): h is string => !!h);

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

        // Filter out duplicates and prepare batch insert data
        const toInsert = [];
        for (const tx of transactions) {
          if (tx.tx_hash && existingHashes.has(tx.tx_hash)) {
            walletSkipped++;
            totalSkipped++;
            continue;
          }
          toInsert.push({
            type: tx.type,
            status: "confirmed",
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
            tx_hash: tx.tx_hash || null,
            wallet_address: tx.wallet_address,
            counterparty_address: tx.counterparty_address || null,
            chain: tx.chain,
            block_number: tx.block_number ? BigInt(tx.block_number) : null,
            explorer_url: tx.explorer_url || null,
            identified: false,
            notes: tx.notes || null,
            incoming_asset_symbol: tx.incoming_asset_symbol || null,
            incoming_amount_value: tx.incoming_amount_value || null,
            incoming_value_usd: tx.incoming_value_usd || null,
          });
        }

        // Batch insert with createMany
        if (toInsert.length > 0) {
          const insertChunkSize = 500;
          for (let c = 0; c < toInsert.length; c += insertChunkSize) {
            const chunk = toInsert.slice(c, c + insertChunkSize);
            try {
              const result = await prisma.transaction.createMany({
                data: chunk,
                skipDuplicates: true,
              });
              walletAdded += result.count;
              totalAdded += result.count;
              const chunkSkipped = chunk.length - result.count;
              walletSkipped += chunkSkipped;
              totalSkipped += chunkSkipped;
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : String(error);
              console.error(`[Wallet Sync] Batch insert error: ${errorMessage}`);
              walletErrors += chunk.length;
              totalErrors += chunk.length;
            }
          }
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

    // ── Enrich historical prices (server-side, no client dependency) ──
    console.log(`[Wallet Sync] Starting price enrichment for ${wallets.length} wallet(s)...`);
    const enrichResults: Record<string, any> = {};
    for (const wallet of wallets) {
      try {
        const enrichResult = await enrichHistoricalPrices(wallet.address);
        enrichResults[wallet.name || wallet.address.slice(0, 8)] = {
          updated: enrichResult.updated,
          total: enrichResult.total,
          skipped: enrichResult.skipped,
          durationMs: enrichResult.durationMs,
        };
        console.log(`[Wallet Sync] Enrichment for ${wallet.name}: ${enrichResult.updated}/${enrichResult.total} transactions updated in ${(enrichResult.durationMs / 1000).toFixed(1)}s`);
      } catch (enrichError) {
        console.error(`[Wallet Sync] Enrichment failed for ${wallet.name}:`, enrichError);
        enrichResults[wallet.name || wallet.address.slice(0, 8)] = { error: String(enrichError) };
      }
    }

    const finalDuration = Date.now() - requestStartTime;

    const response = {
      status: "success",
      message: `Synced ${wallets.length} wallet(s) in ${(finalDuration / 1000).toFixed(1)}s`,
      transactionsAdded: totalAdded,
      transactionsSkipped: totalSkipped,
      wallets: syncResults,
      enrichment: enrichResults,
      errors: errors.length > 0 ? errors : undefined,
      metrics: {
        walletsSynced: wallets.length,
        transactionsAdded: totalAdded,
        transactionsSkipped: totalSkipped,
        errorCount: totalErrors,
        syncDurationMs: totalDuration,
        enrichDurationMs: finalDuration - totalDuration,
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
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
