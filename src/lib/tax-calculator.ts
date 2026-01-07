import { PrismaClient, Transaction, Prisma } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";

// Types for tax calculations
export interface TaxableEvent {
  id: number;
  date: Date;
  asset: string;
  amount: number;
  proceeds: number; // Sale price in USD
  costBasis: number; // Purchase price in USD
  gainLoss: number; // proceeds - costBasis
  holdingPeriod: "short" | "long"; // Short-term: < 1 year, Long-term: >= 1 year
  chain?: string;
  txHash?: string;
}

export interface IncomeEvent {
  id: number;
  date: Date;
  asset: string;
  amount: number;
  valueUsd: number;
  type: "staking" | "reward" | "airdrop" | "mining" | "other";
  chain?: string;
  txHash?: string;
}

export interface TaxReport {
  year: number;
  shortTermGains: number;
  longTermGains: number;
  shortTermLosses: number;
  longTermLosses: number;
  totalIncome: number;
  taxableEvents: TaxableEvent[];
  incomeEvents: IncomeEvent[];
  netShortTermGain: number;
  netLongTermGain: number;
  totalTaxableGain: number;
  // US Tax Compliance Fields
  deductibleLosses: number; // Capital losses deductible this year (max $3,000)
  lossCarryover: number; // Capital losses carried forward to next year
  form8949Data: Form8949Entry[]; // Data formatted for IRS Form 8949
}

// IRS Form 8949 required fields
export interface Form8949Entry {
  description: string; // Description of property (e.g., "1.5 ETH")
  dateAcquired: Date; // Date acquired
  dateSold: Date; // Date sold or disposed
  proceeds: number; // Sales price
  costBasis: number; // Cost or other basis
  code: string; // Adjustment code (if any)
  gainLoss: number; // Gain or (loss)
  holdingPeriod: "short" | "long";
}

// FIFO queue for tracking cost basis
interface CostBasisLot {
  id: number;
  date: Date;
  amount: number; // Amount remaining in this lot
  costBasis: number; // Total cost basis for this lot (including fees)
  pricePerUnit: number;
  fees?: number; // Transaction fees (added to cost basis per IRS rules)
}

/**
 * Calculate tax report for a given year
 */
