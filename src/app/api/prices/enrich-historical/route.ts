import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { rateLimitAPI, createRateLimitResponse } from "@/lib/rate-limit";
import { enrichHistoricalPrices } from "@/lib/enrich-prices";
import { StaleLock } from "@/lib/stale-lock";

export const maxDuration = 800; // 13 min Vercel timeout

// Prevent concurrent enrichment runs (CoinGecko has a shared rate limit).
// A self-healing lock: if a run is hard-killed (504 at maxDuration / OOM) the lock
// auto-expires after the TTL instead of wedging every future request on a stuck flag
// (which the pipeline treats as success → prices silently never backfill).
const ENRICH_LOCK_TTL_MS = 15 * 60 * 1000; // > maxDuration (800s)
const enrichLock = new StaleLock(ENRICH_LOCK_TTL_MS);

/**
 * POST /api/prices/enrich-historical
 * Enriches transactions with CoinGecko historical prices.
 *
 * Body:
 *   walletId? — enrich transactions for a specific wallet.
 *              If omitted, enriches ALL transactions for the user.
 */
export async function POST(request: NextRequest) {
  const log = (msg: string) => console.log(`[Enrich API] ${msg}`);
  const warn = (msg: string) => console.warn(`[Enrich API] ${msg}`);

  log(`── Endpoint called at ${new Date().toISOString()} ──`);

  try {
    // Rate limiting
    const rateLimitResult = rateLimitAPI(request, 10);
    if (!rateLimitResult.success) {
      warn(`Rate limited!`);
      return createRateLimitResponse(rateLimitResult.remaining, rateLimitResult.reset);
    }

    // Auth
    const user = await getCurrentUser(request);
    if (!user) {
      warn(`Auth failed`);
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    log(`Auth OK — user ${user.id}`);

    const body = await request.json().catch(() => ({}));
    const { walletId } = body;

    let walletAddress: string | undefined;
    if (walletId) {
      const wallet = await prisma.wallet.findFirst({
        where: { id: walletId, userId: user.id },
      });
      if (!wallet) {
        return NextResponse.json({ error: "Wallet not found" }, { status: 404 });
      }
      walletAddress = wallet.address;
    }

    // Concurrency guard (self-healing — see ENRICH_LOCK_TTL_MS). Held only for the
    // duration of the actual enrichment and always released in the finally below.
    if (!enrichLock.acquire()) {
      warn(`Enrichment already in progress — rejecting concurrent request`);
      return NextResponse.json(
        { status: "error", error: "Enrichment already in progress. Please wait for it to complete." },
        { status: 409 },
      );
    }

    try {
      const result = await enrichHistoricalPrices(walletAddress, user.id);
      return NextResponse.json(result, {
        status: result.status === "success" ? 200 : 500,
      });
    } finally {
      enrichLock.release();
    }
  } catch (error) {
    console.error("[Enrich API] Error:", error);
    return NextResponse.json(
      {
        status: "error",
        error: "Failed to enrich historical prices",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
