import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { calculateTaxReport, formatTaxReport } from "@/lib/tax-calculator";
import { getCurrentUser } from "@/lib/auth-helpers";
import { rateLimitAPI, createRateLimitResponse, rateLimitByUser } from "@/lib/rate-limit";
import * as Sentry from "@sentry/nextjs";

const prisma = new PrismaClient();

/**
 * GET /api/tax-reports?year=2023
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
    
    if (isNaN(year) || year < 2000 || year > 2100) {
      return NextResponse.json(
        { error: "Invalid year parameter" },
        { status: 400 }
      );
    }

    // Get user authentication via NextAuth
    const user = await getCurrentUser();
    
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

    console.log(`[Tax Reports API] Calculating tax report for year ${year}, user ${user.id}`);
    console.log(`[Tax Reports API] User has ${walletAddresses.length} wallet(s)`);

    // Calculate tax report using user's wallet addresses
    // Also include CSV-imported transactions (source_type: "csv_import" with null wallet_address)
    // Pass empty array to include all transactions (both wallet-based and CSV-imported)
    // The calculateTaxReport function will handle filtering appropriately
    // Get filing status from query params (default to "single")
    const filingStatus = (searchParams.get("filingStatus") || "single") as "single" | "married_joint" | "married_separate" | "head_of_household";
    
    const report = await calculateTaxReport(
      prisma,
      walletAddresses, // Pass wallet addresses, but also need to include CSV imports
      year,
      "FIFO",
      user.id, // Pass user ID to filter CSV imports by user
      filingStatus
    );

    console.log(`[Tax Reports API] Tax report calculated:`);
    console.log(`  - Taxable events: ${report.taxableEvents.length}`);
    console.log(`  - Income events: ${report.incomeEvents.length}`);
    console.log(`  - Short-term gains: $${report.shortTermGains.toFixed(2)}`);
    console.log(`  - Long-term gains: $${report.longTermGains.toFixed(2)}`);
    console.log(`  - Total income: $${report.totalIncome.toFixed(2)}`);

    // Format the report for frontend
    const formattedReport = formatTaxReport(report);
    
    console.log(`[Tax Reports API] Formatted report:`, formattedReport);

    return NextResponse.json({
      status: "success",
      year,
      report: {
        ...formattedReport,
        detailed: {
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
        },
      },
    });
  } catch (error) {
    console.error("[Tax Reports API] Error calculating tax report:", error);
    return NextResponse.json(
      { error: "Failed to calculate tax report", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}

