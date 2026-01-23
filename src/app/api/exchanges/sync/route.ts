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
import { getCoinbaseTransactions } from "@/lib/coinbase-transactions";
import crypto from "crypto";

// Encryption key (must match the one used for encryption)
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString("hex");

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
  try {
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
    const { exchangeId, startTime, endTime } = body;

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
              transactions = await client.getAllTrades(startTime, endTime);
            }
            break;

          case "kraken":
            if (apiKey && apiSecret) {
              const client = new KrakenClient(apiKey, apiSecret);
              transactions = await client.getTradesHistory(startTime, endTime);
            }
            break;

          case "kucoin":
            if (apiKey && apiSecret && apiPassphrase) {
              const client = new KuCoinClient(apiKey, apiSecret, apiPassphrase);
              transactions = await client.getTrades(undefined, startTime, endTime);
            }
            break;

          case "gemini":
            if (apiKey && apiSecret) {
              const client = new GeminiClient(apiKey, apiSecret);
              transactions = await client.getTrades(undefined, startTime, endTime);
            }
            break;

          case "coinbase":
            if (exchange.refreshToken) {
              try {
                // Use Coinbase OAuth flow
                transactions = await getCoinbaseTransactions(
                  exchange.refreshToken,
                  startTime,
                  endTime
                );
              } catch (error) {
                // Log error only in development
                if (process.env.NODE_ENV === "development") {
                  console.error("[Exchange Sync] Coinbase error:", error);
                }
                errors.push(
                  `Coinbase: ${error instanceof Error ? error.message : "Failed to fetch transactions"}`
                );
                continue;
              }
            }
            break;

          default:
            errors.push(`Unknown exchange: ${exchange.name}`);
            continue;
        }

        // Store transactions in database
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

            totalAdded++;
          } catch (error) {
            // Log error only in development
            if (process.env.NODE_ENV === "development") {
              console.error(`[Exchange Sync] Error saving transaction:`, error);
            }
            // Don't add to errors array for individual transaction failures
            // to avoid cluttering the response
          }
        }

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

    return NextResponse.json({
      status: "success",
      message: `Synced ${exchanges.length} exchange(s)`,
      transactionsAdded: totalAdded,
      transactionsSkipped: totalSkipped,
      errors: errors.length > 0 ? errors : undefined,
    });
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
