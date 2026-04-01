import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { rateLimitAPI, createRateLimitResponse } from "@/lib/rate-limit";

/**
 * GET /api/securities/transactions
 * Returns securities transactions for the authenticated user.
 */
export async function GET(request: NextRequest) {
  try {
    const rateLimitResult = rateLimitAPI(request, 100);
    if (!rateLimitResult.success) {
      return createRateLimitResponse(
        rateLimitResult.remaining,
        rateLimitResult.reset
      );
    }

    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    return NextResponse.json({
      status: "success",
      transactions: [],
      total: 0,
    });
  } catch (error) {
    console.error("[Securities Transactions API] GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch securities transactions" },
      { status: 500 }
    );
  }
}
