import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { calculateTaxReport, formatTaxReport } from "@/lib/tax-calculator";
import { getCurrentUser } from "@/lib/auth-helpers";
import { rateLimitAPI, createRateLimitResponse, rateLimitByUser } from "@/lib/rate-limit";
import * as Sentry from "@sentry/nextjs";
import { LRUCache } from "lru-cache";

// In-memory LRU cache for tax report calculations
const reportCache = new LRUCache<string, Awaited<ReturnType<typeof calculateTaxReport>>>({
  max: 50,
  ttl: 5 * 60 * 1000, // 5 minutes
});

/**
 * GET /api/tax-reports?year=2023&detailed=true
 * Calculate tax report for a given year
 */
export async function GET(request: NextRequest) {
  try {
    // Rate limiting
    const rateLimitResult = rateLimitAPI(request, 30); // 30 reports per minute
    if (!rateLimitResult.success) {
      return createRateLimitResponse(
        rateLimitResult.remaining,
        rateLimitResult.reset
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const year = parseInt(searchParams.get("year") || new Date().getFullYear().toString());
    const detailed = searchParams.get("detailed") === "true";

    if (isNaN(year) || year < 2000 || year > 2100) {
      return NextResponse.json(
        { error: "Invalid year parameter" },
        { status: 400 }
      );
    }

    // Get user authentication via NextAuth - pass request for proper Vercel session handling
    const user = await getCurrentUser(request);

    if (!user) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    // Additional rate limiting by user
    const userRateLimit = rateLimitByUser(user.id, 10); // 10 reports per minute per user
    if (!userRateLimit.success) {
      return createRateLimitResponse(
        userRateLimit.remaining,
        userRateLimit.reset
      );
    }

    // Get user with wallets
    const userWithWallets = await prisma.user.findUnique({
      where: { id: user.id },
      include: { wallets: true },
    });

    if (!userWithWallets) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // Get user's wallet addresses
    const walletAddresses = userWithWallets.wallets.map((w) => w.address);

    // Calculate tax report using user's wallet addresses
    // Also include CSV-imported transactions (source_type: "csv_import" with null wallet_address)
    // Pass empty array to include all transactions (both wallet-based and CSV-imported)
    // The calculateTaxReport function will handle filtering appropriately
    // Get filing status from query params (default to "single")
    const filingStatus = (searchParams.get("filingStatus") || "single") as "single" | "married_joint" | "married_separate" | "head_of_household";

    const costBasisMethod = (userWithWallets.costBasisMethod || "FIFO") as "FIFO" | "LIFO" | "HIFO";
    const userTimezone = userWithWallets.timezone || "America/New_York";

    // Check cache first
    const cacheKey = `${user.id}:${year}:${costBasisMethod}`;
    let report = reportCache.get(cacheKey);

    if (!report) {
      report = await calculateTaxReport(
        prisma,
        walletAddresses, // Pass wallet addresses, but also need to include CSV imports
        year,
        costBasisMethod,
        user.id, // Pass user ID to filter CSV imports by user
        filingStatus,
        userTimezone
      );

      reportCache.set(cacheKey, report);
    }

    console.log(`[Tax Reports API] Report for user ${user.id}, year ${year}, method ${costBasisMethod}: ${report.taxableEvents.length} taxable events, ${report.incomeEvents.length} income events`);

    // Format the report for frontend
    const formattedReport = formatTaxReport(report);

    const responseBody: Record<string, unknown> = {
      status: "success",
      year,
      report: {
        ...formattedReport,
      },
    };

    // Only include detailed event arrays when explicitly requested
    if (detailed) {
      (responseBody.report as Record<string, unknown>).detailed = {
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
    }

    return NextResponse.json(responseBody);
  } catch (error) {
    console.error("[Tax Reports API] Error calculating tax report:", error);
    return NextResponse.json(
      { error: "Failed to calculate tax report", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
