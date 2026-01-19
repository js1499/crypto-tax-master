import { NextRequest, NextResponse } from "next/server";
import { PrismaClient, Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { rateLimitAPI, createRateLimitResponse } from "@/lib/rate-limit";
import * as Sentry from "@sentry/nextjs";
import { Decimal } from "@prisma/client/runtime/library";

const prisma = new PrismaClient();

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

    // Get user authentication
    let user;
    try {
      const sessionCookie = request.cookies.get("session_token")?.value;

      user = await getCurrentUser(sessionCookie);
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

    // Build where clause for transactions
    const whereClause: Prisma.TransactionWhereInput = {};
    if (walletAddresses.length > 0) {
      whereClause.wallet_address = { in: walletAddresses };
    } else {
      // If no wallets, return empty stats
      return NextResponse.json({
        status: "success",
        stats: {
          totalPortfolioValue: 0,
          unrealizedGains: 0,
          taxableEvents2023: 0,
          assetAllocation: [],
          portfolioValueOverTime: [],
          recentTransactions: [],
        },
      });
    }

    // Fetch all transactions
    const allTransactions = await prisma.transaction.findMany({
      where: {
        ...whereClause,
        status: { in: ["confirmed", "completed"] },
      },
      orderBy: { tx_timestamp: "asc" },
    });

    // Calculate current holdings and cost basis
    const holdings: Record<string, { amount: number; costBasis: number; avgPrice: number }> = {};
    const costBasisLots: Record<string, Array<{ date: Date; amount: number; costBasis: number }>> = {};

    // Process transactions to calculate holdings
    for (const tx of allTransactions) {
      const asset = tx.asset_symbol;
      const amount = Number(tx.amount_value);
      const valueUsd = Number(tx.value_usd);
      const feeUsd = tx.fee_usd ? Number(tx.fee_usd) : 0;
      const txType = tx.type.toLowerCase();

      if (!holdings[asset]) {
        holdings[asset] = { amount: 0, costBasis: 0, avgPrice: 0 };
        costBasisLots[asset] = [];
      }

      // Handle buys, DCA, receives, rewards, income - add to holdings
      if (["buy", "dca", "receive", "reward", "staking", "income", "deposit"].includes(txType)) {
        const totalCostBasis = Math.abs(valueUsd) + feeUsd;
        holdings[asset].amount += amount;
        holdings[asset].costBasis += totalCostBasis;
        costBasisLots[asset].push({
          date: tx.tx_timestamp,
          amount,
          costBasis: totalCostBasis,
        });
      }
      // Handle sells, sends, swaps (outgoing) - remove from holdings
      else if (["sell", "send", "swap", "withdraw"].includes(txType)) {
        const sellAmount = amount;
        let remainingToSell = sellAmount;
        
        // Use FIFO to calculate cost basis of sold amount
        let soldCostBasis = 0;
        for (const lot of costBasisLots[asset]) {
          if (remainingToSell <= 0) break;
          const amountFromLot = Math.min(remainingToSell, lot.amount);
          const costBasisFromLot = (lot.costBasis / lot.amount) * amountFromLot;
          soldCostBasis += costBasisFromLot;
          lot.amount -= amountFromLot;
          remainingToSell -= amountFromLot;
        }

        // Remove empty lots
        costBasisLots[asset] = costBasisLots[asset].filter((lot) => lot.amount > 0);

        holdings[asset].amount -= sellAmount;
        holdings[asset].costBasis -= soldCostBasis;
      }

      // Handle swaps - incoming asset
      if (tx.incoming_asset_symbol && tx.incoming_amount_value && tx.incoming_value_usd) {
        const incomingAsset = tx.incoming_asset_symbol;
        const incomingAmount = Number(tx.incoming_amount_value);
        const incomingValueUsd = Number(tx.incoming_value_usd);
        const incomingFeeUsd = feeUsd; // Fees typically apply to outgoing side

        if (!holdings[incomingAsset]) {
          holdings[incomingAsset] = { amount: 0, costBasis: 0, avgPrice: 0 };
          costBasisLots[incomingAsset] = [];
        }

        const incomingCostBasis = incomingValueUsd + incomingFeeUsd;
        holdings[incomingAsset].amount += incomingAmount;
        holdings[incomingAsset].costBasis += incomingCostBasis;
        costBasisLots[incomingAsset].push({
          date: tx.tx_timestamp,
          amount: incomingAmount,
          costBasis: incomingCostBasis,
        });
      }
    }

    // Get current prices for assets (using latest transaction price as proxy)
    // In production, you'd fetch from CoinGecko or similar
    const currentPrices: Record<string, number> = {};
    for (const asset in holdings) {
      if (holdings[asset].amount > 0) {
        // Find latest transaction with price for this asset
        const latestTx = allTransactions
          .filter((tx) => tx.asset_symbol === asset && tx.price_per_unit)
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

    // Calculate taxable events for 2023
    const year2023Start = new Date("2023-01-01T00:00:00Z");
    const year2023End = new Date("2023-12-31T23:59:59Z");
    const taxableEvents2023 = allTransactions.filter(
      (tx) =>
        tx.tx_timestamp >= year2023Start &&
        tx.tx_timestamp <= year2023End &&
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
    let runningHoldings: Record<string, { amount: number; costBasis: number }> = {};
    let runningCostBasisLots: Record<string, Array<{ date: Date; amount: number; costBasis: number }>> = {};

    for (const monthKey of sortedMonths) {
      const monthTransactions = transactionsByMonth[monthKey].sort(
        (a, b) => a.tx_timestamp.getTime() - b.tx_timestamp.getTime()
      );

      // Process all transactions in this month
      for (const tx of monthTransactions) {
        const asset = tx.asset_symbol;
        const amount = Number(tx.amount_value);
        const valueUsd = Number(tx.value_usd);
        const feeUsd = tx.fee_usd ? Number(tx.fee_usd) : 0;
        const txType = tx.type.toLowerCase();

        if (!runningHoldings[asset]) {
          runningHoldings[asset] = { amount: 0, costBasis: 0 };
          runningCostBasisLots[asset] = [];
        }

        // Handle buys, receives, rewards - add to holdings
        if (["buy", "dca", "receive", "reward", "staking", "income", "deposit"].includes(txType)) {
          const totalCostBasis = Math.abs(valueUsd) + feeUsd;
          runningHoldings[asset].amount += amount;
          runningHoldings[asset].costBasis += totalCostBasis;
          runningCostBasisLots[asset].push({
            date: tx.tx_timestamp,
            amount,
            costBasis: totalCostBasis,
          });
        }
        // Handle sells, sends, swaps (outgoing) - remove from holdings
        else if (["sell", "send", "swap", "withdraw"].includes(txType)) {
          const sellAmount = amount;
          let remainingToSell = sellAmount;
          let soldCostBasis = 0;

          // Use FIFO to calculate cost basis
          for (const lot of runningCostBasisLots[asset]) {
            if (remainingToSell <= 0) break;
            const amountFromLot = Math.min(remainingToSell, lot.amount);
            const costBasisFromLot = (lot.costBasis / lot.amount) * amountFromLot;
            soldCostBasis += costBasisFromLot;
            lot.amount -= amountFromLot;
            remainingToSell -= amountFromLot;
          }

          runningCostBasisLots[asset] = runningCostBasisLots[asset].filter((lot) => lot.amount > 0);
          runningHoldings[asset].amount -= sellAmount;
          runningHoldings[asset].costBasis -= soldCostBasis;
        }

        // Handle swaps - incoming asset
        if (tx.incoming_asset_symbol && tx.incoming_amount_value && tx.incoming_value_usd) {
          const incomingAsset = tx.incoming_asset_symbol;
          const incomingAmount = Number(tx.incoming_amount_value);
          const incomingValueUsd = Number(tx.incoming_value_usd);
          const incomingCostBasis = incomingValueUsd + feeUsd;

          if (!runningHoldings[incomingAsset]) {
            runningHoldings[incomingAsset] = { amount: 0, costBasis: 0 };
            runningCostBasisLots[incomingAsset] = [];
          }

          runningHoldings[incomingAsset].amount += incomingAmount;
          runningHoldings[incomingAsset].costBasis += incomingCostBasis;
          runningCostBasisLots[incomingAsset].push({
            date: tx.tx_timestamp,
            amount: incomingAmount,
            costBasis: incomingCostBasis,
          });
        }
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
        taxableEvents2023,
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
  } finally {
    await prisma.$disconnect();
  }
}
