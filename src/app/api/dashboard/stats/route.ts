import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { rateLimitAPI, createRateLimitResponse } from "@/lib/rate-limit";
import * as Sentry from "@sentry/nextjs";

/**
 * GET /api/dashboard/stats
 * Fetch dashboard statistics including portfolio value, gains, asset allocation, etc.
 */
export async function GET(request: NextRequest) {
  try {
    // Rate limiting
    const rateLimitResult = rateLimitAPI(request, 100);
    if (!rateLimitResult.success) {
      return createRateLimitResponse(
        rateLimitResult.remaining,
        rateLimitResult.reset
      );
    }

    // Get user authentication - pass request for proper Vercel session handling
    let user;
    try {
      user = await getCurrentUser(request);
    } catch (authError) {
      const errorMessage = authError instanceof Error ? authError.message : "Unknown error";
      if (errorMessage.includes("Can't reach database") || errorMessage.includes("P1001")) {
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

    // Get user's wallets
    const userWithWallets = await prisma.user.findUnique({
      where: { id: user.id },
      include: { wallets: true },
    });

    const walletAddresses = userWithWallets?.wallets.map((w) => w.address) || [];
    const costBasisMethod = (userWithWallets?.costBasisMethod || "FIFO") as "FIFO" | "LIFO" | "HIFO";

    // Helper to sort lots according to user's cost basis method
    function sortLotsForMethod<T extends { date: Date; amount: number; costBasis: number }>(lots: T[]): T[] {
      switch (costBasisMethod) {
        case "LIFO":
          return [...lots].sort((a, b) => b.date.getTime() - a.date.getTime());
        case "HIFO":
          return [...lots].sort((a, b) => {
            const aPerUnit = a.amount > 0 ? a.costBasis / a.amount : 0;
            const bPerUnit = b.amount > 0 ? b.costBasis / b.amount : 0;
            return bPerUnit - aPerUnit;
          });
        case "FIFO":
        default:
          // Already in chronological order from DB query
          return [...lots];
      }
    }

    // Build where clause for transactions - include CSV imports and exchange API imports
    const whereClause: Prisma.TransactionWhereInput = {};
    const orConditions: Prisma.TransactionWhereInput[] = [];

    if (walletAddresses.length > 0) {
      orConditions.push({ wallet_address: { in: walletAddresses } });
    }
    // Include CSV imports (see LIMITATION note in tax-calculator.ts)
    orConditions.push({
      AND: [{ source_type: "csv_import" }, { wallet_address: null }],
    });
    // Include exchange API imports — scoped to user's connected exchanges
    const userExchanges = await prisma.exchange.findMany({
      where: { userId: user.id },
      select: { name: true },
    });
    const exchangeNames = userExchanges.map(e => e.name);
    if (exchangeNames.length > 0) {
      orConditions.push({
        AND: [
          { source_type: "exchange_api" },
          { source: { in: exchangeNames } },
        ],
      });
    }

    whereClause.OR = orConditions;

    // Fetch all transactions
    const allTransactions = await prisma.transaction.findMany({
      where: {
        ...whereClause,
        status: { in: ["confirmed", "completed", "pending"] },
      },
      orderBy: { tx_timestamp: "asc" },
    });

    // L-3 fix: Extracted holdings processing into a reusable function
    // to eliminate duplication between current holdings and monthly snapshots.
    const BUY_SIDE_TYPES = ["buy", "dca", "receive", "reward", "stake", "staking", "income", "deposit", "airdrop", "mining", "yield", "interest", "yield farming", "farm reward", "nft purchase", "margin buy", "add liquidity", "mint"];
    const SELL_SIDE_TYPES = ["sell", "send", "swap", "withdraw", "nft sale", "margin sell", "liquidation", "bridge", "remove liquidity", "burn", "unstake"];

    type HoldingsMap = Record<string, { amount: number; costBasis: number }>;
    type LotMap = Record<string, Array<{ date: Date; amount: number; costBasis: number }>>;

    function processTransactionForHoldings(
      tx: typeof allTransactions[number],
      holdingsMap: HoldingsMap,
      lotsMap: LotMap,
    ) {
      const asset = (tx.asset_symbol || "").trim().toUpperCase();
      const amount = Number(tx.amount_value);
      const valueUsd = Number(tx.value_usd);
      const feeUsd = tx.fee_usd ? Number(tx.fee_usd) : 0;
      const txType = tx.type.toLowerCase();

      if (!holdingsMap[asset]) {
        holdingsMap[asset] = { amount: 0, costBasis: 0 };
        lotsMap[asset] = [];
      }

      if (BUY_SIDE_TYPES.includes(txType)) {
        const totalCostBasis = Math.abs(valueUsd) + feeUsd;
        holdingsMap[asset].amount += amount;
        holdingsMap[asset].costBasis += totalCostBasis;
        lotsMap[asset].push({ date: tx.tx_timestamp, amount, costBasis: totalCostBasis });
      } else if (SELL_SIDE_TYPES.includes(txType)) {
        let remainingToSell = amount;
        const sortedLots = sortLotsForMethod(lotsMap[asset]);
        let soldCostBasis = 0;
        for (const lot of sortedLots) {
          if (remainingToSell <= 0) break;
          const amountFromLot = Math.min(remainingToSell, lot.amount);
          const costBasisPerUnit = lot.amount > 0 ? lot.costBasis / lot.amount : 0;
          const costBasisFromLot = costBasisPerUnit * amountFromLot;
          soldCostBasis += costBasisFromLot;
          lot.amount -= amountFromLot;
          lot.costBasis -= costBasisFromLot;
          remainingToSell -= amountFromLot;
        }
        lotsMap[asset] = lotsMap[asset].filter((lot) => lot.amount > 0);
        holdingsMap[asset].amount = Math.max(0, holdingsMap[asset].amount - amount);
        holdingsMap[asset].costBasis = Math.max(0, holdingsMap[asset].costBasis - soldCostBasis);
      }

      // Handle swaps - incoming asset
      if (tx.incoming_asset_symbol && tx.incoming_amount_value && tx.incoming_value_usd) {
        const incomingAsset = (tx.incoming_asset_symbol || "").trim().toUpperCase();
        const incomingAmount = Number(tx.incoming_amount_value);
        const incomingValueUsd = Number(tx.incoming_value_usd);
        if (!holdingsMap[incomingAsset]) {
          holdingsMap[incomingAsset] = { amount: 0, costBasis: 0 };
          lotsMap[incomingAsset] = [];
        }
        const incomingCostBasis = incomingValueUsd;
        holdingsMap[incomingAsset].amount += incomingAmount;
        holdingsMap[incomingAsset].costBasis += incomingCostBasis;
        lotsMap[incomingAsset].push({ date: tx.tx_timestamp, amount: incomingAmount, costBasis: incomingCostBasis });
      }
    }

    // Calculate current holdings and cost basis
    const holdings: HoldingsMap = {};
    const costBasisLots: LotMap = {};

    for (const tx of allTransactions) {
      processTransactionForHoldings(tx, holdings, costBasisLots);
    }

    // Get current prices for assets (using latest transaction price as proxy)
    // In production, you'd fetch from CoinGecko or similar
    const currentPrices: Record<string, number> = {};
    for (const asset in holdings) {
      if (holdings[asset].amount > 0) {
        // Find latest transaction with price for this asset
        const latestTx = allTransactions
          .filter((tx) => (tx.asset_symbol || "").trim().toUpperCase() === asset && tx.price_per_unit)
          .sort((a, b) => b.tx_timestamp.getTime() - a.tx_timestamp.getTime())[0];
        
        if (latestTx && latestTx.price_per_unit) {
          currentPrices[asset] = Number(latestTx.price_per_unit);
        } else {
          // Fallback: use average cost basis price
          currentPrices[asset] = holdings[asset].costBasis / holdings[asset].amount;
        }
      }
    }

    // Calculate total portfolio value and unrealized gains
    let totalPortfolioValue = 0;
    let totalCostBasis = 0;

    for (const asset in holdings) {
      if (holdings[asset].amount > 0) {
        const currentValue = holdings[asset].amount * (currentPrices[asset] || 0);
        totalPortfolioValue += currentValue;
        totalCostBasis += holdings[asset].costBasis;
      }
    }

    const unrealizedGains = totalPortfolioValue - totalCostBasis;

    // BUG-014 fix: Calculate taxable events for current year instead of hardcoded 2023
    const currentYear = new Date().getFullYear();
    const yearStart = new Date(`${currentYear}-01-01T00:00:00Z`);
    const yearEnd = new Date(`${currentYear}-12-31T23:59:59Z`);
    const taxableEventsCurrentYear = allTransactions.filter(
      (tx) =>
        tx.tx_timestamp >= yearStart &&
        tx.tx_timestamp <= yearEnd &&
        ["sell", "swap"].includes(tx.type.toLowerCase())
    ).length;

    // Calculate asset allocation
    const assetAllocation = Object.entries(holdings)
      .filter(([_, holding]) => holding.amount > 0)
      .map(([asset, holding]) => {
        const currentValue = holding.amount * (currentPrices[asset] || 0);
        return {
          name: asset,
          value: currentValue,
          amount: holding.amount,
          costBasis: holding.costBasis,
          currentPrice: currentPrices[asset] || 0,
        };
      })
      .filter((item) => item.value > 0)
      .sort((a, b) => b.value - a.value);

    // Calculate portfolio value over time (monthly snapshots)
    const portfolioValueOverTime: Array<{ date: string; value: number }> = [];
    
    // Group transactions by month
    const transactionsByMonth: Record<string, typeof allTransactions> = {};
    for (const tx of allTransactions) {
      const monthKey = `${tx.tx_timestamp.getFullYear()}-${String(tx.tx_timestamp.getMonth() + 1).padStart(2, "0")}`;
      if (!transactionsByMonth[monthKey]) {
        transactionsByMonth[monthKey] = [];
      }
      transactionsByMonth[monthKey].push(tx);
    }

    // Process transactions chronologically month by month
    const sortedMonths = Object.keys(transactionsByMonth).sort();
    const runningHoldings: Record<string, { amount: number; costBasis: number }> = {};
    const runningCostBasisLots: Record<string, Array<{ date: Date; amount: number; costBasis: number }>> = {};

    for (const monthKey of sortedMonths) {
      const monthTransactions = transactionsByMonth[monthKey].sort(
        (a, b) => a.tx_timestamp.getTime() - b.tx_timestamp.getTime()
      );

      // L-3 fix: Reuse shared processTransactionForHoldings function
      for (const tx of monthTransactions) {
        processTransactionForHoldings(tx, runningHoldings, runningCostBasisLots);
      }

      // Calculate portfolio value at end of this month
      let monthValue = 0;
      for (const asset in runningHoldings) {
        if (runningHoldings[asset].amount > 0) {
          // Use current price or average cost basis price
          const price = currentPrices[asset] || 
            (runningHoldings[asset].costBasis / runningHoldings[asset].amount || 0);
          monthValue += runningHoldings[asset].amount * price;
        }
      }

      portfolioValueOverTime.push({
        date: `${monthKey}-01`,
        value: monthValue,
      });
    }

    // If no historical data, add current portfolio value
    if (portfolioValueOverTime.length === 0 && totalPortfolioValue > 0) {
      portfolioValueOverTime.push({
        date: new Date().toISOString().split("T")[0],
        value: totalPortfolioValue,
      });
    }

    // Get recent transactions (last 10)
    const recentTransactions = allTransactions
      .sort((a, b) => b.tx_timestamp.getTime() - a.tx_timestamp.getTime())
      .slice(0, 10)
      .map((tx) => ({
        id: tx.id,
        type: tx.type,
        asset: tx.asset_symbol,
        amount: Number(tx.amount_value),
        value: Number(tx.value_usd),
        date: tx.tx_timestamp.toISOString(),
        status: tx.status,
      }));

    return NextResponse.json({
      status: "success",
      stats: {
        totalPortfolioValue,
        unrealizedGains,
        taxableEventsCurrentYear,
        currentYear,
        assetAllocation,
        portfolioValueOverTime,
        recentTransactions,
      },
    });
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("[Dashboard Stats API] Error:", error);
    }

    Sentry.captureException(error, {
      tags: {
        endpoint: "/api/dashboard/stats",
      },
    });

    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const isDatabaseError = errorMessage.includes("Can't reach database") || 
                           errorMessage.includes("P1001") ||
                           errorMessage.includes("connection");

    return NextResponse.json(
      {
        error: "Failed to fetch dashboard statistics",
        details: isDatabaseError 
          ? "Database connection failed. Please check your DATABASE_URL in .env file."
          : errorMessage,
      },
      { status: 500 }
    );
  }
}
