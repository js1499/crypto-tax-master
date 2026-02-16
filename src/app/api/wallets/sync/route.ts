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

// Configure for long-running operations on Vercel
export const maxDuration = 300; // 5 minutes max execution time
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
  console.log("[Wallet Sync] ========== SYNC REQUEST RECEIVED ==========");

  try {
    // Step 1: Validate environment
    console.log("[Wallet Sync] Step 1: Checking environment...");
    if (!process.env.MORALIS_API_KEY) {
      console.error("[Wallet Sync] FATAL: MORALIS_API_KEY not configured in environment variables");
      return NextResponse.json(
        { error: "Wallet sync is not configured. MORALIS_API_KEY environment variable is missing." },
        { status: 500 }
      );
    }
    console.log("[Wallet Sync] MORALIS_API_KEY is set (length: " + process.env.MORALIS_API_KEY.length + ")");

    // Step 2: Rate limiting
    console.log("[Wallet Sync] Step 2: Checking rate limits...");
    const rateLimitResult = rateLimitAPI(request, 10);
    if (!rateLimitResult.success) {
      console.warn("[Wallet Sync] Rate limit exceeded (global)");
      return createRateLimitResponse(rateLimitResult.remaining, rateLimitResult.reset);
    }

    // Step 3: Authentication
    console.log("[Wallet Sync] Step 3: Authenticating user...");
    const user = await getCurrentUser(request);
    if (!user) {
      console.error("[Wallet Sync] Authentication failed — no user session");
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    console.log(`[Wallet Sync] Authenticated as user: ${user.id} (${user.email || "no email"})`);

    // Per-user rate limiting
    const userRateLimit = rateLimitByUser(user.id, 5);
    if (!userRateLimit.success) {
      console.warn(`[Wallet Sync] Rate limit exceeded for user ${user.id}`);
      return createRateLimitResponse(userRateLimit.remaining, userRateLimit.reset);
    }

    // Step 4: Parse request
    console.log("[Wallet Sync] Step 4: Parsing request body...");
    const body = await request.json();
    const { walletId, chains: chainsOverride, startTime, endTime, fullSync } = body;
    console.log("[Wallet Sync] Request params:", JSON.stringify({
      walletId: walletId || "(all wallets)",
      chainsOverride: chainsOverride || "(use wallet defaults)",
      startTime: startTime ? new Date(startTime).toISOString() : "(none)",
      endTime: endTime ? new Date(endTime).toISOString() : "(none)",
      fullSync: fullSync || false,
    }));

    // Step 5: Load wallets from database
    console.log("[Wallet Sync] Step 5: Loading wallets from database...");
    const where: any = { userId: user.id };
    if (walletId) {
      where.id = walletId;
    }

    const wallets = await prisma.wallet.findMany({ where });
    console.log(`[Wallet Sync] Found ${wallets.length} wallet(s) to sync`);

    if (wallets.length === 0) {
      console.warn("[Wallet Sync] No wallets found for user");
      return NextResponse.json(
        { error: "No wallets found. Please add a wallet first." },
        { status: 400 }
      );
    }

    for (const w of wallets) {
      console.log(`[Wallet Sync]   - ${w.name}: ${w.address} (provider: ${w.provider}, chains: ${w.chains || "default"}, lastSync: ${w.lastSyncAt || "never"})`);
    }

    // Clear price cache for fresh sync
    clearPriceCache();

    let totalAdded = 0;
    let totalSkipped = 0;
    let totalErrors = 0;
    const errors: string[] = [];
    const syncResults: { walletId: string; address: string; name: string; added: number; skipped: number; chains: string[] }[] = [];

    // Step 6: Sync each wallet
    for (let i = 0; i < wallets.length; i++) {
      const wallet = wallets[i];
      console.log(`\n[Wallet Sync] ===== Wallet ${i + 1}/${wallets.length}: ${wallet.name} (${wallet.address}) =====`);

      try {
        // Validate wallet address
        if (!isValidEthAddress(wallet.address)) {
          console.error(`[Wallet Sync] SKIP: Invalid EVM address format: ${wallet.address}`);
          errors.push(`${wallet.name}: Invalid EVM wallet address`);
          totalErrors++;
          continue;
        }

        // Determine chains to sync (priority: override > wallet config > defaults)
        let chainsToSync: string[] = [];

        if (chainsOverride && chainsOverride.length > 0) {
          chainsToSync = chainsOverride;
          console.log(`[Wallet Sync] Using chain override from request: ${chainsToSync.join(", ")}`);
        } else if (wallet.chains) {
          chainsToSync = wallet.chains.split(",").map((c: string) => c.trim());
          console.log(`[Wallet Sync] Using wallet's stored chains: ${chainsToSync.join(", ")}`);
        } else {
          chainsToSync = ["eth", "polygon", "arbitrum", "optimism", "base"];
          console.log(`[Wallet Sync] Using default chains: ${chainsToSync.join(", ")}`);
        }

        // Filter to only supported chains
        const unsupported = chainsToSync.filter((c) => !SUPPORTED_CHAINS[c]);
        if (unsupported.length > 0) {
          console.warn(`[Wallet Sync] Removing unsupported chains: ${unsupported.join(", ")}`);
        }
        chainsToSync = chainsToSync.filter((c) => SUPPORTED_CHAINS[c]);

        if (chainsToSync.length === 0) {
          console.error(`[Wallet Sync] SKIP: No supported chains configured for ${wallet.name}`);
          errors.push(`${wallet.name}: No supported chains configured`);
          totalErrors++;
          continue;
        }

        // Determine effective start time for incremental sync
        let effectiveStartTime = startTime;
        if (!fullSync && !startTime && wallet.lastSyncAt) {
          effectiveStartTime = wallet.lastSyncAt.getTime();
          console.log(`[Wallet Sync] Incremental sync from: ${wallet.lastSyncAt.toISOString()}`);
        } else if (fullSync) {
          console.log(`[Wallet Sync] Full sync requested — fetching all history`);
        } else {
          console.log(`[Wallet Sync] First sync — fetching all history`);
        }

        // Fetch transactions from Moralis
        console.log(`[Wallet Sync] Calling Moralis API for ${chainsToSync.length} chain(s)...`);
        const fetchStart = Date.now();

        let transactions: WalletTransaction[] = [];
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

        const fetchDuration = Date.now() - fetchStart;
        console.log(`[Wallet Sync] Moralis returned ${transactions.length} transactions in ${fetchDuration}ms`);

        // Log transaction type breakdown
        const typeCounts: Record<string, number> = {};
        for (const tx of transactions) {
          typeCounts[tx.type] = (typeCounts[tx.type] || 0) + 1;
        }
        console.log(`[Wallet Sync] Transaction types: ${JSON.stringify(typeCounts)}`);

        // Log price coverage
        const priced = transactions.filter((tx) => tx.value_usd && parseFloat(tx.value_usd.toString()) > 0).length;
        const unpriced = transactions.length - priced;
        console.log(`[Wallet Sync] Price coverage: ${priced} priced, ${unpriced} unpriced (${transactions.length > 0 ? Math.round((priced / transactions.length) * 100) : 0}%)`);

        // Store transactions in database
        console.log(`[Wallet Sync] Saving ${transactions.length} transactions to database...`);
        const saveStart = Date.now();
        let walletAdded = 0;
        let walletSkipped = 0;
        let walletErrors = 0;

        for (let j = 0; j < transactions.length; j++) {
          const tx = transactions[j];
          try {
            // Check for duplicates
            if (tx.tx_hash) {
              const existing = await prisma.transaction.findFirst({
                where: {
                  OR: [
                    { tx_hash: tx.tx_hash },
                    {
                      tx_timestamp: tx.tx_timestamp,
                      asset_symbol: tx.asset_symbol,
                      amount_value: tx.amount_value,
                      wallet_address: wallet.address,
                      source_type: "wallet",
                    },
                  ],
                },
              });

              if (existing) {
                walletSkipped++;
                totalSkipped++;
                continue;
              }
            }

            // Create transaction record
            await prisma.transaction.create({
              data: {
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
              },
            });

            walletAdded++;
            totalAdded++;

            // Progress log every 50 saves
            if ((walletAdded + walletSkipped) % 50 === 0) {
              console.log(`[Wallet Sync] Save progress: ${walletAdded + walletSkipped}/${transactions.length} (${walletAdded} added, ${walletSkipped} skipped)`);
            }
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (errorMessage.includes("Unique constraint") || errorMessage.includes("P2002")) {
              walletSkipped++;
              totalSkipped++;
            } else {
              walletErrors++;
              totalErrors++;
              console.error(`[Wallet Sync] DB error saving tx ${tx.tx_hash?.slice(0, 10)}...: ${errorMessage}`);
            }
          }
        }

        const saveDuration = Date.now() - saveStart;
        console.log(`[Wallet Sync] Save complete in ${saveDuration}ms: ${walletAdded} added, ${walletSkipped} skipped, ${walletErrors} errors`);

        syncResults.push({
          walletId: wallet.id,
          address: wallet.address,
          name: wallet.name,
          added: walletAdded,
          skipped: walletSkipped,
          chains: chainsToSync,
        });

        // Update wallet lastSyncAt
        await prisma.wallet.update({
          where: { id: wallet.id },
          data: { lastSyncAt: new Date() },
        });
        console.log(`[Wallet Sync] Updated lastSyncAt for ${wallet.name}`);

      } catch (error) {
        console.error(`[Wallet Sync] FAILED syncing ${wallet.name}:`, error);
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        errors.push(`${wallet.name}: ${errorMessage}`);
        totalErrors++;
      }
    }

    // Step 7: Build and return response
    const totalDuration = Date.now() - requestStartTime;
    console.log(`\n[Wallet Sync] ========== SYNC COMPLETE ==========`);
    console.log(`[Wallet Sync] Duration: ${totalDuration}ms (${(totalDuration / 1000).toFixed(1)}s)`);
    console.log(`[Wallet Sync] Wallets synced: ${wallets.length}`);
    console.log(`[Wallet Sync] Transactions added: ${totalAdded}`);
    console.log(`[Wallet Sync] Transactions skipped (duplicates): ${totalSkipped}`);
    console.log(`[Wallet Sync] Errors: ${totalErrors}`);
    if (errors.length > 0) {
      console.log(`[Wallet Sync] Error details: ${errors.join(" | ")}`);
    }
    console.log(`[Wallet Sync] ====================================\n`);

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
    console.error(`[Wallet Sync] FATAL ERROR after ${totalDuration}ms:`, error);

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
