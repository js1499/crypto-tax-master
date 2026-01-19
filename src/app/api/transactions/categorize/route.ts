import { NextRequest, NextResponse } from "next/server";
import { PrismaClient, Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { rateLimitAPI, createRateLimitResponse } from "@/lib/rate-limit";
import { categorizeTransactionData } from "@/lib/transaction-categorizer";
import * as Sentry from "@sentry/nextjs";

const prisma = new PrismaClient();

/**
 * POST /api/transactions/categorize
 * Re-categorize all transactions for the authenticated user
 * This will update transaction types and mark them as identified if they match a category
 */
export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const rateLimitResult = rateLimitAPI(request, 10); // 10 categorizations per minute
    if (!rateLimitResult.success) {
      return createRateLimitResponse(
        rateLimitResult.remaining,
        rateLimitResult.reset
      );
    }

    // Get user authentication
    let user;
    try {
      user = await getCurrentUser();
    } catch (authError) {
      const errorMessage = authError instanceof Error ? authError.message : "Unknown error";
      if (errorMessage.includes("Can't reach database") || errorMessage.includes("P1001")) {
        return NextResponse.json(
          {
            error: "Database connection failed",
            details: "Please check your DATABASE_URL in .env file.",
          },
          { status: 503 }
        );
      }
      throw authError;
    }

    if (!user) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    // Get user's wallets
    const userWithWallets = await prisma.user.findUnique({
      where: { id: user.id },
      include: { wallets: true },
    });

    const walletAddresses = userWithWallets?.wallets.map((w) => w.address) || [];

    // Build where clause - get all transactions for this user
    const whereClause: any = {
      OR: [],
    };

    if (walletAddresses.length > 0) {
      whereClause.OR.push({ wallet_address: { in: walletAddresses } });
    }

    // Also include CSV imports
    whereClause.OR.push({
      AND: [
        { source_type: "csv_import" },
        { wallet_address: null },
      ],
    });

    if (whereClause.OR.length === 0) {
      return NextResponse.json(
        {
          status: "error",
          error: "No transactions found to categorize",
          details: "Please connect at least one wallet or import transactions via CSV first.",
        },
        { status: 400 }
      );
    }

    // Fetch all transactions
    const transactions = await prisma.transaction.findMany({
      where: whereClause,
      select: {
        id: true,
        type: true,
        subtype: true,
        notes: true,
        value_usd: true,
        asset_symbol: true,
        incoming_asset_symbol: true,
        identified: true,
      },
    });

    if (transactions.length === 0) {
      return NextResponse.json({
        status: "success",
        message: "No transactions found to categorize",
        categorized: 0,
        total: 0,
      });
    }

    // Categorize each transaction
    let categorized = 0;
    let updated = 0;
    const batchSize = 100;

    for (let i = 0; i < transactions.length; i += batchSize) {
      const batch = transactions.slice(i, i + batchSize);
      
      const updates = await Promise.all(
        batch.map(async (tx) => {
          const categorization = categorizeTransactionData({
            type: tx.type,
            notes: tx.notes || null,
            value_usd: tx.value_usd,
            asset_symbol: tx.asset_symbol,
            incoming_asset_symbol: tx.incoming_asset_symbol || null,
            subtype: tx.subtype || null,
          });

          // Only update if categorization changed something
          if (
            categorization.type !== tx.type ||
            categorization.subtype !== tx.subtype ||
            (categorization.identified && !tx.identified)
          ) {
            await prisma.transaction.update({
              where: { id: tx.id },
              data: {
                type: categorization.type,
                subtype: categorization.subtype,
                identified: categorization.identified,
              },
            });
            updated++;
            if (categorization.identified) {
              categorized++;
            }
          } else if (categorization.identified) {
            categorized++;
          }

          return categorization;
        })
      );
    }

    console.log(`[Categorize Transactions] User ${user.id}: Updated ${updated} transactions, ${categorized} identified`);

    return NextResponse.json({
      status: "success",
      message: `Categorized ${categorized} out of ${transactions.length} transactions`,
      categorized,
      updated,
      total: transactions.length,
    });
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("[Categorize Transactions API] Error:", error);
    }

    Sentry.captureException(error, {
      tags: {
        endpoint: "/api/transactions/categorize",
      },
    });

    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const isDatabaseError = errorMessage.includes("Can't reach database") || 
                           errorMessage.includes("P1001") ||
                           errorMessage.includes("connection");

    return NextResponse.json(
      {
        status: "error",
        error: "Failed to categorize transactions",
        details: isDatabaseError 
          ? "Database connection failed. Please check your DATABASE_URL in .env file."
          : errorMessage,
      },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}