export async function calculateTaxReport(
  prisma: PrismaClient,
  walletAddresses: string[],
  year: number,
  method: "FIFO" | "LIFO" | "HIFO" = "FIFO"
): Promise<TaxReport> {
  const startDate = new Date(`${year}-01-01T00:00:00Z`);
  const endDate = new Date(`${year}-12-31T23:59:59Z`);

  // Fetch all transactions for the user's wallets up to and including the tax year
  // We need all transactions to calculate cost basis properly
  const whereClause: Prisma.TransactionWhereInput = {
    tx_timestamp: {
      lte: endDate,
    },
  };

  // Filter by wallet addresses if provided
  if (walletAddresses.length > 0) {
    whereClause.wallet_address = { in: walletAddresses };
  }

  // Filter by status - include both confirmed and completed transactions
  whereClause.status = { in: ["confirmed", "completed"] };

  const allTransactions = await prisma.transaction.findMany({
    where: whereClause,
    orderBy: {
      tx_timestamp: "asc",
    },
  });

  // Filter transactions by chain (Solana or Ethereum)
  const solanaTransactions = allTransactions.filter(
    (tx: Transaction) => tx.chain?.toLowerCase() === "solana" || tx.chain?.toLowerCase() === "sol"
  );
  const ethereumTransactions = allTransactions.filter(
    (tx: Transaction) =>
      tx.chain?.toLowerCase() === "ethereum" ||
      tx.chain?.toLowerCase() === "eth" ||
      tx.chain?.toLowerCase() === "ethereum mainnet"
  );

  // Process transactions for both chains
  const solanaReport = processTransactionsForTax(
    solanaTransactions,
    year,
    method
  );
  const ethereumReport = processTransactionsForTax(
    ethereumTransactions,
    year,
    method
  );

  // Combine reports
  const combinedTaxableEvents = [
    ...solanaReport.taxableEvents,
    ...ethereumReport.taxableEvents,
  ];
  const combinedIncomeEvents = [
    ...solanaReport.incomeEvents,
    ...ethereumReport.incomeEvents,
  ];

  // Calculate totals
  const shortTermGains = combinedTaxableEvents
    .filter((e) => e.holdingPeriod === "short" && e.gainLoss > 0)
    .reduce((sum, e) => sum + e.gainLoss, 0);
  const longTermGains = combinedTaxableEvents
    .filter((e) => e.holdingPeriod === "long" && e.gainLoss > 0)
    .reduce((sum, e) => sum + e.gainLoss, 0);
  const shortTermLosses = Math.abs(
    combinedTaxableEvents
      .filter((e) => e.holdingPeriod === "short" && e.gainLoss < 0)
      .reduce((sum, e) => sum + e.gainLoss, 0)
  );
  const longTermLosses = Math.abs(
    combinedTaxableEvents
      .filter((e) => e.holdingPeriod === "long" && e.gainLoss < 0)
      .reduce((sum, e) => sum + e.gainLoss, 0)
  );
  const totalIncome = combinedIncomeEvents.reduce(
    (sum, e) => sum + e.valueUsd,
    0
  );

  // Calculate net gains/losses
  const netShortTermGain = shortTermGains - shortTermLosses;
  const netLongTermGain = longTermGains - longTermLosses;
  const totalNetLoss = Math.max(0, -(netShortTermGain + netLongTermGain));

  // US Tax Law: Capital loss deduction limit is $3,000 per year (IRC Section 1211)
  // Losses can offset gains without limit, but net losses are limited to $3,000 deduction
  const MAX_CAPITAL_LOSS_DEDUCTION = 3000;
  const deductibleLosses = Math.min(totalNetLoss, MAX_CAPITAL_LOSS_DEDUCTION);
  const lossCarryover = Math.max(0, totalNetLoss - MAX_CAPITAL_LOSS_DEDUCTION);

  // Generate Form 8949 data (required for IRS reporting)
  const form8949Data = generateForm8949Data(combinedTaxableEvents);

  return {
    year,
    shortTermGains,
    longTermGains,
    shortTermLosses,
    longTermLosses,
    totalIncome,
    taxableEvents: combinedTaxableEvents,
    incomeEvents: combinedIncomeEvents,
    netShortTermGain,
    netLongTermGain,
    totalTaxableGain:
      netShortTermGain + netLongTermGain - deductibleLosses,
    deductibleLosses,
    lossCarryover,
    form8949Data,
  };
}

/**
 * Process transactions to calculate taxable events and income
 */
