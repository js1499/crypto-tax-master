import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { rateLimitAPI, createRateLimitResponse, rateLimitByUser } from "@/lib/rate-limit";

/**
 * GET /api/tax-reports?year=2025
 *
 * Aggregates tax report data directly from the transactions table — the same
 * source of truth the transactions page and dashboard use.  Results are
 * persisted in TaxReportCache so subsequent loads are instant.
 *
 * Cache is invalidated whenever transactions are mutated (see
 * invalidateTaxReportCache calls across all mutation endpoints).
 */
export async function GET(request: NextRequest) {
  try {
    const rateLimitResult = rateLimitAPI(request, 30);
    if (!rateLimitResult.success) {
      return createRateLimitResponse(rateLimitResult.remaining, rateLimitResult.reset);
    }

    const searchParams = request.nextUrl.searchParams;
    const year = parseInt(searchParams.get("year") || new Date().getFullYear().toString());

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

    const costBasisMethod = "FIFO"; // Used as cache key; actual aggregation doesn't depend on method

    // ── Try persistent cache first ─────────────────────────────────
    const cached = await prisma.taxReportCache.findUnique({
      where: {
        userId_year_costBasisMethod: { userId: user.id, year, costBasisMethod },
      },
    });

    if (cached) {
      return NextResponse.json({
        status: "success",
        year,
        cached: true,
        report: cached.reportData,
      });
    }

    // ── Cache miss — aggregate from transactions table ─────────────
    const userWithWallets = await prisma.user.findUnique({
      where: { id: user.id },
      include: { wallets: true },
    });

    if (!userWithWallets) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const walletAddresses = userWithWallets.wallets.map((w) => w.address);

    const userExchanges = await prisma.exchange.findMany({
      where: { userId: user.id },
      select: { name: true },
    });
    const exchangeNames = userExchanges.map((e) => e.name);

    // Build ownership filter (same logic as dashboard analytics)
    const orConditions: Prisma.TransactionWhereInput[] = [];
    if (walletAddresses.length > 0) {
      orConditions.push({ wallet_address: { in: walletAddresses } });
    }
    orConditions.push({
      AND: [{ source_type: "csv_import" }, { userId: user.id }],
    });
    if (exchangeNames.length > 0) {
      orConditions.push({
        AND: [{ source_type: "exchange_api" }, { source: { in: exchangeNames } }],
      });
    }

    const yearStart = new Date(`${year}-01-01T00:00:00Z`);
    const yearEnd = new Date(`${year}-12-31T23:59:59.999Z`);

    const whereFilter: Prisma.TransactionWhereInput = {
      OR: orConditions,
      status: { in: ["confirmed", "completed", "pending"] },
      tx_timestamp: { gte: yearStart, lte: yearEnd },
    };

    // Fetch transactions for this year
    const transactions = await prisma.transaction.findMany({
      where: whereFilter,
      select: {
        gain_loss_usd: true,
        value_usd: true,
        is_income: true,
        type: true,
      },
    });

    // Aggregate — same data source as transactions page & dashboard
    let totalGains = 0;
    let totalLosses = 0;
    let totalIncome = 0;
    let taxableEventCount = 0;
    let incomeEventCount = 0;

    for (const tx of transactions) {
      const gainLoss = tx.gain_loss_usd ? Number(tx.gain_loss_usd) : 0;

      if (gainLoss > 0) {
        totalGains += gainLoss;
        taxableEventCount++;
      } else if (gainLoss < 0) {
        totalLosses += gainLoss; // negative
        taxableEventCount++;
      }

      if (tx.is_income) {
        totalIncome += Number(tx.value_usd);
        incomeEventCount++;
      }
    }

    const netGainLoss = totalGains + totalLosses;

    // Format currency helper
    const fmt = (n: number) =>
      `$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const fmtSigned = (n: number) =>
      n < 0 ? `-${fmt(n)}` : fmt(n);

    const reportPayload = {
      // The transactions page doesn't distinguish ST/LT — show totals
      // ST/LT breakdown is only available via the tax calculator (used in PDF generation)
      shortTermGains: fmtSigned(totalGains),
      shortTermLosses: fmtSigned(totalLosses),
      longTermGains: "$0.00",
      longTermLosses: "$0.00",
      totalIncome: fmt(totalIncome),
      netShortTermGain: fmtSigned(netGainLoss),
      netLongTermGain: "$0.00",
      totalTaxableGain: fmtSigned(netGainLoss),
      taxableEvents: taxableEventCount,
      incomeEvents: incomeEventCount,
      totalTransactions: transactions.length,
    };

    // Persist to cache
    try {
      await prisma.taxReportCache.upsert({
        where: {
          userId_year_costBasisMethod: { userId: user.id, year, costBasisMethod },
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

    return NextResponse.json({
      status: "success",
      year,
      cached: false,
      report: reportPayload,
    });
  } catch (error) {
    console.error("[Tax Reports API] Error:", error);
    return NextResponse.json(
      { error: "Failed to calculate tax report", details: process.env.NODE_ENV === "development" ? (error instanceof Error ? error.message : "Unknown error") : "An internal error occurred" },
      { status: 500 },
    );
  }
}
