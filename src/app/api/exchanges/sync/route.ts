import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { rateLimitAPI, createRateLimitResponse, rateLimitByUser } from "@/lib/rate-limit";
import * as Sentry from "@sentry/nextjs";
import {
  decryptApiKey,
  BinanceClient,
  KrakenClient,
  KuCoinClient,
  GeminiClient,
} from "@/lib/exchange-clients";
import { getCoinbaseTransactions, getCoinbaseTransactionsWithApiKey } from "@/lib/coinbase-transactions";
import { recomputeCostBasis } from "@/lib/compute-cost-basis";
import { invalidateTaxReportCache } from "@/lib/tax-report-cache";
import { getUserPlan, countUserTransactions, LIMIT_TAX_YEAR } from "@/lib/plan-limits";
import { resolveSyncWindow } from "@/lib/sync-cursor";
import { getCategory } from "@/lib/transaction-categorizer";
import { clampTxStrings } from "@/lib/tx-column-limits";

// Encryption key - REQUIRED for decrypting exchange credentials
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
if (!ENCRYPTION_KEY) {
  console.error("[CRITICAL] ENCRYPTION_KEY environment variable is not set!");
}

// Configure for long-running operations on Vercel
export const maxDuration = 800; // headroom for large-account fetch + batched save (plan ceiling)
export const runtime = 'nodejs';

/**
 * POST /api/exchanges/sync
 * Sync transactions from connected exchanges
 * Body: {
 *   exchangeId?: string, // Optional: sync specific exchange, otherwise sync all
 *   startTime?: number, // Optional: Unix timestamp in milliseconds
 *   endTime?: number    // Optional: Unix timestamp in milliseconds
 * }
 */
