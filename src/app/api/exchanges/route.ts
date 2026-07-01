import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { rateLimitAPI, createRateLimitResponse } from "@/lib/rate-limit";
import { invalidateTaxReportCache } from "@/lib/tax-report-cache";
import * as Sentry from "@sentry/nextjs";

/**
 * GET /api/exchanges
 * Get all connected exchanges for the current user
 */
export async function GET(request: NextRequest) {
  try {
    // Rate limiting - more lenient for initial page loads
    const rateLimitResult = rateLimitAPI(request, 100); // 100 requests per minute
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

    // Get user's exchanges
    const exchanges = await prisma.exchange.findMany({
      where: { userId: user.id },
      select: {
        id: true,
        name: true,
        isConnected: true,
        lastSyncAt: true,
        createdAt: true,
        updatedAt: true,
        // Don't return sensitive data
      },
      orderBy: {
        updatedAt: "desc",
      },
    });

    return NextResponse.json({
      status: "success",
      exchanges,
    });
  } catch (error) {
    console.error("[Exchanges API] Error:", error);

    Sentry.captureException(error, {
      tags: {
        endpoint: "/api/exchanges",
      },
    });

    return NextResponse.json(
      {
        error: "Failed to fetch exchanges",
        details: process.env.NODE_ENV === "development" ? (error instanceof Error ? error.message : "Unknown error") : "An internal error occurred",
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/exchanges
 * Disconnect an exchange
 * Query params: exchangeId
 */
export async function DELETE(request: NextRequest) {
  try {
    // Rate limiting
    const rateLimitResult = rateLimitAPI(request, 20);
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

    // Parse query parameters
    const searchParams = request.nextUrl.searchParams;
    const exchangeId = searchParams.get("exchangeId");

    if (!exchangeId) {
      return NextResponse.json(
        { error: "Missing exchangeId parameter" },
        { status: 400 }
      );
    }

    // Verify exchange belongs to user
    const exchange = await prisma.exchange.findUnique({
      where: { id: exchangeId },
    });

    if (!exchange) {
      return NextResponse.json(
        { error: "Exchange not found" },
        { status: 404 }
      );
    }

    if (exchange.userId !== user.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      );
    }

    // Delete the exchange's transactions, then the exchange row itself (mirrors wallet
    // delete — removing an account removes its data, matching the "deleted from your
    // account" confirmation). Match source case-insensitively since older rows may have
    // stored the exchange name with different casing (e.g. "Coinbase" vs "coinbase").
    const deletedTx = await prisma.transaction.deleteMany({
      where: {
        userId: user.id,
        source_type: "exchange_api",
        source: { equals: exchange.name, mode: "insensitive" },
      },
    });
    await prisma.exchange.delete({ where: { id: exchangeId } });
    await invalidateTaxReportCache(user.id);

    console.log(`[Exchanges API] Deleted exchange ${exchangeId} and ${deletedTx.count} transactions`);

    return NextResponse.json({
      status: "success",
      message: "Exchange removed",
      deletedTransactions: deletedTx.count,
    });
  } catch (error) {
    console.error("[Exchanges API] Error:", error);

    Sentry.captureException(error, {
      tags: {
        endpoint: "/api/exchanges",
        method: "DELETE",
      },
    });

    return NextResponse.json(
      {
        error: "Failed to disconnect exchange",
        details: process.env.NODE_ENV === "development" ? (error instanceof Error ? error.message : "Unknown error") : "An internal error occurred",
      },
      { status: 500 }
    );
  }
}