function processTransactionsForTax(
  transactions: Transaction[],
  taxYear: number,
  method: "FIFO" | "LIFO" | "HIFO"
): {
  taxableEvents: TaxableEvent[];
  incomeEvents: IncomeEvent[];
} {
  const taxableEvents: TaxableEvent[] = [];
  const incomeEvents: IncomeEvent[] = [];

  // Track cost basis lots per asset
  const costBasisLots: Record<string, CostBasisLot[]> = {};

  // Process transactions chronologically
  for (const tx of transactions) {
    const asset = tx.asset_symbol;
    const amount = Number(tx.amount_value);
    const valueUsd = Number(tx.value_usd);
    const pricePerUnit = tx.price_per_unit
      ? Number(tx.price_per_unit)
      : valueUsd / amount;
    const date = tx.tx_timestamp;
    const txYear = date.getFullYear();

    // Initialize asset lots if needed
    if (!costBasisLots[asset]) {
      costBasisLots[asset] = [];
    }

    const txType = tx.type.toLowerCase();

    // Handle buys - add to cost basis
    if (txType === "buy" || txType === "dca") {
      costBasisLots[asset].push({
        id: tx.id,
        date,
        amount,
        costBasis: Math.abs(valueUsd), // Buy is negative value, so we take absolute
        pricePerUnit,
      });
    }
    // Handle sells - calculate capital gains/losses
    else if (txType === "sell") {
      const proceeds = Math.abs(valueUsd); // Sale proceeds
      const sellAmount = amount;
      let remainingToSell = sellAmount;
      let totalCostBasis = 0;

      // Select lots based on method
      const selectedLots = selectLots(
        costBasisLots[asset],
        sellAmount,
        method
      );

      // Calculate cost basis from selected lots
      for (const lot of selectedLots) {
        if (remainingToSell <= 0) break;

        const amountFromLot = Math.min(remainingToSell, lot.amount);
        const costBasisFromLot =
          (lot.costBasis / lot.amount) * amountFromLot;

        totalCostBasis += costBasisFromLot;
        lot.amount -= amountFromLot;
        remainingToSell -= amountFromLot;
      }

      // Remove empty lots
      costBasisLots[asset] = costBasisLots[asset].filter((lot) => lot.amount > 0);

      // Calculate gain/loss
      const gainLoss = proceeds - totalCostBasis;

      // Determine holding period (use earliest lot date)
      // IRS Rule: Long-term if held MORE than 1 year (365 days + 1 day = 366+ days)
      const earliestLotDate =
        selectedLots.length > 0
          ? selectedLots.reduce(
              (earliest, lot) =>
                lot.date < earliest ? lot.date : earliest,
              selectedLots[0].date
            )
          : date;
      const holdingPeriodDays =
        (date.getTime() - earliestLotDate.getTime()) / (1000 * 60 * 60 * 24);
      // IRS: More than 1 year = 366+ days (accounting for leap years)
      const holdingPeriod =
        holdingPeriodDays >= 366 ? "long" : "short";

      // Only include in tax year if the sale occurred in that year
      if (txYear === taxYear) {
        taxableEvents.push({
          id: tx.id,
          date,
          asset,
          amount: sellAmount,
          proceeds,
          costBasis: totalCostBasis,
          gainLoss,
          holdingPeriod,
          chain: tx.chain || undefined,
          txHash: tx.tx_hash || undefined,
        });
      }
    }
    // Handle swaps - treat as sell of one asset and buy of another
    // IRS: Swaps are taxable events (like-kind exchange rules eliminated for crypto after 2017)
    else if (txType === "swap") {
      // Parse swap to identify both outgoing and incoming assets
      // Check notes field for swap details (format: "ETH → USDC" or "1.5 ETH → 3000 USDC")
      const swapInfo = parseSwapTransaction(tx);
      const outgoingAsset = swapInfo.outgoingAsset || asset;
      const incomingAsset = swapInfo.incomingAsset;
      const outgoingAmount = swapInfo.outgoingAmount || amount;
      const incomingAmount = swapInfo.incomingAmount;
      const incomingValueUsd = swapInfo.incomingValueUsd;

      // Initialize incoming asset lots if needed
      if (incomingAsset && !costBasisLots[incomingAsset]) {
        costBasisLots[incomingAsset] = [];
      }

      // Handle outgoing asset disposal (taxable event)
      if (costBasisLots[outgoingAsset] && costBasisLots[outgoingAsset].length > 0) {
        let remainingToSwap = outgoingAmount;
        let totalCostBasis = 0;

        const selectedLots = selectLots(
          costBasisLots[outgoingAsset],
          outgoingAmount,
          method
        );

        for (const lot of selectedLots) {
          if (remainingToSwap <= 0) break;

          const amountFromLot = Math.min(remainingToSwap, lot.amount);
          const costBasisFromLot =
            (lot.costBasis / lot.amount) * amountFromLot;

          totalCostBasis += costBasisFromLot;
          lot.amount -= amountFromLot;
          remainingToSwap -= amountFromLot;
        }

        costBasisLots[outgoingAsset] = costBasisLots[outgoingAsset].filter(
          (lot) => lot.amount > 0
        );

        // Calculate proceeds (fair market value of outgoing asset)
        const proceeds = Math.abs(valueUsd);
        const gainLoss = proceeds - totalCostBasis;

        const earliestLotDate =
          selectedLots.length > 0
            ? selectedLots.reduce(
                (earliest, lot) =>
                  lot.date < earliest ? lot.date : earliest,
                selectedLots[0].date
              )
            : date;
        const holdingPeriodDays =
          (date.getTime() - earliestLotDate.getTime()) / (1000 * 60 * 60 * 24);
        const holdingPeriod =
          holdingPeriodDays >= 366 ? "long" : "short";

        // Create taxable event for outgoing asset disposal
        if (txYear === taxYear && totalCostBasis > 0) {
          taxableEvents.push({
            id: tx.id,
            date,
            asset: outgoingAsset,
            amount: outgoingAmount,
            proceeds,
            costBasis: totalCostBasis,
            gainLoss,
            holdingPeriod,
            chain: tx.chain || undefined,
            txHash: tx.tx_hash || undefined,
          });
        }
      }

      // Handle incoming asset acquisition (adds to cost basis)
      // IRS: Incoming asset's cost basis = fair market value at time of swap
      if (incomingAsset && incomingAmount && incomingValueUsd) {
        const incomingPricePerUnit = incomingValueUsd / incomingAmount;
        costBasisLots[incomingAsset].push({
          id: tx.id,
          date,
          amount: incomingAmount,
          costBasis: Math.abs(incomingValueUsd), // Cost basis = FMV at swap
          pricePerUnit: incomingPricePerUnit,
        });
      } else if (incomingAsset && incomingAmount) {
        // Fallback: use value_usd if incoming value not parsed
        const incomingPricePerUnit = Math.abs(valueUsd) / incomingAmount;
        costBasisLots[incomingAsset].push({
          id: tx.id,
          date,
          amount: incomingAmount,
          costBasis: Math.abs(valueUsd),
          pricePerUnit: incomingPricePerUnit,
        });
      }
    }
    // Handle income events
    // IRS: Income is taxable when received at fair market value
    else if (
      txType === "stake" ||
      txType === "staking" ||
      txType === "reward" ||
      txType === "airdrop" ||
      txType === "receive" ||
      txType === "mining" ||
      txType === "yield" ||
      txType === "interest" ||
      txType === "liquidity providing"
    ) {
      // Determine income type per IRS guidance
      let incomeType: IncomeEvent["type"] = "other";
      if (txType === "stake" || txType === "staking") {
        incomeType = "staking"; // Staking rewards are ordinary income
      } else if (txType === "reward") {
        incomeType = "reward"; // General rewards
      } else if (txType === "airdrop") {
        incomeType = "airdrop"; // Airdrops are ordinary income
      } else if (txType === "mining") {
        incomeType = "mining"; // Mining income (may be subject to self-employment tax)
      } else if (
        txType === "yield" ||
        txType === "interest" ||
        txType === "liquidity providing" ||
        txType === "yield farming" ||
        txType === "farm reward"
      ) {
        incomeType = "reward"; // DeFi yield, lending interest, yield farming
      } else if (txType === "receive" && valueUsd > 0) {
        // Receives with positive value might be income (need to distinguish from transfers)
        incomeType = "other";
      }

      // Only count as income if it occurred in the tax year and has positive value
      // IRS: Income recognized when received
      if (txYear === taxYear && valueUsd > 0) {
        incomeEvents.push({
          id: tx.id,
          date,
          asset,
          amount,
          valueUsd: Math.abs(valueUsd),
          type: incomeType,
          chain: tx.chain || undefined,
          txHash: tx.tx_hash || undefined,
        });
      }

      // IRS: Income received becomes part of cost basis for future sales
      // Add received income to cost basis at fair market value
      if (
        (txType === "receive" || 
         txType === "stake" || 
         txType === "staking" || 
         txType === "reward" || 
         txType === "airdrop" ||
         txType === "mining" ||
         txType === "yield" ||
         txType === "interest") && 
        valueUsd > 0
      ) {
        costBasisLots[asset].push({
          id: tx.id,
          date,
          amount,
          costBasis: Math.abs(valueUsd), // Cost basis = FMV at time of receipt
          pricePerUnit,
        });
      }
    }
    // Handle sends - reduce cost basis if it's a disposal
    // IRS: Sends to others may be gifts (non-taxable) or payments (taxable)
    // For now, we treat sends as non-taxable transfers (gifts)
    // In production, you'd want to distinguish between:
    // - Gifts (non-taxable, but may have gift tax implications if > $17,000/year)
    // - Payments for goods/services (taxable as income to recipient, disposal for sender)
    // - Transfers between own wallets (non-taxable)
    else if (txType === "send") {
      // Sends reduce holdings but don't create taxable events
      // IRS: Gifts are not taxable events for the giver (but reduce basis)
      const sendAmount = amount;
      let remainingToSend = sendAmount;

      const selectedLots = selectLots(
        costBasisLots[asset],
        sendAmount,
        method
      );

      for (const lot of selectedLots) {
        if (remainingToSend <= 0) break;
        const amountFromLot = Math.min(remainingToSend, lot.amount);
        lot.amount -= amountFromLot;
        remainingToSend -= amountFromLot;
      }

      costBasisLots[asset] = costBasisLots[asset].filter((lot) => lot.amount > 0);
    }
    // Handle unstake - reduces staked holdings, may have rewards
    else if (txType === "unstake" || txType === "unstaking") {
      // Unstaking reduces holdings but doesn't create taxable event
      // The original stake was already a disposal (if treated as such)
      // Rewards received during staking are already counted as income
      const unstakeAmount = amount;
      let remainingToUnstake = unstakeAmount;

      const selectedLots = selectLots(
        costBasisLots[asset],
        unstakeAmount,
        method
      );

      for (const lot of selectedLots) {
        if (remainingToUnstake <= 0) break;
        const amountFromLot = Math.min(remainingToUnstake, lot.amount);
        lot.amount -= amountFromLot;
        remainingToUnstake -= amountFromLot;
      }

      costBasisLots[asset] = costBasisLots[asset].filter((lot) => lot.amount > 0);

      // If unstaking includes rewards, those should be tracked separately
      // For now, we assume rewards were already recorded as income events
    }
    // Handle bridge - cross-chain transfers (may be taxable)
    // IRS: Bridging is generally a taxable event (disposal of asset on one chain)
    else if (txType === "bridge") {
      // Bridge transactions dispose of asset on source chain
      // This creates a taxable event if there's a gain/loss
      const bridgeAmount = amount;
      let remainingToBridge = bridgeAmount;
      let totalCostBasis = 0;

      const selectedLots = selectLots(
        costBasisLots[asset],
        bridgeAmount,
        method
      );

      for (const lot of selectedLots) {
        if (remainingToBridge <= 0) break;

        const amountFromLot = Math.min(remainingToBridge, lot.amount);
        const costBasisFromLot =
          (lot.costBasis / lot.amount) * amountFromLot;

        totalCostBasis += costBasisFromLot;
        lot.amount -= amountFromLot;
        remainingToBridge -= amountFromLot;
      }

      costBasisLots[asset] = costBasisLots[asset].filter((lot) => lot.amount > 0);

      // Bridge proceeds = fair market value at time of bridge
      const proceeds = Math.abs(valueUsd);
      const gainLoss = proceeds - totalCostBasis;

      const earliestLotDate =
        selectedLots.length > 0
          ? selectedLots.reduce(
              (earliest, lot) =>
                lot.date < earliest ? lot.date : earliest,
              selectedLots[0].date
            )
          : date;
      const holdingPeriodDays =
        (date.getTime() - earliestLotDate.getTime()) / (1000 * 60 * 60 * 24);
      const holdingPeriod =
        holdingPeriodDays >= 366 ? "long" : "short";

      // Create taxable event for bridge (disposal on source chain)
      if (txYear === taxYear && totalCostBasis > 0) {
        taxableEvents.push({
          id: tx.id,
          date,
          asset,
          amount: bridgeAmount,
          proceeds,
          costBasis: totalCostBasis,
          gainLoss,
          holdingPeriod,
          chain: tx.chain || undefined,
          txHash: tx.tx_hash || undefined,
        });
      }

      // Note: Asset received on destination chain should be tracked separately
      // with cost basis = FMV at time of bridge
    }
    // Handle liquidity providing - LP token acquisition
    // IRS: Adding liquidity creates LP tokens with cost basis = value of assets provided
    else if (txType === "liquidity providing" || txType === "liquidity add") {
      // LP token acquisition - cost basis = total value of assets provided
      // The LP token itself is the asset_symbol
      const lpTokenAmount = amount;
      const totalValueProvided = Math.abs(valueUsd); // Total value of assets added to pool
      const lpTokenPrice = totalValueProvided / lpTokenAmount;

      costBasisLots[asset].push({
        id: tx.id,
        date,
        amount: lpTokenAmount,
        costBasis: totalValueProvided,
        pricePerUnit: lpTokenPrice,
      });
    }
    // Handle liquidity removal - LP token disposal
    // IRS: Removing liquidity disposes of LP tokens, may have impermanent loss
    else if (
      txType === "liquidity removal" ||
      txType === "liquidity remove" ||
      txType === "liquidity exit"
    ) {
      const lpTokenAmount = amount;
      let remainingToRemove = lpTokenAmount;
      let totalCostBasis = 0;

      const selectedLots = selectLots(
        costBasisLots[asset],
        lpTokenAmount,
        method
      );

      for (const lot of selectedLots) {
        if (remainingToRemove <= 0) break;

        const amountFromLot = Math.min(remainingToRemove, lot.amount);
        const costBasisFromLot =
          (lot.costBasis / lot.amount) * amountFromLot;

        totalCostBasis += costBasisFromLot;
        lot.amount -= amountFromLot;
        remainingToRemove -= amountFromLot;
      }

      costBasisLots[asset] = costBasisLots[asset].filter((lot) => lot.amount > 0);

      // Proceeds = fair market value of assets received from pool
      const proceeds = Math.abs(valueUsd);
      const gainLoss = proceeds - totalCostBasis;

      // Impermanent loss = difference between what you put in and what you get out
      // This is already captured in gainLoss (negative = impermanent loss)

      const earliestLotDate =
        selectedLots.length > 0
          ? selectedLots.reduce(
              (earliest, lot) =>
                lot.date < earliest ? lot.date : earliest,
              selectedLots[0].date
            )
          : date;
      const holdingPeriodDays =
        (date.getTime() - earliestLotDate.getTime()) / (1000 * 60 * 60 * 24);
      const holdingPeriod =
        holdingPeriodDays >= 366 ? "long" : "short";

      if (txYear === taxYear && totalCostBasis > 0) {
        taxableEvents.push({
          id: tx.id,
          date,
          asset,
          amount: lpTokenAmount,
          proceeds,
          costBasis: totalCostBasis,
          gainLoss,
          holdingPeriod,
          chain: tx.chain || undefined,
          txHash: tx.tx_hash || undefined,
        });
      }
    }
    // Handle borrow - not taxable but affects holdings tracking
    else if (txType === "borrow") {
      // Borrowing doesn't create taxable event
      // But borrowed assets should be tracked separately (not part of cost basis)
      // For simplicity, we don't add to cost basis here
      // In production, you might want to track borrowed vs owned separately
    }
    // Handle repay - not taxable but affects holdings tracking
    else if (txType === "repay") {
      // Repaying doesn't create taxable event
      // Reduces borrowed amount (tracked separately)
    }
    // Handle yield farming rewards - income recognition
    else if (txType === "yield farming" || txType === "farm reward") {
      // Yield farming rewards are income
      const incomeType: IncomeEvent["type"] = "reward";
      const rewardValue = Math.abs(valueUsd);

      if (txYear === taxYear && rewardValue > 0) {
        incomeEvents.push({
          id: tx.id,
          date,
          asset,
          amount,
          valueUsd: rewardValue,
          type: incomeType,
          chain: tx.chain || undefined,
          txHash: tx.tx_hash || undefined,
        });
      }

      // Rewards also add to cost basis for future sales
      if (rewardValue > 0) {
        costBasisLots[asset].push({
          id: tx.id,
          date,
          amount,
          costBasis: rewardValue,
          pricePerUnit,
        });
      }
    }
  }

  return { taxableEvents, incomeEvents };
}

