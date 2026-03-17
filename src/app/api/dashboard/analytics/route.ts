import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { rateLimitAPI, createRateLimitResponse } from "@/lib/rate-limit";
import * as Sentry from "@sentry/nextjs";

/**
 * Known transaction types used to calculate the "identified" percentage.
 * Any transaction whose type falls outside this list is considered unidentified.
 */
const KNOWN_TYPES = [
  "buy", "sell", "swap", "send", "receive", "dca",
  "reward", "stake", "staking", "unstake", "income",
  "airdrop", "mining", "yield", "interest",
  "yield farming", "farm reward",
  "nft purchase", "nft sale",
  "margin buy", "margin sell", "liquidation",
  "bridge", "add liquidity", "remove liquidity",
  "mint", "burn", "deposit", "withdraw",
];

/**
 * GET /api/dashboard/analytics
 *
 * Returns analytics data for the dashboard including P&L breakdowns,
 * activity patterns, top assets, and portfolio insights.
 *
 * Query params:
 *   year – optional, e.g. "2025". Defaults to current year.
 */
export async function GET(request: NextRequest) {
  try {
    // ── Rate limiting ──────────────────────────────────────────────
    const rateLimitResult = rateLimitAPI(request, 100);
    if (!rateLimitResult.success) {
      return createRateLimitResponse(
        rateLimitResult.remaining,
        rateLimitResult.reset
      );
    }

    // ── Authentication ─────────────────────────────────────────────
    let user;
    try {
      user = await getCurrentUser(request);
    } catch (authError) {
      const errorMessage =
        authError instanceof Error ? authError.message : "Unknown error";
      if (
        errorMessage.includes("Can't reach database") ||
        errorMessage.includes("P1001")
      ) {
        return NextResponse.json(
          {
            error: "Database connection failed",
            details: "Please check your DATABASE_URL in .env file.",
          },
          { status: 503 }
        );
      }
      throw authError;
    }

    if (!user) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    // ── Year parameter ─────────────────────────────────────────────
    const { searchParams } = new URL(request.url);
    const yearParam = searchParams.get("year");
    const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear();
    const yearStart = new Date(`${year}-01-01T00:00:00Z`);
    const yearEnd = new Date(`${year}-12-31T23:59:59.999Z`);

    // ── Resolve wallet addresses & exchange names (same as stats) ──
    const userWithWallets = await prisma.user.findUnique({
      where: { id: user.id },
      include: { wallets: true },
    });

    const walletAddresses =
      userWithWallets?.wallets.map((w) => w.address) || [];

    const userExchanges = await prisma.exchange.findMany({
      where: { userId: user.id },
      select: { name: true },
    });
    const exchangeNames = userExchanges.map((e) => e.name);

    // ── Build OR conditions for ownership filtering ────────────────
    const orConditions: Prisma.TransactionWhereInput[] = [];

    if (walletAddresses.length > 0) {
      orConditions.push({ wallet_address: { in: walletAddresses } });
    }
    // CSV imports (no wallet_address)
    orConditions.push({
      AND: [{ source_type: "csv_import" }, { wallet_address: null }],
    });
    // Exchange API imports scoped to user's exchanges
    if (exchangeNames.length > 0) {
      orConditions.push({
        AND: [
          { source_type: "exchange_api" },
          { source: { in: exchangeNames } },
        ],
      });
    }

    const ownershipFilter: Prisma.TransactionWhereInput = {
      OR: orConditions,
      status: { in: ["confirmed", "completed", "pending"] },
    };

    const yearFilter: Prisma.TransactionWhereInput = {
      ...ownershipFilter,
      tx_timestamp: { gte: yearStart, lte: yearEnd },
    };

    // ── Fetch all transactions for the year (used for aggregations) ─
    const transactions = await prisma.transaction.findMany({
      where: yearFilter,
      orderBy: { tx_timestamp: "asc" },
    });

    // ── 1. Monthly P&L ────────────────────────────────────────────
    const monthlyMap: Record<
      string,
      { gains: number; losses: number; income: number; txnCount: number }
    > = {};

    // Initialise all 12 months so every month is represented
    for (let m = 0; m < 12; m++) {
      const key = `${year}-${String(m + 1).padStart(2, "0")}`;
      monthlyMap[key] = { gains: 0, losses: 0, income: 0, txnCount: 0 };
    }

    let totalVolume = 0;

    for (const tx of transactions) {
      const monthKey = `${tx.tx_timestamp.getFullYear()}-${String(
        tx.tx_timestamp.getMonth() + 1
      ).padStart(2, "0")}`;

      if (!monthlyMap[monthKey]) {
        monthlyMap[monthKey] = { gains: 0, losses: 0, income: 0, txnCount: 0 };
      }

      const entry = monthlyMap[monthKey];
      entry.txnCount += 1;

      const gainLoss = tx.gain_loss_usd ? Number(tx.gain_loss_usd) : 0;
      if (gainLoss > 0) {
        entry.gains += gainLoss;
      } else if (gainLoss < 0) {
        entry.losses += gainLoss; // negative number
      }

      if (tx.is_income) {
        entry.income += Number(tx.value_usd);
      }

      totalVolume += Math.abs(Number(tx.value_usd));
    }

    const monthly: Array<{
      month: string;
      gains: number;
      losses: number;
      income: number;
      txnCount: number;
    }> = Object.entries(monthlyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => ({
        month,
        gains: parseFloat(data.gains.toFixed(2)),
        losses: parseFloat(data.losses.toFixed(2)),
        income: parseFloat(data.income.toFixed(2)),
        txnCount: data.txnCount,
      }));

    const totalGains = monthly.reduce((sum, m) => sum + m.gains, 0);
    const totalLosses = monthly.reduce((sum, m) => sum + m.losses, 0);
    const netPnl = parseFloat((totalGains + totalLosses).toFixed(2));
    const totalIncome = monthly.reduce((sum, m) => sum + m.income, 0);

    // ── 2. Activity ────────────────────────────────────────────────
    const totalTransactions = transactions.length;

    const monthlyPattern: Array<{ month: string; count: number }> =
      monthly.map((m) => ({ month: m.month, count: m.txnCount }));

    const peakMonth =
      monthlyPattern.length > 0
        ? monthlyPattern.reduce((best, cur) =>
            cur.count > best.count ? cur : best
          ).month
        : "";

    // ── 3. Top Assets by absolute gain/loss ────────────────────────
    const assetGainLossMap: Record<string, number> = {};

    for (const tx of transactions) {
      const asset = (tx.asset_symbol || "UNKNOWN").trim().toUpperCase();
      const gainLoss = tx.gain_loss_usd ? Number(tx.gain_loss_usd) : 0;
      assetGainLossMap[asset] = (assetGainLossMap[asset] || 0) + gainLoss;
    }

    const topAssets: Array<{ asset: string; gainLoss: number }> =
      Object.entries(assetGainLossMap)
        .map(([asset, gainLoss]) => ({
          asset,
          gainLoss: parseFloat(gainLoss.toFixed(2)),
        }))
        .sort((a, b) => Math.abs(b.gainLoss) - Math.abs(a.gainLoss))
        .slice(0, 10);

    // ── 4. Insights ────────────────────────────────────────────────
    const identifiedCount = transactions.filter((tx) =>
      KNOWN_TYPES.includes(tx.type.toLowerCase())
    ).length;
    const identifiedPct =
      totalTransactions > 0
        ? parseFloat(
            ((identifiedCount / totalTransactions) * 100).toFixed(1)
          )
        : 0;

    const biggestGain =
      topAssets.length > 0
        ? topAssets.reduce<{ asset: string; amount: number } | null>(
            (best, cur) => {
              if (cur.gainLoss <= 0) return best;
              if (!best || cur.gainLoss > best.amount)
                return { asset: cur.asset, amount: cur.gainLoss };
              return best;
            },
            null
          )
        : null;

    const biggestLoss =
      topAssets.length > 0
        ? topAssets.reduce<{ asset: string; amount: number } | null>(
            (best, cur) => {
              if (cur.gainLoss >= 0) return best;
              if (!best || cur.gainLoss < best.amount)
                return { asset: cur.asset, amount: cur.gainLoss };
              return best;
            },
            null
          )
        : null;

    // Distinct asset symbols across the year
    const distinctAssetsSet = new Set<string>();
    for (const tx of transactions) {
      const sym = (tx.asset_symbol || "").trim().toUpperCase();
      if (sym) distinctAssetsSet.add(sym);
    }
    const distinctAssets = distinctAssetsSet.size;

    // Accounts connected = wallets + exchanges
    const walletsCount = userWithWallets?.wallets.length || 0;
    const exchangesCount = userExchanges.length;
    const accountsConnected = walletsCount + exchangesCount;

    // Rough tax estimate: 24% on gains + 24% on income
    const taxEstimate = parseFloat(
      (
        (totalGains > 0 ? totalGains * 0.24 : 0) +
        (totalIncome > 0 ? totalIncome * 0.24 : 0)
      ).toFixed(2)
    );

    // ── Response ───────────────────────────────────────────────────
    return NextResponse.json({
      status: "success",
      pnl: {
        monthly,
        totalGains: parseFloat(totalGains.toFixed(2)),
        totalLosses: parseFloat(totalLosses.toFixed(2)),
        netPnl,
        totalIncome: parseFloat(totalIncome.toFixed(2)),
        totalVolume: parseFloat(totalVolume.toFixed(2)),
      },
      activity: {
        totalTransactions,
        peakMonth,
        monthlyPattern,
      },
      topAssets,
      insights: {
        identifiedPct,
        biggestGain,
        biggestLoss,
        distinctAssets,
        accountsConnected,
        taxEstimate,
      },
    });
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("[Dashboard Analytics API] Error:", error);
    }

    Sentry.captureException(error, {
      tags: { endpoint: "/api/dashboard/analytics" },
    });

    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    const isDatabaseError =
      errorMessage.includes("Can't reach database") ||
      errorMessage.includes("P1001") ||
      errorMessage.includes("connection");

    return NextResponse.json(
      {
        error: "Failed to fetch dashboard analytics",
        details: isDatabaseError
          ? "Database connection failed. Please check your DATABASE_URL in .env file."
          : errorMessage,
      },
      { status: 500 }
    );
  }
}
