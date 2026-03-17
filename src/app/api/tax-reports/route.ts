import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { calculateTaxReport, formatTaxReport } from "@/lib/tax-calculator";
import { getCurrentUser } from "@/lib/auth-helpers";
import { rateLimitAPI, createRateLimitResponse, rateLimitByUser } from "@/lib/rate-limit";

/**
 * GET /api/tax-reports?year=2023&detailed=true
 *
 * Returns the tax report for a given year. Reads from the persistent
 * TaxReportCache table first — only runs the full tax calculation on a
 * cache miss.  Cache is invalidated whenever transactions are mutated.
 */
export async function GET(request: NextRequest) {
  try {
    const rateLimitResult = rateLimitAPI(request, 30);
    if (!rateLimitResult.success) {
      return createRateLimitResponse(rateLimitResult.remaining, rateLimitResult.reset);
    }

    const searchParams = request.nextUrl.searchParams;
    const year = parseInt(searchParams.get("year") || new Date().getFullYear().toString());
    const detailed = searchParams.get("detailed") === "true";

    if (isNaN(year) || year < 2000 || year > 2100) {
      return NextResponse.json({ error: "Invalid year parameter" }, { status: 400 });
    }

    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const userRateLimit = rateLimitByUser(user.id, 10);
    if (!userRateLimit.success) {
      return createRateLimitResponse(userRateLimit.remaining, userRateLimit.reset);
    }

    const userWithWallets = await prisma.user.findUnique({
      where: { id: user.id },
      include: { wallets: true },
    });

    if (!userWithWallets) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const costBasisMethod = (userWithWallets.costBasisMethod || "FIFO") as "FIFO" | "LIFO" | "HIFO";

    // ── Try persistent cache first ─────────────────────────────────
    const cached = await prisma.taxReportCache.findUnique({
      where: {
        userId_year_costBasisMethod: {
          userId: user.id,
          year,
          costBasisMethod,
        },
      },
    });

    if (cached) {
      // Cache hit — return immediately
      return NextResponse.json({
        status: "success",
        year,
        cached: true,
        report: cached.reportData,
      });
    }

    // ── Cache miss — compute and store ─────────────────────────────
    const walletAddresses = userWithWallets.wallets.map((w) => w.address);
    const filingStatus = (searchParams.get("filingStatus") || "single") as
      | "single" | "married_joint" | "married_separate" | "head_of_household";
    const userTimezone = userWithWallets.timezone || "America/New_York";

    const report = await calculateTaxReport(
      prisma,
      walletAddresses,
      year,
      costBasisMethod,
      user.id,
      filingStatus,
      userTimezone,
    );

    const formattedReport = formatTaxReport(report);

    // Build the object we'll cache (and return)
    const reportPayload: Record<string, unknown> = { ...formattedReport };

    // Always store detailed data in the cache so PDF/export endpoints can use it
    reportPayload.detailed = {
      taxableEvents: report.taxableEvents.map((e) => ({
        id: e.id,
        date: e.date.toISOString(),
        asset: e.asset,
        amount: e.amount,
        proceeds: e.proceeds,
        costBasis: e.costBasis,
        gainLoss: e.gainLoss,
        holdingPeriod: e.holdingPeriod,
        chain: e.chain,
        txHash: e.txHash,
      })),
      incomeEvents: report.incomeEvents.map((e) => ({
        id: e.id,
        date: e.date.toISOString(),
        asset: e.asset,
        amount: e.amount,
        valueUsd: e.valueUsd,
        type: e.type,
        chain: e.chain,
        txHash: e.txHash,
      })),
    };

    // Persist to DB (upsert in case of race condition)
    try {
      await prisma.taxReportCache.upsert({
        where: {
          userId_year_costBasisMethod: {
            userId: user.id,
            year,
            costBasisMethod,
          },
        },
        update: {
          reportData: reportPayload as any,
          computedAt: new Date(),
        },
        create: {
          userId: user.id,
          year,
          costBasisMethod,
          reportData: reportPayload as any,
        },
      });
    } catch (cacheErr) {
      console.error("[Tax Reports API] Failed to persist cache:", cacheErr);
    }

    // Strip detailed data from response unless requested
    const responsePayload = detailed
      ? reportPayload
      : (({ detailed: _, ...rest }) => rest)(reportPayload as any);

    return NextResponse.json({
      status: "success",
      year,
      cached: false,
      report: responsePayload,
    });
  } catch (error) {
    console.error("[Tax Reports API] Error:", error);
    return NextResponse.json(
      { error: "Failed to calculate tax report", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