/**
 * Select lots based on the accounting method (FIFO, LIFO, or HIFO)
 */
function selectLots(
  lots: CostBasisLot[],
  amount: number,
  method: "FIFO" | "LIFO" | "HIFO"
): CostBasisLot[] {
  if (lots.length === 0) return [];

  let sortedLots: CostBasisLot[];

  switch (method) {
    case "FIFO":
      // First In, First Out - oldest first
      sortedLots = [...lots].sort(
        (a, b) => a.date.getTime() - b.date.getTime()
      );
      break;
    case "LIFO":
      // Last In, First Out - newest first
      sortedLots = [...lots].sort(
        (a, b) => b.date.getTime() - a.date.getTime()
      );
      break;
    case "HIFO":
      // Highest In, First Out - highest cost basis first
      sortedLots = [...lots].sort(
        (a, b) => b.pricePerUnit - a.pricePerUnit
      );
      break;
    default:
      sortedLots = [...lots];
  }

  // Select lots until we have enough
  const selected: CostBasisLot[] = [];
  let remaining = amount;

  for (const lot of sortedLots) {
    if (remaining <= 0) break;
    selected.push(lot);
    remaining -= lot.amount;
  }

  return selected;
}

/**
 * Get tax report summary for display
 */
export function formatTaxReport(report: TaxReport) {
  return {
    shortTermGains: formatCurrency(report.shortTermGains),
    longTermGains: formatCurrency(report.longTermGains),
    shortTermLosses: formatCurrency(report.shortTermLosses),
    longTermLosses: formatCurrency(report.longTermLosses),
    totalIncome: formatCurrency(report.totalIncome),
    netShortTermGain: formatCurrency(report.netShortTermGain),
    netLongTermGain: formatCurrency(report.netLongTermGain),
    totalTaxableGain: formatCurrency(report.totalTaxableGain),
    taxableEvents: report.taxableEvents.length,
    incomeEvents: report.incomeEvents.length,
  };
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Parse swap transaction to identify both assets
 * Attempts to parse from notes field or asset_symbol
 */
function parseSwapTransaction(tx: Transaction): {
  outgoingAsset: string | null;
  incomingAsset: string | null;
  outgoingAmount: number | null;
  incomingAmount: number | null;
  incomingValueUsd: number | null;
} {
  const notes = tx.notes || "";
  const assetSymbol = tx.asset_symbol;

  // Try to parse from notes (format: "ETH → USDC" or "1.5 ETH → 3000 USDC")
  const swapPattern = /([\d.]+)\s*(\w+)\s*(?:→|->|-)\s*([\d.]+)\s*(\w+)/i;
  const match = notes.match(swapPattern);

  if (match) {
    return {
      outgoingAsset: match[2].toUpperCase(),
      incomingAsset: match[4].toUpperCase(),
      outgoingAmount: parseFloat(match[1]),
      incomingAmount: parseFloat(match[3]),
      incomingValueUsd: null, // Would need to calculate from amount and price
    };
  }

  // Try to parse from asset_symbol (format: "ETH/USDC" or "ETH→USDC")
  const assetPattern = /(\w+)\s*(?:\/|→|->|-)\s*(\w+)/i;
  const assetMatch = assetSymbol.match(assetPattern);

  if (assetMatch) {
    return {
      outgoingAsset: assetMatch[1].toUpperCase(),
      incomingAsset: assetMatch[2].toUpperCase(),
      outgoingAmount: Number(tx.amount_value),
      incomingAmount: null,
      incomingValueUsd: null,
    };
  }

  // Fallback: use current asset as outgoing, no incoming identified
  return {
    outgoingAsset: assetSymbol,
    incomingAsset: null,
    outgoingAmount: Number(tx.amount_value),
    incomingAmount: null,
    incomingValueUsd: null,
  };
}

/**
 * Generate Form 8949 data for IRS reporting
 * Form 8949 is required for reporting capital gains and losses
 */
function generateForm8949Data(
  taxableEvents: TaxableEvent[]
): Form8949Entry[] {
  return taxableEvents.map((event) => {
    // For Form 8949, we need to track acquisition date
    // Since we're using FIFO, we use the event date as sale date
    // and would need to track acquisition date from lots (simplified here)
    return {
      description: `${event.amount} ${event.asset}`,
      dateAcquired: event.date, // In production, get from cost basis lot
      dateSold: event.date,
      proceeds: event.proceeds,
      costBasis: event.costBasis,
      code: "", // Adjustment code if needed (e.g., "W" for wash sale)
      gainLoss: event.gainLoss,
      holdingPeriod: event.holdingPeriod,
    };
  });
}
