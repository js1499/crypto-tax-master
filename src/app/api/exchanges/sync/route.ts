import { NextRequest, NextResponse } from "next/server";
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

// Encryption key - REQUIRED for decrypting exchange credentials
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
if (!ENCRYPTION_KEY) {
  console.error("[CRITICAL] ENCRYPTION_KEY environment variable is not set!");
}

// Configure for long-running operations on Vercel
export const maxDuration = 300; // 5 minutes max execution time (Vercel Pro limit)
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
  const startTime = Date.now(); // Track request start time for metrics

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

    let totalAdded = 0;
    let totalSkipped = 0;
    const errors: string[] = [];

    // Sync each exchange
    for (const exchange of exchanges) {
      try {
        let transactions: any[] = [];

        // PRD: Incremental sync uses last sync timestamp
        // Use lastSyncAt as startTime for incremental sync if not doing full sync
        let effectiveStartTime = startTime;
        if (!fullSync && !startTime && exchange.lastSyncAt) {
          effectiveStartTime = exchange.lastSyncAt.getTime();
          console.log(`[Exchange Sync] Using incremental sync from ${exchange.lastSyncAt} for ${exchange.name}`);
        }

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

        // Fetch transactions based on exchange type
        switch (exchange.name.toLowerCase()) {
          case "binance":
            if (apiKey && apiSecret) {
              const client = new BinanceClient(apiKey, apiSecret);
              transactions = await client.getAllTrades(effectiveStartTime, endTime);
            }
            break;

          case "kraken":
            if (apiKey && apiSecret) {
              const client = new KrakenClient(apiKey, apiSecret);
              transactions = await client.getAllTransactions(effectiveStartTime, endTime);
            }
            break;

          case "kucoin":
            if (apiKey && apiSecret && apiPassphrase) {
              const client = new KuCoinClient(apiKey, apiSecret, apiPassphrase);
              transactions = await client.getTrades(undefined, effectiveStartTime, endTime);
            }
            break;

          case "gemini":
            if (apiKey && apiSecret) {
              // Detect sandbox keys
              const isSandbox = apiKey.startsWith("master-") || apiKey.includes("sandbox");
              const client = new GeminiClient(apiKey, apiSecret, isSandbox);
              transactions = await client.getAllTransactions(effectiveStartTime, endTime);
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
                  endTime,
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
                  endTime,
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

        // Store transactions in database
        console.log(`[Exchange Sync] Saving ${transactions.length} transactions to database for ${exchange.name}...`);
        let dbSaveCount = 0;
        let dbSkipCount = 0;
        let dbErrorCount = 0;

        for (const tx of transactions) {
          try {
            // Check if transaction already exists
            // Use multiple criteria to avoid duplicates
            const existing = await prisma.transaction.findFirst({
              where: {
                OR: [
                  // Match by tx_hash if available
                  ...(tx.tx_hash ? [{ tx_hash: tx.tx_hash }] : []),
                  // Match by timestamp, asset, amount, and source
                  {
                    tx_timestamp: tx.tx_timestamp,
                    asset_symbol: tx.asset_symbol,
                    amount_value: tx.amount_value,
                    source: exchange.name,
                    source_type: "exchange_api",
                  },
                ],
              },
            });

            if (existing) {
              dbSkipCount++;
              totalSkipped++;
              continue;
            }

            // Create transaction
            await prisma.transaction.create({
              data: {
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
                notes: tx.notes || null,
                // Swap fields
                incoming_asset_symbol: tx.incoming_asset_symbol || null,
                incoming_amount_value: tx.incoming_amount_value || null,
                incoming_value_usd: tx.incoming_value_usd || null,
              },
            });

            dbSaveCount++;
            totalAdded++;
          } catch (error) {
            dbErrorCount++;
            // Check if this is a unique constraint violation (duplicate tx_hash)
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (errorMessage.includes("Unique constraint") || errorMessage.includes("P2002")) {
              totalSkipped++;
            } else {
              // Log only non-duplicate errors
              console.error(`[Exchange Sync] DB ERROR:`, errorMessage);
            }
            // Don't add to errors array for individual transaction failures
            // to avoid cluttering the response
          }
        }

        console.log(`[Exchange Sync] Database save complete for ${exchange.name}:`, {
          attempted: transactions.length,
          saved: dbSaveCount,
          skipped: dbSkipCount,
          errors: dbErrorCount,
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
        syncDurationMs: Date.now() - startTime,
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
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