export async function POST(request: NextRequest) {
  const requestStartMs = Date.now(); // Track request start time for metrics (body.startTime shadows below)

  try {
    // Verify encryption key is available
    if (!ENCRYPTION_KEY) {
      console.error("[Exchange Sync] ENCRYPTION_KEY not configured");
      return NextResponse.json(
        { error: "Server configuration error. Please contact support." },
        { status: 500 }
      );
    }

    // Rate limiting
    const rateLimitResult = rateLimitAPI(request, 10); // 10 syncs per minute
    if (!rateLimitResult.success) {
      return createRateLimitResponse(
        rateLimitResult.remaining,
        rateLimitResult.reset
      );
    }

    // Get user authentication - pass request for proper Vercel session handling
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    // Additional rate limiting by user
    const userRateLimit = rateLimitByUser(user.id, 5); // 5 syncs per minute per user
    if (!userRateLimit.success) {
      return createRateLimitResponse(
        userRateLimit.remaining,
        userRateLimit.reset
      );
    }

    // Parse request body
    const body = await request.json();
    let { exchangeId, startTime, endTime, fullSync } = body;

    // PRD: Support incremental sync using last sync timestamp
    // If fullSync is not explicitly requested and no startTime provided,
    // use lastSyncAt for incremental syncing

    // Get exchanges to sync
    const where: any = {
      userId: user.id,
      isConnected: true,
    };
    if (exchangeId) {
      where.id = exchangeId;
    }

    const exchanges = await prisma.exchange.findMany({ where });

    if (exchanges.length === 0) {
      return NextResponse.json(
        { error: "No connected exchanges found" },
        { status: 400 }
      );
    }

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

    let totalAdded = 0;
    let totalSkipped = 0;
    const errors: string[] = [];

    // Sync each exchange
    for (const exchange of exchanges) {
      try {
        let transactions: any[] = [];

        // Effective [start, end] window: persisted per-exchange window (hard bound) +
        // explicit request override + incremental lastSyncAt. resolveSyncWindow also flags
        // an inverted window (a closed past window already fully synced) so we skip it.
        const window = resolveSyncWindow({
          bodyStartTime: startTime,
          bodyEndTime: endTime,
          walletStartMs: exchange.syncStartDate?.getTime() ?? null,
          walletEndMs: exchange.syncEndDate?.getTime() ?? null,
          lastSyncMs: exchange.lastSyncAt?.getTime() ?? null,
          fullSync,
        });
        if (window.empty) {
          console.log(`[Exchange Sync] ${exchange.name}: sync window already covered; nothing to fetch.`);
          continue;
        }
        const effectiveStartTime = window.startTime;
        const effectiveEndTime = window.endTime;
        console.log(`[Exchange Sync] ${exchange.name}: window ${effectiveStartTime ? new Date(effectiveStartTime).toISOString().slice(0, 10) : "full"}${effectiveEndTime ? " to " + new Date(effectiveEndTime).toISOString().slice(0, 10) : ""}`);

        // Decrypt credentials
        const apiKey = exchange.apiKey
          ? decryptApiKey(exchange.apiKey, ENCRYPTION_KEY)
          : null;
        const apiSecret = exchange.apiSecret
          ? decryptApiKey(exchange.apiSecret, ENCRYPTION_KEY)
          : null;
        const apiPassphrase = exchange.apiPassphrase
          ? decryptApiKey(exchange.apiPassphrase, ENCRYPTION_KEY)
          : null;

        // Skip exchanges missing usable credentials so we don't advance lastSyncAt for a
        // no-op fetch (which would make the persisted window look "already covered").
        // Coinbase can also auth via refreshToken (OAuth), so it's validated in its own case.
        if (exchange.name.toLowerCase() !== "coinbase") {
          const needsPassphrase = exchange.name.toLowerCase() === "kucoin";
          if (!apiKey || !apiSecret || (needsPassphrase && !apiPassphrase)) {
            errors.push(`${exchange.name}: missing API credentials — please reconnect`);
            continue;
          }
        }

        // Fetch transactions based on exchange type
        switch (exchange.name.toLowerCase()) {
          case "binance":
            if (apiKey && apiSecret) {
              const client = new BinanceClient(apiKey, apiSecret);
              transactions = await client.getAllTrades(effectiveStartTime, effectiveEndTime);
            }
            break;

          case "kraken":
            if (apiKey && apiSecret) {
              const krakenClient = new KrakenClient(apiKey, apiSecret);
              transactions = await krakenClient.getAllTransactions(effectiveStartTime, effectiveEndTime);
            }
            break;

          case "kucoin":
            if (apiKey && apiSecret && apiPassphrase) {
              const isKuCoinSandbox = apiKey.includes("sandbox") || process.env.KUCOIN_SANDBOX === "true";
              const client = new KuCoinClient(apiKey, apiSecret, apiPassphrase, isKuCoinSandbox);
              transactions = await client.getAllTransactions(effectiveStartTime, effectiveEndTime);
            }
            break;

          case "gemini":
            if (apiKey && apiSecret) {
              // Detect sandbox keys
              const isSandbox = apiKey.startsWith("master-") || apiKey.includes("sandbox");
              const client = new GeminiClient(apiKey, apiSecret, isSandbox);
              transactions = await client.getAllTransactions(effectiveStartTime, effectiveEndTime);
            }
            break;

          case "coinbase":
            console.log("[Exchange Sync] ========== COINBASE SYNC START ==========");
            console.log("[Exchange Sync] Coinbase credentials check:", {
              hasApiKey: !!exchange.apiKey,
              hasApiSecret: !!exchange.apiSecret,
              hasRefreshToken: !!exchange.refreshToken,
              exchangeId: exchange.id,
            });

            // Support both OAuth (refreshToken) and API Key authentication
            // Note: Coinbase functions expect ENCRYPTED credentials (they decrypt internally)
            if (exchange.apiKey && exchange.apiSecret) {
              // Use API Key authentication (pass encrypted credentials - function decrypts them)
              console.log("[Exchange Sync] Using API Key authentication for Coinbase");
              try {
                transactions = await getCoinbaseTransactionsWithApiKey(
                  exchange.apiKey,  // Pass encrypted, not decrypted
                  exchange.apiSecret,  // Pass encrypted, not decrypted
                  effectiveStartTime,
                  effectiveEndTime,
                  exchange.id
                );
                console.log(`[Exchange Sync] Coinbase API Key returned ${transactions.length} transactions`);
              } catch (error) {
                console.error("[Exchange Sync] Coinbase API Key error:", error instanceof Error ? error.message : error);
                const errorMessage = error instanceof Error ? error.message : "Unknown error";
                let userMessage = "Failed to fetch transactions";

                if (errorMessage === "CREDENTIALS_DECRYPT_FAILED") {
                  userMessage = "Unable to access Coinbase credentials. Please reconnect.";
                } else if (errorMessage.includes("401") || errorMessage.includes("Invalid")) {
                  userMessage = "Coinbase API key is invalid. Please reconnect with new credentials.";
                }

                errors.push(`Coinbase: ${userMessage}`);
                continue;
              }
            } else if (exchange.refreshToken) {
              // Use OAuth flow with encrypted tokens
              console.log("[Exchange Sync] Using OAuth authentication for Coinbase");
              try {
                transactions = await getCoinbaseTransactions(
                  exchange.refreshToken,
                  effectiveStartTime,
                  effectiveEndTime,
                  exchange.id
                );
                console.log(`[Exchange Sync] Coinbase OAuth returned ${transactions.length} transactions`);
              } catch (error) {
                console.error("[Exchange Sync] Coinbase OAuth error:", error instanceof Error ? error.message : error);
                const errorMessage = error instanceof Error ? error.message : "Unknown error";
                let userMessage = "Failed to fetch transactions";

                if (errorMessage === "TOKEN_REFRESH_FAILED") {
                  userMessage = "Coinbase connection expired. Please reconnect your account.";
                } else if (errorMessage === "TOKEN_DECRYPT_FAILED") {
                  userMessage = "Unable to access Coinbase credentials. Please reconnect.";
                }

                errors.push(`Coinbase: ${userMessage}`);
                continue;
              }
            } else {
              console.log("[Exchange Sync] ERROR: No Coinbase credentials found");
              errors.push("Coinbase: No credentials found. Please connect your account.");
              continue;
            }
            console.log("[Exchange Sync] ========== COINBASE SYNC END ==========");
            break;

          default:
            errors.push(`Unknown exchange: ${exchange.name}`);
            continue;
        }

        // Store transactions in database — BATCHED. The old path did a findFirst + create per
        // row (2 sequential DB round-trips each), so a few-thousand-transaction Coinbase account
        // blew past maxDuration (the save phase timed out at 300s). Mirror wallets/sync: bulk-dedup
        // in a couple of queries, then createMany in chunks. tx_hash (a @unique column) is the
        // primary dedup key; rows WITHOUT a tx_hash fall back to the original composite key
        // (timestamp|asset|amount, scoped to this exchange's source) so re-syncs stay idempotent.
        console.log(`[Exchange Sync] Saving ${transactions.length} transactions to database for ${exchange.name}...`);
        let dbSaveCount = 0;
        let dbSkipCount = 0;

        // Canonical composite key for a row lacking tx_hash. Normalize the amount to the DB's
        // scale-15 so a raw incoming Decimal matches an already-stored (rounded) value.
        const compositeKey = (
          tsMs: number,
          asset: string,
          amount: { toFixed: (dp: number) => string },
        ): string => `${tsMs}|${asset}|${amount.toFixed(15)}`;

        const incomingHashes = transactions.filter((t) => t.tx_hash).map((t) => t.tx_hash as string);
        const noHashRows = transactions.filter((t) => !t.tx_hash);

        // Existing tx_hashes already in the DB (bulk, chunked) — the primary dedup.
        const existingHashes = new Set<string>();
        for (let h = 0; h < incomingHashes.length; h += 500) {
          const found = await prisma.transaction.findMany({
            where: { userId: user.id, tx_hash: { in: incomingHashes.slice(h, h + 500) } },
            select: { tx_hash: true },
          });
          for (const row of found) if (row.tx_hash) existingHashes.add(row.tx_hash);
        }

        // Existing composite keys — queried ONLY when some incoming rows lack a tx_hash, bounded to
        // this exchange's source and the incoming time range so it stays one small query.
        const existingComposite = new Set<string>();
        if (noHashRows.length > 0) {
          // Linear min/max — NOT Math.min(...times): spreading a large array as function args
          // throws RangeError (Maximum call stack size exceeded) at ~130k elements, which would
          // abort the whole save for exactly the large no-hash-heavy accounts this path serves.
          let minTs = noHashRows[0].tx_timestamp.getTime();
          let maxTs = minTs;
          for (const t of noHashRows) {
            const ms = t.tx_timestamp.getTime();
            if (ms < minTs) minTs = ms;
            if (ms > maxTs) maxTs = ms;
          }
          const found = await prisma.transaction.findMany({
            where: {
              userId: user.id,
              source: exchange.name,
              source_type: "exchange_api",
              tx_timestamp: { gte: new Date(minTs), lte: new Date(maxTs) },
            },
            select: { tx_timestamp: true, asset_symbol: true, amount_value: true },
          });
          for (const row of found) {
            existingComposite.add(compositeKey(row.tx_timestamp.getTime(), row.asset_symbol, row.amount_value));
          }
        }

        // Build the insert list: dedup against the DB and within this batch, honoring the plan limit.
        const seenHashes = new Set<string>();
        const seenComposite = new Set<string>();
        const toInsert: Prisma.TransactionCreateManyInput[] = [];
        for (const tx of transactions) {
          // Build (and clamp) the row FIRST, then dedup off the SAME clamped values that get
          // stored — so the insert-time composite key matches the key rebuilt from the stored
          // row on the next sync (no raw-vs-clamped asymmetry that would re-insert every time).
          const row = clampTxStrings({
            userId: user.id,
            type: tx.type,
            status: "confirmed",
            source: exchange.name,
            source_type: "exchange_api",
            asset_symbol: tx.asset_symbol,
            amount_value: tx.amount_value,
            price_per_unit: tx.price_per_unit,
            value_usd: tx.value_usd,
            fee_usd: tx.fee_usd,
            tx_timestamp: tx.tx_timestamp,
            tx_hash: tx.tx_hash || null,
            identified: false,
            // Flag reward/interest/staking-type rows as income so the combined/CSV tax path
            // books them (keeps the flag consistent across all engines and the UI).
            is_income: getCategory(tx.type) === "income",
            notes: tx.notes || null,
            incoming_asset_symbol: tx.incoming_asset_symbol || null,
            incoming_amount_value: tx.incoming_amount_value || null,
            incoming_value_usd: tx.incoming_value_usd || null,
          });

          // Dedup — count skips regardless of the plan limit (matches the original ordering).
          if (row.tx_hash) {
            if (existingHashes.has(row.tx_hash) || seenHashes.has(row.tx_hash)) { dbSkipCount++; continue; }
            seenHashes.add(row.tx_hash);
          } else {
            const key = compositeKey(tx.tx_timestamp.getTime(), row.asset_symbol as string, tx.amount_value);
            if (existingComposite.has(key) || seenComposite.has(key)) { dbSkipCount++; continue; }
            seenComposite.add(key);
          }

          // Plan limit: stop inserting NEW rows once capacity is reached (the dedup above already
          // ran, so trailing duplicates are still counted — parity with the old per-row loop).
          if (remainingCapacity !== Infinity && toInsert.length >= remainingCapacity) {
            console.log(`[Exchange Sync] Transaction limit reached for ${exchange.name}, stopping`);
            break;
          }
          toInsert.push(row);
        }

        // Bulk insert in chunks; skipDuplicates catches any tx_hash race dupe. On a batch failure,
        // isolate rows so one bad row can't drop the whole chunk.
        for (let c = 0; c < toInsert.length; c += 500) {
          const chunk = toInsert.slice(c, c + 500);
          try {
            const result = await prisma.transaction.createMany({ data: chunk, skipDuplicates: true });
            dbSaveCount += result.count;
            dbSkipCount += chunk.length - result.count;
          } catch (error) {
            console.error(`[Exchange Sync] Batch insert error for ${exchange.name}:`, error instanceof Error ? error.message : error);
            for (const row of chunk) {
              try {
                await prisma.transaction.create({ data: row as Prisma.TransactionUncheckedCreateInput });
                dbSaveCount++;
              } catch (rowErr) {
                const rmsg = rowErr instanceof Error ? rowErr.message : String(rowErr);
                if (rmsg.includes("Unique constraint") || rmsg.includes("P2002")) dbSkipCount++;
                else console.error(`[Exchange Sync] Row insert error for ${exchange.name}: ${rmsg}`);
              }
            }
          }
        }

        totalAdded += dbSaveCount;
        totalSkipped += dbSkipCount;
        if (remainingCapacity !== Infinity) remainingCapacity = Math.max(0, remainingCapacity - dbSaveCount);

        console.log(`[Exchange Sync] Database save complete for ${exchange.name}:`, {
          attempted: transactions.length,
          saved: dbSaveCount,
          skipped: dbSkipCount,
        });

        // Update exchange lastSyncAt
        await prisma.exchange.update({
          where: { id: exchange.id },
          data: { lastSyncAt: new Date() },
        });
      } catch (error) {
        // Log error only in development
        if (process.env.NODE_ENV === "development") {
          console.error(`[Exchange Sync] Error syncing ${exchange.name}:`, error);
        }
        errors.push(
          `Failed to sync ${exchange.name}: ${error instanceof Error ? error.message : "Unknown error"}`
        );
      }
    }

    // Invalidate tax report cache after transaction mutations.
    // Note: cost basis is NOT computed here — exchange transactions arrive priced (no enrich
    // phase). The client pipeline (startExchangePipeline) calls /api/cost-basis/compute right
    // after this route returns; the accounts-page manual Sync does the same via post-processing.
    await invalidateTaxReportCache(user.id);

    // PRD Observability: Structured response with metrics
    const response = {
      status: "success",
      message: `Synced ${exchanges.length} exchange(s)`,
      transactionsAdded: totalAdded,
      transactionsSkipped: totalSkipped,
      errors: errors.length > 0 ? errors : undefined,
      // PRD: Metrics for observability
      metrics: {
        exchangesSynced: exchanges.length,
        transactionsAdded: totalAdded,
        transactionsSkipped: totalSkipped,
        errorCount: errors.length,
        syncDurationMs: Date.now() - requestStartMs,
      },
    };

    // Log sync completion for observability
    console.log("[Exchange Sync] Completed:", JSON.stringify({
      userId: user.id,
      exchangeCount: exchanges.length,
      transactionsAdded: totalAdded,
      transactionsSkipped: totalSkipped,
      errorCount: errors.length,
    }));

    return NextResponse.json(response);
  } catch (error) {
    // Always capture in Sentry for production monitoring
    Sentry.captureException(error, {
      tags: {
        endpoint: "/api/exchanges/sync",
      },
    });

    return NextResponse.json(
      {
        error: "Failed to sync exchanges",
        details: process.env.NODE_ENV === "development" ? (error instanceof Error ? error.message : "Unknown error") : "An internal error occurred",
      },
      { status: 500 }
    );
  }
}
