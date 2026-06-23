import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { rateLimitAPI, createRateLimitResponse, rateLimitByUser } from "@/lib/rate-limit";
import { recomputeCostBasis } from "@/lib/compute-cost-basis";
import * as Sentry from "@sentry/nextjs";

// Heavy compute over a user's full transaction set — raise above the ~15s
// platform default so large accounts aren't hard-killed (504) mid-write.
export const maxDuration = 300;

/**
 * POST /api/cost-basis/compute
 * Run the cost basis engine on all user transactions and persist results.
 */
export async function POST(request: NextRequest) {
  try {
    // Rate limiting (expensive operation)
    const rateLimitResult = rateLimitAPI(request, 10);
    if (!rateLimitResult.success) {
      return createRateLimitResponse(rateLimitResult.remaining, rateLimitResult.reset);
    }

    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const userRateLimit = rateLimitByUser(user.id, 3); // 3 computes per minute
    if (!userRateLimit.success) {
      return createRateLimitResponse(userRateLimit.remaining, userRateLimit.reset);
    }

    // Parse perWallet preference from request body
    let perWallet = true; // default: per-wallet (IRS 2025+)
    try {
      const body = await request.json();
      if (body.perWallet === false) perWallet = false;
    } catch {
      // No body or invalid JSON — use default
    }

    const summary = await recomputeCostBasis(user.id, perWallet);

    const reviewNote = summary.needsReview > 0
      ? ` — ${summary.needsReview} transaction${summary.needsReview === 1 ? "" : "s"} need cost-basis review`
      : "";

    return NextResponse.json({
      status: "success",
      message: `Cost basis computed successfully (${perWallet ? "per-wallet" : "universal"})${reviewNote}`,
      method: perWallet ? "per-wallet" : "universal",
      computed: summary.computed,
      needsReviewCount: summary.needsReview,
    });
  } catch (error) {
    console.error("[Cost Basis Compute] Error:", error);
    Sentry.captureException(error);
    return NextResponse.json(
      { error: "Failed to compute cost basis", details: error instanceof Error ? error.message : "Unknown" },
      { status: 500 }
    );
  }
}
