import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { rateLimitAPI, createRateLimitResponse } from "@/lib/rate-limit";
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
        details: error instanceof Error ? error.message : "Unknown error",
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

    // Delete exchange (or mark as disconnected)
    await prisma.exchange.update({
      where: { id: exchangeId },
      data: {
        isConnected: false,
        apiKey: null,
        apiSecret: null,
        apiPassphrase: null,
        refreshToken: null,
        accessToken: null,
      },
    });

    return NextResponse.json({
      status: "success",
      message: "Exchange disconnected successfully",
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
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
