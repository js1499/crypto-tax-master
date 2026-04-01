import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { rateLimitAPI, createRateLimitResponse, rateLimitByUser } from "@/lib/rate-limit";
import { calculateTaxReport } from "@/lib/tax-calculator";
import { generateSecuritiesTaxReport } from "@/lib/securities-report-generator";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// API Route
// ---------------------------------------------------------------------------

/**
 * GET /api/tax-reports/combined?year=2025&form=schedule-d
 *
 * Returns combined crypto + securities numbers for the requested form.
 *
 * Supported forms:
 *   schedule-d  — Capital gains summary (crypto ST/LT + securities ST/LT + 1256 60/40)
 *   schedule-c  — Net trading P&L from both engines (for trader status)
 *   schedule-1  — Crypto income + forex Section 988 income
 */
export async function GET(request: NextRequest) {
  try {
    // Rate limiting
    const rateLimitResult = rateLimitAPI(request, 30);
    if (!rateLimitResult.success) {
      return createRateLimitResponse(
        rateLimitResult.remaining,
        rateLimitResult.reset,
      );
    }

    // Authenticate
    let user;
    try {
      user = await getCurrentUser(request);
    } catch (authError) {
      console.error("[Combined Reports API] Auth error:", authError);
      const errorMessage = authError instanceof Error ? authError.message : "Unknown error";
      if (errorMessage.includes("Can't reach database") || errorMessage.includes("P1001")) {
        return NextResponse.json(
          { error: "Database connection failed", details: "Please check your database connection." },
          { status: 503 },
        );
      }
      return NextResponse.json(
        { error: "Authentication failed", details: errorMessage },
        { status: 401 },
      );
    }

    if (!user) {
      return NextResponse.json(
        { error: "Not authenticated", details: "Please log in to generate combined reports." },
        { status: 401 },
      );
    }

    // Per-user rate limiting
    const userRateLimit = rateLimitByUser(user.id, 10);
    if (!userRateLimit.success) {
      return createRateLimitResponse(
        userRateLimit.remaining,
        userRateLimit.reset,
      );
    }

    // Parse params
    const { searchParams } = new URL(request.url);
    const yearStr = searchParams.get("year") || new Date().getFullYear().toString();
    const year = parseInt(yearStr, 10);

    if (isNaN(year) || year < 2000 || year > 2100) {
      return NextResponse.json(
        { error: "Invalid year parameter" },
        { status: 400 },
      );
    }

    const formParam = (searchParams.get("form") || "").toLowerCase();
    const validForms = ["schedule-d", "schedule-c", "schedule-1"];
    if (!validForms.includes(formParam)) {
      return NextResponse.json(
        { error: `Invalid form parameter. Must be one of: ${validForms.join(", ")}` },
        { status: 400 },
      );
    }

    // Fetch user with wallets
    const userWithWallets = await prisma.user.findUnique({
      where: { id: user.id },
      include: { wallets: true },
    });

    if (!userWithWallets) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const walletAddresses = userWithWallets.wallets.map((w) => w.address);
    const filingStatus = (searchParams.get("filingStatus") || "single") as
      | "single" | "married_joint" | "married_separate" | "head_of_household";
    const costBasisMethod = (userWithWallets.costBasisMethod || "FIFO") as
      | "FIFO" | "LIFO" | "HIFO";
    const userTimezone = userWithWallets.timezone || "America/New_York";
    const userCountry = userWithWallets.country || "US";

    // Fetch both reports in parallel
    const [cryptoReport, securitiesReport] = await Promise.all([
      calculateTaxReport(
        prisma,
        walletAddresses,
        year,
        costBasisMethod,
        user.id,
        filingStatus,
        userTimezone,
        userCountry,
      ),
      generateSecuritiesTaxReport(user.id, year),
    ]);

    // Build the combined response based on the requested form
    let combinedData: any;

    if (formParam === "schedule-d") {
      // Schedule D: crypto ST/LT + securities ST/LT + Section 1256 60/40
      const combinedNetST = round2(
        cryptoReport.netShortTermGain
        + securitiesReport.netShortTermGain
        + securitiesReport.section1256ShortTerm
      );

      const combinedNetLT = round2(
        cryptoReport.netLongTermGain
        + securitiesReport.netLongTermGain
        + securitiesReport.section1256LongTerm
      );

      const combinedTotal = round2(combinedNetST + combinedNetLT);

      combinedData = {
        form: "schedule-d",
        year,
        crypto: {
          shortTermGains: cryptoReport.shortTermGains,
          shortTermLosses: cryptoReport.shortTermLosses,
          longTermGains: cryptoReport.longTermGains,
          longTermLosses: cryptoReport.longTermLosses,
          netShortTerm: cryptoReport.netShortTermGain,
          netLongTerm: cryptoReport.netLongTermGain,
        },
        securities: {
          shortTermGains: securitiesReport.shortTermGains,
          shortTermLosses: securitiesReport.shortTermLosses,
          longTermGains: securitiesReport.longTermGains,
          longTermLosses: securitiesReport.longTermLosses,
          netShortTerm: securitiesReport.netShortTermGain,
          netLongTerm: securitiesReport.netLongTermGain,
          section1256ShortTerm: securitiesReport.section1256ShortTerm,
          section1256LongTerm: securitiesReport.section1256LongTerm,
          section1256Total: securitiesReport.section1256Total,
        },
        combined: {
          netShortTerm: combinedNetST,
          netLongTerm: combinedNetLT,
          totalCapitalGainLoss: combinedTotal,
          capitalLossDeduction: combinedTotal < 0
            ? Math.max(combinedTotal, -3000)
            : 0,
        },
      };
    } else if (formParam === "schedule-c") {
      // Schedule C: Net trading P&L from both engines (for traders)
      const cryptoNetTrading = round2(
        cryptoReport.netShortTermGain + cryptoReport.netLongTermGain
      );
      const securitiesNetTrading = round2(
        securitiesReport.section475OrdinaryGainLoss
      );

      combinedData = {
        form: "schedule-c",
        year,
        crypto: {
          netTradingPL: cryptoNetTrading,
        },
        securities: {
          section475OrdinaryGainLoss: securitiesNetTrading,
        },
        combined: {
          netTradingPL: round2(cryptoNetTrading + securitiesNetTrading),
        },
      };
    } else {
      // Schedule 1: crypto income + forex Section 988 income
      const cryptoIncome = cryptoReport.totalIncome;
      const section988Income = securitiesReport.section988OrdinaryGainLoss;

      combinedData = {
        form: "schedule-1",
        year,
        crypto: {
          totalIncome: cryptoIncome,
          incomeEvents: cryptoReport.incomeEvents.length,
        },
        securities: {
          section988OrdinaryGainLoss: section988Income,
          dividendIncome: securitiesReport.totalOrdinaryDividends,
          interestIncome: securitiesReport.totalInterestIncome,
        },
        combined: {
          totalOtherIncome: round2(cryptoIncome + section988Income),
        },
      };
    }

    return NextResponse.json({
      status: "success",
      ...combinedData,
    });
  } catch (error) {
    console.error("[Combined Reports API] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to generate combined report",
        details: process.env.NODE_ENV === "development"
          ? (error instanceof Error ? error.message : "Unknown error")
          : "An internal error occurred",
      },
      { status: 500 },
    );
  }
}
