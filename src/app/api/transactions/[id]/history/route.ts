import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { rateLimitAPI, createRateLimitResponse } from "@/lib/rate-limit";
import * as Sentry from "@sentry/nextjs";
import { getEditHistory } from "@/lib/transaction-history";

/**
 * GET /api/transactions/:id/history
 * Get edit history for a transaction
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Rate limiting
    const rateLimitResult = rateLimitAPI(request, 100);
    if (!rateLimitResult.success) {
      return createRateLimitResponse(
        rateLimitResult.remaining,
        rateLimitResult.reset
      );
    }

    // Get user authentication
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    const transactionId = parseInt(params.id);
    if (isNaN(transactionId)) {
      return NextResponse.json(
        { error: "Invalid transaction ID" },
        { status: 400 }
      );
    }

    // Verify transaction belongs to user
    const userWithWallets = await prisma.user.findUnique({
      where: { id: user.id },
      include: { wallets: true },
    });

    const transaction = await prisma.transaction.findUnique({
      where: { id: transactionId },
    });

    if (!transaction) {
      return NextResponse.json(
        { error: "Transaction not found" },
        { status: 404 }
      );
    }

    // BUG-003 fix: Check if transaction belongs to user (via wallet OR userId)
    const walletAddresses = userWithWallets?.wallets.map((w) => w.address) || [];
    const isWalletOwned = transaction.wallet_address && walletAddresses.includes(transaction.wallet_address);
    const isUserOwned = transaction.userId === user.id;
    const isCsvImportWithoutOwner = transaction.source_type === "csv_import" && !transaction.userId && !transaction.wallet_address;

    if (!isWalletOwned && !isUserOwned && !isCsvImportWithoutOwner) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      );
    }

    const history = await getEditHistory(transactionId);

    return NextResponse.json({
      status: "success",
      history,
    });
  } catch (error) {
    console.error("[Transaction History API] Error:", error);

    Sentry.captureException(error, {
      tags: {
        endpoint: "/api/transactions/[id]/history",
        method: "GET",
      },
    });

    return NextResponse.json(
      {
        error: "Failed to fetch transaction history",
        details: process.env.NODE_ENV === "development" ? (error instanceof Error ? error.message : "Unknown error") : "An internal error occurred",
      },
      { status: 500 }
    );
  }
}
