import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { rateLimitAPI, createRateLimitResponse } from "@/lib/rate-limit";
import * as Sentry from "@sentry/nextjs";

const prisma = new PrismaClient();

/**
 * DELETE /api/transactions/delete-all
 * Delete all transactions for the authenticated user
 * This is a destructive operation - use with caution!
 */
export async function DELETE(request: NextRequest) {
  try {
    // Rate limiting - very restrictive for destructive operations
    const rateLimitResult = rateLimitAPI(request, 5); // 5 deletions per hour
    if (!rateLimitResult.success) {
      return createRateLimitResponse(
        rateLimitResult.remaining,
        rateLimitResult.reset
      );
    }

    // Get user authentication
    let user;
    try {
      const sessionCookie = request.cookies.get("session_token")?.value;

      user = await getCurrentUser(sessionCookie);
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

    // Get user's wallets to only delete transactions associated with them
    const userWithWallets = await prisma.user.findUnique({
      where: { id: user.id },
      include: { wallets: true },
    });

    const walletAddresses = userWithWallets?.wallets.map((w) => w.address) || [];

    // Build where clause - delete transactions for this user
    // Strategy:
    // 1. If user has wallets, delete transactions with those wallet addresses
    // 2. If user has no wallets, delete CSV imports with null wallet_address
    //    (This is reasonably safe because if they have no wallets, their CSV imports
    //     are likely the only transactions they can see/access)
    const whereClause: any = {
      OR: [],
    };

    if (walletAddresses.length > 0) {
      // Delete transactions associated with user's wallets
      whereClause.OR.push({ wallet_address: { in: walletAddresses } });
    }

    // Also delete CSV imports with null wallet_address
    // This handles the case where users import CSV files without connecting wallets
    whereClause.OR.push({
      AND: [
        { source_type: "csv_import" },
        { wallet_address: null },
      ],
    });

    // If no conditions, return error
    if (whereClause.OR.length === 0) {
      return NextResponse.json(
        {
          error: "Cannot delete transactions: No identifiable transactions found",
          details: "Please connect at least one wallet or import transactions via CSV first.",
        },
        { status: 400 }
      );
    }

    // Count transactions before deletion
    const countBefore = await prisma.transaction.count({
      where: whereClause,
    });

    if (countBefore === 0) {
      return NextResponse.json({
        status: "success",
        message: "No transactions found to delete",
        deletedCount: 0,
      });
    }

    // Delete all transactions for this user
    const result = await prisma.transaction.deleteMany({
      where: whereClause,
    });

    console.log(`[Delete All Transactions] User ${user.id} deleted ${result.count} transactions`);

    return NextResponse.json({
      status: "success",
      message: `Successfully deleted ${result.count} transaction${result.count !== 1 ? "s" : ""}`,
      deletedCount: result.count,
    });
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("[Delete All Transactions API] Error:", error);
    }

    Sentry.captureException(error, {
      tags: {
        endpoint: "/api/transactions/delete-all",
      },
    });

    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const isDatabaseError = errorMessage.includes("Can't reach database") || 
                           errorMessage.includes("P1001") ||
                           errorMessage.includes("connection");

    return NextResponse.json(
      {
        error: "Failed to delete transactions",
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
