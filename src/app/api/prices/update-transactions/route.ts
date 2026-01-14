import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { getHistoricalPriceAtTimestamp } from "@/lib/coingecko";
import { Decimal } from "@prisma/client/runtime/library";
import { rateLimitAPI, createRateLimitResponse } from "@/lib/rate-limit";
import * as Sentry from "@sentry/nextjs";

const prisma = new PrismaClient();

/**
 * POST /api/prices/update-transactions
 * Update missing price_per_unit and value_usd for transactions that don't have them
 * Body: { limit?: number } - Optional limit on number of transactions to update
 */
export async function POST(request: NextRequest) {
  try {
    // Rate limiting (this is a heavy operation)
    const rateLimitResult = rateLimitAPI(request, 5); // 5 updates per minute
    if (!rateLimitResult.success) {
      return createRateLimitResponse(
        rateLimitResult.remaining,
        rateLimitResult.reset
      );
    }
    const body = await request.json().catch(() => ({}));
    const limit = body.limit || 100; // Default to 100 transactions per request

    // Find transactions with missing prices
    const transactions = await prisma.transaction.findMany({
      where: {
        OR: [
          { price_per_unit: null },
          { value_usd: { equals: new Decimal(0) } },
        ],
      },
      take: limit,
      orderBy: {
        tx_timestamp: "asc",
      },
    });

    if (transactions.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No transactions need price updates",
        updated: 0,
      });
    }

    let updated = 0;
    let errors = 0;

    for (const tx of transactions) {
      try {
        const timestamp = Math.floor(tx.tx_timestamp.getTime() / 1000);
        const price = await getHistoricalPriceAtTimestamp(
          tx.asset_symbol,
          timestamp
        );

        if (price !== null) {
          const priceDecimal = new Decimal(price);
          const amountValue = Number(tx.amount_value);
          const valueUsd = new Decimal(Math.abs(amountValue * price));

          await prisma.transaction.update({
            where: { id: tx.id },
            data: {
              price_per_unit: priceDecimal,
              value_usd: valueUsd,
            },
          });

          updated++;
        } else {
          console.warn(
            `[Update Prices] Could not fetch price for ${tx.asset_symbol} at ${tx.tx_timestamp}`
          );
          errors++;
        }

        // Small delay to respect rate limits
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (error) {
        console.error(
          `[Update Prices] Error updating transaction ${tx.id}:`,
          error
        );
        errors++;
      }
    }

    return NextResponse.json({
      success: true,
      message: `Updated ${updated} transactions`,
      updated,
      errors,
      total: transactions.length,
    });
  } catch (error) {
    console.error("[Update Prices API] Error:", error);
    
    // Capture error in Sentry
    Sentry.captureException(error, {
      tags: {
        endpoint: "/api/prices/update-transactions",
      },
    });
    
    return NextResponse.json(
      {
        success: false,
        error: "Failed to update transaction prices",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}
