import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { rateLimitAPI, createRateLimitResponse } from "@/lib/rate-limit";

/**
 * GET /api/securities/lots
 * Returns securities tax lots for the authenticated user.
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
      lots: [],
      total: 0,
    });
  } catch (error) {
    console.error("[Securities Lots API] GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch securities lots" },
      { status: 500 }
    );
  }
}
