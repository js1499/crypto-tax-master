import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { getCoinGeckoId, getPriceRange, getCurrentPrice } from "@/lib/coingecko";
import { rateLimitAPI, createRateLimitResponse } from "@/lib/rate-limit";
import { Decimal } from "@prisma/client/runtime/library";

export const maxDuration = 800; // 13 min Vercel timeout

/**
 * POST /api/prices/enrich-historical
 * Enriches Solana transactions with CoinGecko historical prices.
 * Called after wallet sync to replace DAS current prices with accurate historical prices.
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Rate limiting: 3 requests per minute
    const rateLimitResult = rateLimitAPI(request, 3);
    if (!rateLimitResult.success) {
      return createRateLimitResponse(rateLimitResult.remaining, rateLimitResult.reset);
    }

    // Auth
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { walletId } = body;
    if (!walletId) {
      return NextResponse.json({ error: "walletId is required" }, { status: 400 });
    }

    // Verify wallet belongs to user
    const wallet = await prisma.wallet.findFirst({
      where: { id: walletId, userId: user.id },
    });
    if (!wallet) {
      return NextResponse.json({ error: "Wallet not found" }, { status: 404 });
    }

    // Query all Solana transactions for this wallet
    const transactions = await prisma.transaction.findMany({
      where: {
        wallet_address: wallet.address,
        chain: "solana",
      },
      select: {
        id: true,
        asset_symbol: true,
        tx_timestamp: true,
        amount_value: true,
        fee_usd: true,
        incoming_asset_symbol: true,
        incoming_amount_value: true,
        incoming_value_usd: true,
        price_per_unit: true,
        value_usd: true,
      },
    });

    if (transactions.length === 0) {
      return NextResponse.json({
        status: "success",
        updated: 0,
        total: 0,
        skipped: 0,
        fallbackSymbols: [],
        durationMs: Date.now() - startTime,
      });
    }

    // Find date range across all transactions (with 1-day buffer on each side)
    let minDate = transactions[0].tx_timestamp;
    let maxDate = transactions[0].tx_timestamp;
    for (const tx of transactions) {
      if (tx.tx_timestamp < minDate) minDate = tx.tx_timestamp;
      if (tx.tx_timestamp > maxDate) maxDate = tx.tx_timestamp;
    }
    const rangeStart = new Date(minDate.getTime() - 86400000); // -1 day
    const rangeEnd = new Date(maxDate.getTime() + 86400000); // +1 day

    // Collect unique symbols that have CoinGecko IDs
    const symbolSet = new Set<string>();
    symbolSet.add("SOL"); // Always include SOL for fee correction
    for (const tx of transactions) {
      if (tx.asset_symbol && getCoinGeckoId(tx.asset_symbol)) {
        symbolSet.add(tx.asset_symbol.toUpperCase());
      }
      if (tx.incoming_asset_symbol && getCoinGeckoId(tx.incoming_asset_symbol)) {
        symbolSet.add(tx.incoming_asset_symbol.toUpperCase());
      }
    }
    const symbols = Array.from(symbolSet);

    console.log(`[Enrich] ${wallet.name}: ${transactions.length} tx, ${symbols.length} symbols (${symbols.join(",")}), range ${rangeStart.toISOString().split("T")[0]} to ${rangeEnd.toISOString().split("T")[0]}`);

    // Fetch historical prices for each symbol (sequentially to respect CoinGecko rate limits)
    // Build lookup Map: "SOL:2023-01-15" → 14.52
    const priceMap = new Map<string, number>();
    const failedSymbols: string[] = [];

    for (const symbol of symbols) {
      try {
        const prices = await getPriceRange(symbol, rangeStart, rangeEnd);
        if (prices && prices.length > 0) {
          for (const entry of prices) {
            const dateKey = entry.date.split("T")[0]; // YYYY-MM-DD
            const mapKey = `${symbol}:${dateKey}`;
            priceMap.set(mapKey, entry.price);
          }
        } else {
          failedSymbols.push(symbol);
        }
      } catch (err) {
        failedSymbols.push(symbol);
      }
    }

    if (failedSymbols.length > 0) {
      console.warn(`[Enrich] No price data for: ${failedSymbols.join(", ")}`);
    }

    // Get current SOL price for fee correction (reverse-compute fee_usd back to SOL amount)
    const currentSolPrice = await getCurrentPrice("SOL");

    // Helper: find closest price for a symbol on a given date
    function lookupPrice(symbol: string, date: Date): number | null {
      const dateStr = date.toISOString().split("T")[0];
      const key = `${symbol.toUpperCase()}:${dateStr}`;
      const exact = priceMap.get(key);
      if (exact !== undefined) return exact;

      // Try +/- 1 day if exact date not found (CoinGecko sometimes has gaps)
      const prev = new Date(date.getTime() - 86400000).toISOString().split("T")[0];
      const next = new Date(date.getTime() + 86400000).toISOString().split("T")[0];
      const prevPrice = priceMap.get(`${symbol.toUpperCase()}:${prev}`);
      if (prevPrice !== undefined) return prevPrice;
      const nextPrice = priceMap.get(`${symbol.toUpperCase()}:${next}`);
      if (nextPrice !== undefined) return nextPrice;

      return null;
    }

    // Batch update transactions
    let updated = 0;
    let skipped = 0;
    const fallbackSymbols = new Set<string>();
    const BATCH_SIZE = 100;

    for (let i = 0; i < transactions.length; i += BATCH_SIZE) {
      const batch = transactions.slice(i, i + BATCH_SIZE);
      const updates: Array<ReturnType<typeof prisma.transaction.update>> = [];

      for (const tx of batch) {
        const updateData: Record<string, any> = {};
        let didUpdate = false;

        // Main asset price
        const historicalPrice = lookupPrice(tx.asset_symbol, tx.tx_timestamp);
        if (historicalPrice !== null) {
          updateData.price_per_unit = new Decimal(historicalPrice);
          updateData.value_usd = new Decimal(
            Math.abs(Number(tx.amount_value) * historicalPrice)
          );
          didUpdate = true;
        } else {
          // Token not in CoinGecko — keep DAS price
          if (!getCoinGeckoId(tx.asset_symbol)) {
            fallbackSymbols.add(tx.asset_symbol);
          }
        }

        // Fee correction: storedFeeUsd / currentSolPrice → SOL amount → * historicalSolPrice
        if (tx.fee_usd && currentSolPrice && currentSolPrice > 0) {
          const historicalSolPrice = lookupPrice("SOL", tx.tx_timestamp);
          if (historicalSolPrice !== null) {
            const feeSol = Number(tx.fee_usd) / currentSolPrice;
            updateData.fee_usd = new Decimal(feeSol * historicalSolPrice);
            didUpdate = true;
          }
        }

        // Incoming asset (for swaps)
        if (tx.incoming_asset_symbol && tx.incoming_amount_value) {
          const incomingPrice = lookupPrice(tx.incoming_asset_symbol, tx.tx_timestamp);
          if (incomingPrice !== null) {
            updateData.incoming_value_usd = new Decimal(
              Math.abs(Number(tx.incoming_amount_value) * incomingPrice)
            );
            didUpdate = true;
          } else if (!getCoinGeckoId(tx.incoming_asset_symbol)) {
            fallbackSymbols.add(tx.incoming_asset_symbol);
          }
        }

        if (didUpdate) {
          updates.push(
            prisma.transaction.update({
              where: { id: tx.id },
              data: updateData,
            })
          );
          updated++;
        } else {
          skipped++;
        }
      }

      // Execute batch
      if (updates.length > 0) {
        await prisma.$transaction(updates);
      }
    }

    const fallbackList = Array.from(fallbackSymbols);
    const durationMs = Date.now() - startTime;
    console.log(`[Enrich] Done in ${(durationMs / 1000).toFixed(1)}s: ${updated} updated, ${skipped} skipped${fallbackList.length > 0 ? ` | fallback tokens: ${fallbackList.join(",")}` : ""}`);

    return NextResponse.json({
      status: "success",
      updated,
      total: transactions.length,
      skipped,
      fallbackSymbols: fallbackList,
      durationMs,
    });
  } catch (error) {
    console.error("[Enrich Historical] Error:", error);
    return NextResponse.json(
      {
        status: "error",
        error: "Failed to enrich historical prices",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
