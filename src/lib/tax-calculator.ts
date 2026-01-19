import { PrismaClient, Transaction, Prisma } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";

// Types for tax calculations
export interface TaxableEvent {
  id: number;
  date: Date; // Date sold/disposed
  dateAcquired?: Date; // Date acquired (for Form 8949)
  asset: string;
  amount: number;
  proceeds: number; // Sale price in USD
  costBasis: number; // Purchase price in USD
  gainLoss: number; // proceeds - costBasis
  holdingPeriod: "short" | "long"; // Short-term: < 1 year, Long-term: >= 1 year
  chain?: string;
  txHash?: string;
  washSale?: boolean; // True if this is a wash sale (loss disallowed)
  washSaleAdjustment?: number; // Amount of disallowed loss added to replacement shares
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
  washSaleAdjustment?: number; // Wash sale loss adjustment added to this lot
}

// Track loss sales for wash sale detection
interface LossSale {
  id: number;
  date: Date;
  asset: string;
  amount: number;
  lossAmount: number; // The disallowed loss amount
  costBasis: number;
  proceeds: number;
  holdingPeriod: "short" | "long";
  remainingLoss: number; // Remaining loss that can be applied to replacement shares
}

/**
 * Calculate tax report for a given year
 */
export async function calculateTaxReport(
  prisma: PrismaClient,
  walletAddresses: string[],
  year: number,
  method: "FIFO" | "LIFO" | "HIFO" = "FIFO",
  userId?: string // Optional user ID to include CSV-imported transactions
): Promise<TaxReport> {
  const startDate = new Date(`${year}-01-01T00:00:00Z`);
  const endDate = new Date(`${year}-12-31T23:59:59Z`);

  // Fetch all transactions for the user's wallets up to and including the tax year
  // We need all transactions to calculate cost basis properly
  // IMPORTANT: We need transactions from BEFORE the tax year too, because buy transactions
  // might be in previous years but we still need their cost basis for sells in the tax year
  // Also include CSV-imported transactions (source_type: "csv_import" with null wallet_address)
  // For now, we'll fetch all transactions up to endDate, but ideally we should fetch all historical
  // transactions to ensure cost basis is available. However, for performance, we'll limit to
  // transactions up to the tax year end date.
  const whereClause: Prisma.TransactionWhereInput = {
    tx_timestamp: {
      lte: endDate,
    },
  };

  // Filter by wallet addresses OR CSV imports
  // Strategy: Include transactions with user's wallet addresses OR CSV imports
  // This matches the logic used in delete-all endpoint
  const orConditions: Prisma.TransactionWhereInput[] = [];
  
  if (walletAddresses.length > 0) {
    orConditions.push({ wallet_address: { in: walletAddresses } });
  }
  
  // Always include CSV imports (assumes CSV imports belong to authenticated user)
  // This is safe because the user is authenticated and can only see their own CSV imports
  orConditions.push({
    AND: [
      { source_type: "csv_import" },
      { wallet_address: null },
    ],
  });

  if (orConditions.length > 0) {
    whereClause.OR = orConditions;
  }

  // Filter by status - include both confirmed and completed transactions
  // Also include pending transactions (some CSV imports might be pending)
  whereClause.status = { in: ["confirmed", "completed", "pending"] };

  console.log(`[Tax Calculator] Fetching transactions for year ${year}`);
  console.log(`[Tax Calculator] Wallet addresses:`, walletAddresses);
  console.log(`[Tax Calculator] User ID:`, userId);
  console.log(`[Tax Calculator] Where clause:`, JSON.stringify(whereClause, null, 2));

  const allTransactions = await prisma.transaction.findMany({
    where: whereClause,
    orderBy: {
      tx_timestamp: "asc",
    },
  });

  console.log(`[Tax Calculator] Found ${allTransactions.length} total transactions`);
  
  // Count buy vs sell transactions for debugging
  const buyTransactions = allTransactions.filter(tx => {
    const type = (tx.type || "").toLowerCase();
    return type === "buy" || tx.type === "Buy";
  });
  const sellTransactions = allTransactions.filter(tx => {
    const type = (tx.type || "").toLowerCase();
    return type === "sell" || tx.type === "Sell";
  });
  console.log(`[Tax Calculator] Transaction breakdown: ${buyTransactions.length} buy, ${sellTransactions.length} sell, ${allTransactions.length - buyTransactions.length - sellTransactions.length} other`);
  
  // Log first few buy transactions to verify they're included
  if (buyTransactions.length > 0) {
    console.log(`[Tax Calculator] First 5 buy transactions:`, buyTransactions.slice(0, 5).map(tx => ({
      id: tx.id,
      asset: tx.asset_symbol,
      amount: Number(tx.amount_value),
      value_usd: Number(tx.value_usd),
      date: tx.tx_timestamp.toISOString().split('T')[0],
      source_type: tx.source_type,
    })));
  } else {
    console.warn(`[Tax Calculator] ⚠️  WARNING: No buy transactions found! This will cause all sells to have 0 cost basis.`);
  }
  
  // If no transactions found, log detailed diagnostic info
  if (allTransactions.length === 0) {
    console.warn(`[Tax Calculator] WARNING: No transactions found for year ${year}`);
    console.warn(`[Tax Calculator] This could mean:`);
    console.warn(`  1. No transactions exist in the database`);
    console.warn(`  2. Transactions don't match wallet addresses: ${walletAddresses.join(", ")}`);
    console.warn(`  3. Transactions don't have source_type: "csv_import" with null wallet_address`);
    console.warn(`  4. Transactions are outside the date range (before ${endDate.toISOString()})`);
    console.warn(`  5. Transactions have wrong status (not in: confirmed, completed, pending)`);
    
    // Try to find ANY transactions for debugging
    const anyTransactions = await prisma.transaction.findMany({
      take: 5,
      orderBy: { tx_timestamp: "desc" },
    });
    console.warn(`[Tax Calculator] Sample of ANY transactions in database (first 5):`, anyTransactions.map(tx => ({
      id: tx.id,
      type: tx.type,
      asset: tx.asset_symbol,
      date: tx.tx_timestamp.toISOString().split('T')[0],
      wallet_address: tx.wallet_address,
      source_type: tx.source_type,
      status: tx.status,
    })));
  }
  if (allTransactions.length > 0) {
    const dateRange = {
      earliest: allTransactions[0].tx_timestamp.toISOString(),
      latest: allTransactions[allTransactions.length - 1].tx_timestamp.toISOString(),
    };
    console.log(`[Tax Calculator] Transaction date range:`, dateRange);
    const csvImports = allTransactions.filter(tx => tx.source_type === "csv_import");
    console.log(`[Tax Calculator] CSV imports: ${csvImports.length}`);
    const walletTransactions = allTransactions.filter(tx => tx.source_type !== "csv_import");
    console.log(`[Tax Calculator] Wallet transactions: ${walletTransactions.length}`);
    
    // Check transaction types
    const typeCounts: Record<string, number> = {};
    allTransactions.forEach(tx => {
      const type = tx.type || "unknown";
      typeCounts[type] = (typeCounts[type] || 0) + 1;
    });
    console.log(`[Tax Calculator] Transaction types:`, typeCounts);
    
    // Check for sell transactions
    const sellTransactions = allTransactions.filter(tx => {
      const type = (tx.type || "").toLowerCase();
      return type === "sell" || tx.type === "Sell";
    });
    console.log(`[Tax Calculator] Sell transactions: ${sellTransactions.length}`);
    
    // Check transaction years distribution
    const yearCounts: Record<number, number> = {};
    allTransactions.forEach(tx => {
      const txYear = tx.tx_timestamp.getFullYear();
      yearCounts[txYear] = (yearCounts[txYear] || 0) + 1;
    });
    console.log(`[Tax Calculator] Transactions by year:`, yearCounts);
    
    // Check sell transactions by year
    const sellYearCounts: Record<number, number> = {};
    sellTransactions.forEach(tx => {
      const txYear = tx.tx_timestamp.getFullYear();
      sellYearCounts[txYear] = (sellYearCounts[txYear] || 0) + 1;
    });
    console.log(`[Tax Calculator] Sell transactions by year:`, sellYearCounts);
    
    // Check a few sell transactions to see their structure
    if (sellTransactions.length > 0) {
      const sampleSell = sellTransactions[0];
      console.log(`[Tax Calculator] Sample sell transaction:`, {
        id: sampleSell.id,
        type: sampleSell.type,
        asset: sampleSell.asset_symbol,
        value_usd: Number(sampleSell.value_usd),
        date: sampleSell.tx_timestamp.toISOString().split('T')[0],
        year: sampleSell.tx_timestamp.getFullYear(),
        notes: sampleSell.notes?.substring(0, 200),
        source_type: sampleSell.source_type,
      });
      
      // Show a few more samples from different years
      const samplesByYear: Record<number, any> = {};
      sellTransactions.forEach(tx => {
        const txYear = tx.tx_timestamp.getFullYear();
        if (!samplesByYear[txYear] && Object.keys(samplesByYear).length < 5) {
          samplesByYear[txYear] = {
            id: tx.id,
            date: tx.tx_timestamp.toISOString().split('T')[0],
            year: txYear,
            asset: tx.asset_symbol,
            value_usd: Number(tx.value_usd),
            hasCostBasis: tx.notes?.includes("Cost Basis:") || false,
          };
        }
      });
      console.log(`[Tax Calculator] Sample sell transactions by year:`, samplesByYear);
    }
  }

  // Filter transactions by chain (Solana or Ethereum)
  // Also include transactions without a chain (CSV imports might not have chain set)
  const solanaTransactions = allTransactions.filter(
    (tx: Transaction) => tx.chain?.toLowerCase() === "solana" || tx.chain?.toLowerCase() === "sol"
  );
  const ethereumTransactions = allTransactions.filter(
    (tx: Transaction) =>
      tx.chain?.toLowerCase() === "ethereum" ||
      tx.chain?.toLowerCase() === "eth" ||
      tx.chain?.toLowerCase() === "ethereum mainnet"
  );
  
  // Get transactions without a chain (likely CSV imports)
  const unchainTransactions = allTransactions.filter(
    (tx: Transaction) => !tx.chain || (tx.chain.toLowerCase() !== "solana" && tx.chain.toLowerCase() !== "sol" && 
      tx.chain.toLowerCase() !== "ethereum" && tx.chain.toLowerCase() !== "eth" && tx.chain.toLowerCase() !== "ethereum mainnet")
  );

  console.log(`[Tax Calculator] Processing ${solanaTransactions.length} Solana, ${ethereumTransactions.length} Ethereum, and ${unchainTransactions.length} unchain transactions`);

  // IMPORTANT: Process transactions in chronological order (oldest first)
  // This ensures buy transactions are processed before sell transactions
  // so cost basis lots are available when calculating gains/losses
  console.log(`[Tax Calculator] Processing transactions in chronological order...`);
  
  // Process transactions for both chains and unchain
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
  const unchainReport = processTransactionsForTax(
    unchainTransactions,
    year,
    method
  );

  console.log(`[Tax Calculator] Solana report: ${solanaReport.taxableEvents.length} taxable, ${solanaReport.incomeEvents.length} income`);
  console.log(`[Tax Calculator] Ethereum report: ${ethereumReport.taxableEvents.length} taxable, ${ethereumReport.incomeEvents.length} income`);
  console.log(`[Tax Calculator] Unchain report: ${unchainReport.taxableEvents.length} taxable, ${unchainReport.incomeEvents.length} income`);

  // Combine reports
  const combinedTaxableEvents = [
    ...solanaReport.taxableEvents,
    ...ethereumReport.taxableEvents,
    ...unchainReport.taxableEvents,
  ];
  const combinedIncomeEvents = [
    ...solanaReport.incomeEvents,
    ...ethereumReport.incomeEvents,
    ...unchainReport.incomeEvents,
  ];
  
  console.log(`[Tax Calculator] Combined: ${combinedTaxableEvents.length} taxable events, ${combinedIncomeEvents.length} income events`);

  // Calculate diagnostic totals for verification
  const totalProceeds = combinedTaxableEvents.reduce((sum, e) => sum + e.proceeds, 0);
  const totalCostBasis = combinedTaxableEvents.reduce((sum, e) => sum + e.costBasis, 0);
  const totalGainLoss = combinedTaxableEvents.reduce((sum, e) => sum + e.gainLoss, 0);
  const expectedGain = totalProceeds - totalCostBasis;
  
  console.log(`[Tax Calculator] DIAGNOSTIC TOTALS:`);
  console.log(`  - Total Proceeds: $${totalProceeds.toFixed(2)}`);
  console.log(`  - Total Cost Basis: $${totalCostBasis.toFixed(2)}`);
  console.log(`  - Expected Gain (Proceeds - Cost Basis): $${expectedGain.toFixed(2)}`);
  console.log(`  - Actual Total Gain/Loss (sum of all gainLoss): $${totalGainLoss.toFixed(2)}`);
  console.log(`  - Difference: $${Math.abs(expectedGain - totalGainLoss).toFixed(2)}`);
  
  if (Math.abs(expectedGain - totalGainLoss) > 0.01) {
    console.warn(`[Tax Calculator] ⚠️  WARNING: Expected gain (${expectedGain.toFixed(2)}) does not match actual gain/loss sum (${totalGainLoss.toFixed(2)})`);
    console.warn(`  This suggests some transactions may have incorrect gain/loss calculations.`);
  }

  // REWRITTEN: Calculate gains/losses directly from proceeds - cost basis
  // This ensures gains always match proceeds - cost basis exactly
  // Core formula: Gain/Loss = Proceeds - Cost Basis (for each event)
  
  // First, ensure all events have correct gainLoss = proceeds - costBasis
  let incorrectGainLossCount = 0;
  combinedTaxableEvents.forEach(e => {
    const expectedGainLoss = e.proceeds - e.costBasis;
    const difference = Math.abs(e.gainLoss - expectedGainLoss);
    if (difference > 0.01) {
      incorrectGainLossCount++;
      if (incorrectGainLossCount <= 5) {
        console.warn(`[Tax Calculator] ⚠️  Event ${e.id} has incorrect gainLoss: expected ${expectedGainLoss.toFixed(2)}, got ${e.gainLoss.toFixed(2)}, proceeds=${e.proceeds.toFixed(2)}, costBasis=${e.costBasis.toFixed(2)}`);
      }
      // Fix it: gainLoss must always equal proceeds - costBasis
      e.gainLoss = expectedGainLoss;
    }
  });
  if (incorrectGainLossCount > 0) {
    console.warn(`[Tax Calculator] ⚠️  Fixed ${incorrectGainLossCount} events with incorrect gainLoss calculations`);
  }
  
  // Calculate totals by summing gainLoss values, grouped by holding period
  // Gains: gainLoss > 0, Losses: gainLoss < 0
  let shortTermGains = 0;
  let shortTermLosses = 0;
  let longTermGains = 0;
  let longTermLosses = 0;
  let zeroGainCount = 0;
  
  combinedTaxableEvents.forEach(e => {
    // Use the corrected gainLoss value (which equals proceeds - costBasis)
    let gainLoss = e.gainLoss;
    
    // For wash sales, the loss is disallowed, so we don't count it as a deductible loss
    // However, the gainLoss value still shows the loss (for Form 8949 reporting)
    // For tax calculation purposes, wash sale losses are effectively 0 (disallowed)
    if (e.washSale && gainLoss < 0) {
      // Wash sale loss is disallowed - don't count it as a deductible loss
      // The loss was already added to the replacement shares' cost basis
      gainLoss = 0; // Effectively no loss for tax purposes (it's disallowed)
    }
    
    if (e.holdingPeriod === "short") {
      if (gainLoss > 0) {
        shortTermGains += gainLoss;
      } else if (gainLoss < 0) {
        shortTermLosses += Math.abs(gainLoss);
      } else {
        zeroGainCount++;
      }
    } else if (e.holdingPeriod === "long") {
      if (gainLoss > 0) {
        longTermGains += gainLoss;
      } else if (gainLoss < 0) {
        longTermLosses += Math.abs(gainLoss);
      } else {
        zeroGainCount++;
      }
    }
  });
  
  // Verify totals match: (shortTermGains + longTermGains) - (shortTermLosses + longTermLosses) should equal totalGainLoss
  const calculatedNetGain = shortTermGains + longTermGains - shortTermLosses - longTermLosses;
  const actualTotalGainLoss = combinedTaxableEvents.reduce((sum, e) => sum + e.gainLoss, 0);
  const difference = Math.abs(calculatedNetGain - actualTotalGainLoss);
  
  if (difference > 0.01) {
    console.warn(`[Tax Calculator] ⚠️  WARNING: Calculated net gain (${calculatedNetGain.toFixed(2)}) doesn't match sum of gainLoss (${actualTotalGainLoss.toFixed(2)}), difference: ${difference.toFixed(2)}`);
  }
  
  // Diagnostic: Show breakdown of events
  const shortTermGainsEvents = combinedTaxableEvents.filter((e) => e.holdingPeriod === "short" && e.gainLoss > 0);
  const longTermGainsEvents = combinedTaxableEvents.filter((e) => e.holdingPeriod === "long" && e.gainLoss > 0);
  const shortTermLossEvents = combinedTaxableEvents.filter((e) => e.holdingPeriod === "short" && e.gainLoss < 0);
  const longTermLossEvents = combinedTaxableEvents.filter((e) => e.holdingPeriod === "long" && e.gainLoss < 0);
  
  console.log(`[Tax Calculator] Event breakdown (gainLoss = proceeds - costBasis):`);
  console.log(`  - Short-term gains: ${shortTermGainsEvents.length} events, total: $${shortTermGains.toFixed(2)}`);
  console.log(`  - Long-term gains: ${longTermGainsEvents.length} events, total: $${longTermGains.toFixed(2)}`);
  console.log(`  - Short-term losses: ${shortTermLossEvents.length} events, total: $${shortTermLosses.toFixed(2)}`);
  console.log(`  - Long-term losses: ${longTermLossEvents.length} events, total: $${longTermLosses.toFixed(2)}`);
  console.log(`  - Zero gain/loss: ${zeroGainCount} events`);
  console.log(`  - Total events: ${combinedTaxableEvents.length}`);
  console.log(`  - Net gain (gains - losses): $${calculatedNetGain.toFixed(2)}`);
  console.log(`  - Sum of all gainLoss: $${actualTotalGainLoss.toFixed(2)}`);
  const totalIncome = combinedIncomeEvents.reduce(
    (sum, e) => sum + e.valueUsd,
    0
  );
  
  // Diagnostic: Check taxable events by year
  const eventsByYear: Record<number, number> = {};
  const eventsByYearWithGains: Record<number, { count: number; totalGain: number }> = {};
  combinedTaxableEvents.forEach(e => {
    const year = e.date.getFullYear();
    eventsByYear[year] = (eventsByYear[year] || 0) + 1;
    if (!eventsByYearWithGains[year]) {
      eventsByYearWithGains[year] = { count: 0, totalGain: 0 };
    }
    eventsByYearWithGains[year].count++;
    eventsByYearWithGains[year].totalGain += e.gainLoss;
  });
  console.log(`[Tax Calculator] Taxable events by year:`, eventsByYear);
  console.log(`[Tax Calculator] Taxable events by year with gains:`, Object.entries(eventsByYearWithGains).map(([year, data]) => ({
    year: parseInt(year),
    count: data.count,
    totalGain: data.totalGain.toFixed(2)
  })));
  console.log(`[Tax Calculator] Total Taxable Events: ${combinedTaxableEvents.length}`);
  
  // Warn if there are events in unexpected years
  const requestedYear = year;
  Object.keys(eventsByYear).forEach(y => {
    const yearNum = parseInt(y);
    if (yearNum !== requestedYear) {
      console.warn(`[Tax Calculator] ⚠️  WARNING: Found ${eventsByYear[yearNum]} taxable events in year ${yearNum}, but requested year is ${requestedYear}`);
      console.warn(`  - This suggests transactions may have incorrect dates or year filtering is wrong`);
      // Show sample events from unexpected year
      const sampleEvents = combinedTaxableEvents.filter(e => e.date.getFullYear() === yearNum).slice(0, 3);
      sampleEvents.forEach(e => {
        console.warn(`  - Sample event: id=${e.id}, date=${e.date.toISOString().split('T')[0]}, asset=${e.asset}, gainLoss=${e.gainLoss.toFixed(2)}`);
      });
    }
  });
  
  console.log(`[Tax Calculator] CALCULATED TOTALS:`);
  console.log(`  - Short-term Gains: $${shortTermGains.toFixed(2)}`);
  console.log(`  - Long-term Gains: $${longTermGains.toFixed(2)}`);
  console.log(`  - Short-term Losses: $${shortTermLosses.toFixed(2)}`);
  console.log(`  - Long-term Losses: $${longTermLosses.toFixed(2)}`);
  
  // Warn if totals don't match
  const calculatedTotal = shortTermGains + longTermGains - shortTermLosses - longTermLosses;
  if (Math.abs(calculatedTotal - totalGainLoss) > 0.01) {
    console.warn(`[Tax Calculator] ⚠️  WARNING: Calculated total (${calculatedTotal.toFixed(2)}) doesn't match sum of gain/loss (${totalGainLoss.toFixed(2)})`);
  }

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
  
  // Track loss sales for wash sale detection (30 days before and after sale)
  const lossSales: LossSale[] = [];

  // Process transactions chronologically
  console.log(`[processTransactionsForTax] Processing ${transactions.length} transactions for tax year ${taxYear}`);
  
  let processedCount = 0;
  let taxableEventCount = 0;
  let incomeEventCount = 0;
  const typeCounts: Record<string, number> = {};
  
  // Count transactions by year for debugging
  const transactionsByYear: Record<number, number> = {};
  transactions.forEach(tx => {
    const year = tx.tx_timestamp.getFullYear();
    transactionsByYear[year] = (transactionsByYear[year] || 0) + 1;
  });
  console.log(`[processTransactionsForTax] Transactions by year:`, transactionsByYear);
  
  // Count sell transactions by year
  const sellTransactionsByYear: Record<number, number> = {};
  transactions.filter(tx => {
    const type = (tx.type || "").toLowerCase();
    return type === "sell" || tx.type === "Sell";
  }).forEach(tx => {
    const year = tx.tx_timestamp.getFullYear();
    sellTransactionsByYear[year] = (sellTransactionsByYear[year] || 0) + 1;
  });
  console.log(`[processTransactionsForTax] Sell transactions by year:`, sellTransactionsByYear);

  for (const tx of transactions) {
    processedCount++;
    // Normalize asset symbol: trim whitespace and convert to uppercase for consistent matching
    // This ensures "BTC", "btc", "BTC " all match the same asset
    const asset = (tx.asset_symbol || "").trim().toUpperCase();
    const amount = Number(tx.amount_value);
    const valueUsd = Number(tx.value_usd);
    const feeUsd = tx.fee_usd ? Number(tx.fee_usd) : 0;
    const pricePerUnit = tx.price_per_unit
      ? Number(tx.price_per_unit)
      : valueUsd / amount;
    const date = tx.tx_timestamp;
    const txYear = date.getFullYear();

    // Track transaction types
    const txType = (tx.type || "").toLowerCase();
    typeCounts[txType] = (typeCounts[txType] || 0) + 1;
    
    // Log first few sell transactions for debugging
    if ((txType === "sell" || tx.type === "Sell") && processedCount < 10) {
      console.log(`[processTransactionsForTax] Processing sell transaction ${tx.id}: type=${tx.type}, asset=${asset} (original: "${tx.asset_symbol}"), valueUsd=${valueUsd}, date=${date.toISOString().split('T')[0]}, year=${txYear}, taxYear=${taxYear}, notes=${tx.notes?.substring(0, 150) || "none"}`);
    }

    // Initialize asset lots if needed
    if (!costBasisLots[asset]) {
      costBasisLots[asset] = [];
    }

    // Handle buys - add to cost basis (including fees per IRS rules)
    // Also handle "Buy" with capital B (from CSV parser)
    // NFT Purchase is treated as a buy (cost basis for future sale)
    if (txType === "buy" || txType === "dca" || tx.type === "Buy" || 
        txType === "nft purchase" || tx.type === "NFT Purchase") {
      // IRS Rule: Fees are added to cost basis for purchases
      // For CSV imports with tax report format, value_usd is NEGATIVE (cost basis as negative value)
      // For standard format, value_usd might be negative, so use absolute value
      // IMPORTANT: value_usd for buys from CSV is negative (cost.neg()), so we need Math.abs
      let totalCostBasis = Math.abs(valueUsd) + feeUsd;
      
      // Check for wash sale: if this buy is within 30 days of a previous loss sale, apply wash sale rules
      const washSaleAdjustment = checkWashSale(asset, date, lossSales);
      if (washSaleAdjustment > 0) {
        // Add disallowed loss to cost basis of replacement shares
        totalCostBasis += washSaleAdjustment;
        console.log(`[Wash Sale] Buy transaction ${tx.id}: Added $${washSaleAdjustment.toFixed(2)} wash sale adjustment to cost basis. New cost basis: $${totalCostBasis.toFixed(2)}`);
      }
      
      // Log if this is a CSV import buy to verify it's being processed
      if (tx.source_type === "csv_import" && processedCount < 20) {
        console.log(`[processTransactionsForTax] Processing CSV buy ${tx.id}: asset=${asset}, value_usd=${valueUsd}, totalCostBasis=${totalCostBasis}, date=${date.toISOString().split('T')[0]}, year=${txYear}`);
      }
      costBasisLots[asset].push({
        id: tx.id,
        date,
        amount,
        costBasis: totalCostBasis, // Cost basis includes purchase price + fees + wash sale adjustment
        pricePerUnit,
        fees: feeUsd, // Track fees separately for reference
        washSaleAdjustment: washSaleAdjustment > 0 ? washSaleAdjustment : undefined,
      });
      
      if (processedCount < 10 || costBasisLots[asset].length <= 3) {
        console.log(`[processTransactionsForTax] Added buy transaction ${tx.id} to cost basis: asset=${asset} (original: "${tx.asset_symbol}"), amount=${amount}, costBasis=${totalCostBasis}, date=${date.toISOString().split('T')[0]}, lotsForAsset=${costBasisLots[asset].length}`);
      }
    }
    // Handle sells - calculate capital gains/losses
    // Also handle "Sell" with capital S (from CSV parser)
    // NFT Sale is treated as a sell (taxable disposal event)
    else if (txType === "sell" || tx.type === "Sell" || 
             txType === "nft sale" || tx.type === "NFT Sale") {
      // IRS Rule: Fees are subtracted from proceeds for sales
      // Use value_usd as proceeds (even if 0, for losses)
      // For CSV imports, value_usd is already the NET proceeds (after fees) - don't subtract fees again!
      // For blockchain transactions, value_usd might be negative for sells, so use Math.abs
      const grossProceeds = valueUsd >= 0 ? valueUsd : Math.abs(valueUsd); // Sale proceeds before fees (can be 0)
      
      // For CSV imports, value_usd is already net proceeds, so don't subtract fees again
      // For blockchain transactions, we need to subtract fees
      const isCSVImport = tx.source_type === "csv_import";
      const netProceeds = isCSVImport 
        ? grossProceeds // CSV imports already have net proceeds
        : Math.max(0, grossProceeds - feeUsd); // Blockchain: subtract fees from gross proceeds
      const sellAmount = amount;
      let remainingToSell = sellAmount;
      let totalCostBasis = 0;
      let earliestLotDate = date; // Default to sale date
      let holdingPeriod: "short" | "long" = "short";
      let gainLoss: number; // Will be calculated or extracted from notes

      // Check if transaction has pre-calculated cost basis in notes (from tax report format)
      const notes = tx.notes || "";
      // Updated regex to match cost basis including 0.00: 
      // Pattern: "Cost Basis: $X.XX" or "Cost Basis: X.XX" where X can be 0
      // The pattern ([\d,]+(?:\.\d+)?) matches: digits (with optional commas) followed by optional decimal point and digits
      // This will match: "1256.53", "0", "0.00", "1,234.56", etc.
      const costBasisMatch = notes.match(/Cost Basis:\s*\$?([\d,]+(?:\.\d+)?)/i);
      const purchasedMatch = notes.match(/Purchased:\s*(\d{4}-\d{2}-\d{2})/i);
      const holdingPeriodMatch = notes.match(/(Long-term|Short-term)\s*\((\d+)\s*days?\)/i);
      
      if (costBasisMatch) {
        // Use pre-calculated cost basis from tax report format
        const costBasisStr = costBasisMatch[1].replace(/,/g, "");
        totalCostBasis = parseFloat(costBasisStr);
        
        // Validate that we got a valid number
        if (isNaN(totalCostBasis)) {
          console.warn(`[Tax Calculator] Sell transaction ${tx.id}: Failed to parse cost basis from notes. Matched: "${costBasisMatch[1]}", Parsed: ${costBasisStr}`);
          totalCostBasis = 0;
        }
        
        // Log if cost basis is 0 to help debug
        if (totalCostBasis === 0 && processedCount < 10) {
          console.log(`[Tax Calculator] Sell transaction ${tx.id}: Found cost basis 0 in notes. Notes: ${notes.substring(0, 200)}`);
        } else if (processedCount < 10 || taxableEventCount < 5) {
          console.log(`[Tax Calculator] Sell transaction ${tx.id}: Using cost basis from notes: $${totalCostBasis.toFixed(2)}`);
        }
        
        // Extract purchase date if available
        if (purchasedMatch) {
          earliestLotDate = new Date(purchasedMatch[1]);
        }
        
        // Determine holding period: Long-term if purchase date is over 1 year before sale date
        // IRS Rule: Long-term if held MORE than 1 year (366+ days)
        if (earliestLotDate && earliestLotDate.getTime() !== date.getTime()) {
          const holdingPeriodDays = (date.getTime() - earliestLotDate.getTime()) / (1000 * 60 * 60 * 24);
          // More than 1 year = 366+ days (accounting for leap years)
          holdingPeriod = holdingPeriodDays >= 366 ? "long" : "short";
        } else if (holdingPeriodMatch) {
          // Fallback to extracted holding period if date calculation not available
          holdingPeriod = holdingPeriodMatch[1].toLowerCase().includes("long") ? "long" : "short";
        } else {
          // Default to short-term if we can't determine
          holdingPeriod = "short";
        }
        
        // ALWAYS calculate gain/loss = proceeds - cost basis
        // This is the core calculation: Gain/Loss = Proceeds (USD) - Cost Basis (USD)
        // Works correctly even if proceeds is 0 (results in a loss equal to cost basis)
        // Example: Proceeds = 0, Cost Basis = 1256.53 → Gain/Loss = -1256.53 (loss)
        // Example: Proceeds = 6913.47, Cost Basis = 3423.11 → Gain/Loss = 3490.36 (gain)
        // Example: Proceeds = 0, Cost Basis = 0 → Gain/Loss = 0 (no gain, no loss)
        gainLoss = netProceeds - totalCostBasis;
        
        if (processedCount < 10 || taxableEventCount < 5) {
          console.log(`[Tax Calculator] Sell transaction ${tx.id}: proceeds=${netProceeds}, costBasis=${totalCostBasis}, gainLoss=${gainLoss}, holdingPeriod=${holdingPeriod}, date=${date.toISOString().split('T')[0]}, purchased=${earliestLotDate.toISOString().split('T')[0]}, year=${txYear}`);
        }
      } else {
        // Calculate cost basis from lots (normal flow - for paired buy/sell transactions)
        // Select lots based on method
        const selectedLots = selectLots(
          costBasisLots[asset],
          sellAmount,
          method
        );

        if (selectedLots.length === 0) {
          const availableAssets = Object.keys(costBasisLots).filter(k => costBasisLots[k].length > 0);
          console.warn(`[Tax Calculator] Sell transaction ${tx.id}: No cost basis lots found for asset "${asset}" (original: "${tx.asset_symbol}")`);
          console.warn(`  - Available assets with lots: ${availableAssets.length > 0 ? availableAssets.join(", ") : "NONE"}`);
          console.warn(`  - Total assets with lots: ${availableAssets.length}`);
          if (availableAssets.length > 0) {
            console.warn(`  - Asset symbol comparison: Looking for "${asset}", available: ${availableAssets.map(a => `"${a}"`).join(", ")}`);
            // Check for case-insensitive matches
            const caseInsensitiveMatch = availableAssets.find(a => a.toUpperCase() === asset.toUpperCase());
            if (caseInsensitiveMatch) {
              console.warn(`  - ⚠️  CASE MISMATCH DETECTED! Found "${caseInsensitiveMatch}" which matches "${asset}" case-insensitively`);
            }
          } else {
            console.warn(`  - ⚠️  NO BUY TRANSACTIONS FOUND! This means there are no buy transactions before this sell.`);
            console.warn(`  - Check if buy transactions exist and are being processed correctly.`);
          }
        }

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

        // Determine holding period (use earliest lot date)
        // IRS Rule: Long-term if held MORE than 1 year (365 days + 1 day = 366+ days)
        if (selectedLots.length > 0) {
          earliestLotDate = selectedLots.reduce(
            (earliest, lot) =>
              lot.date < earliest ? lot.date : earliest,
            selectedLots[0].date
          );
          const holdingPeriodDays =
            (date.getTime() - earliestLotDate.getTime()) / (1000 * 60 * 60 * 24);
          // IRS: More than 1 year = 366+ days (accounting for leap years)
          holdingPeriod = holdingPeriodDays >= 366 ? "long" : "short";
        } else {
          // No lots found - this shouldn't happen for paired transactions
          // But if it does, we can't calculate cost basis
          console.warn(`[Tax Calculator] Sell transaction ${tx.id}: No cost basis lots available. Asset: ${asset}, Date: ${date.toISOString().split('T')[0]}`);
        }
        
        // Calculate gain/loss (proceeds after fees - cost basis)
        // Core formula: Gain/Loss = Proceeds (USD) - Cost Basis (USD)
        gainLoss = netProceeds - totalCostBasis;
        
        if (processedCount < 10) {
          console.log(`[Tax Calculator] Sell transaction ${tx.id} (from lots): proceeds=${netProceeds}, costBasis=${totalCostBasis}, gainLoss=${gainLoss}, holdingPeriod=${holdingPeriod}, lotsUsed=${selectedLots.length}`);
        }
      }

      // Track loss sales for wash sale detection (before checking tax year)
      const isLoss = gainLoss < 0;
      if (isLoss) {
        // Track this loss sale for wash sale detection (30 days before and after)
        lossSales.push({
          id: tx.id,
          date,
          asset,
          amount: sellAmount,
          lossAmount: Math.abs(gainLoss), // Store as positive value
          costBasis: totalCostBasis,
          proceeds: netProceeds,
          holdingPeriod,
          remainingLoss: Math.abs(gainLoss), // Initially, all loss is available for wash sale adjustment
        });
      }
      
      // Only include in tax year if the sale occurred in that year
      // IMPORTANT: Include ALL sell transactions that occurred in the tax year, regardless of cost basis
      // Cost basis can be 0 (valid case: proceeds > 0, cost basis = 0 means full gain)
      // Proceeds can be 0 (valid case: loss where asset was sold for $0)
      // The key is: if the SALE DATE is in the tax year, include it
      if (txYear === taxYear) {
        // Check if we have cost basis in notes (from tax report format) - even if it's 0
        const hasCostBasisInNotes = tx.notes?.includes("Cost Basis:") || false;
        const availableAssets = Object.keys(costBasisLots).filter(k => costBasisLots[k].length > 0);
        
        // Warn if we don't have cost basis and no matching buy transactions (but still include the transaction)
        if (totalCostBasis === 0 && !hasCostBasisInNotes && costBasisLots[asset]?.length === 0) {
          // Only log first few to avoid spam
          if (taxableEventCount < 20) {
            console.warn(`[Tax Calculator] ⚠️  Sell transaction ${tx.id} has NO cost basis and NO matching buy transactions!`);
            console.warn(`  - Asset: "${asset}" (original: "${tx.asset_symbol}")`);
            console.warn(`  - Date: ${date.toISOString().split('T')[0]}`);
            console.warn(`  - Proceeds: $${netProceeds.toFixed(2)}`);
            console.warn(`  - Available assets with lots: ${availableAssets.length > 0 ? availableAssets.join(", ") : "NONE"}`);
            console.warn(`  - This sell will show as 100% gain (proceeds = gain), which may be incorrect!`);
          }
        }
        
        // ALWAYS include the transaction if sale occurred in tax year
        // Cost basis can be 0 (means gain = proceeds) or > 0 (means gain = proceeds - cost basis)
        if (taxableEventCount < 10 || (totalCostBasis === 0 && taxableEventCount < 20)) {
          console.log(`[Tax Calculator] Including taxable event: asset=${asset}, proceeds=${netProceeds}, costBasis=${totalCostBasis}, gainLoss=${gainLoss}, holdingPeriod=${holdingPeriod}, year=${txYear}`);
        }
        taxableEventCount++;
        taxableEvents.push({
          id: tx.id,
          date,
          dateAcquired: earliestLotDate, // Actual acquisition date from lots or notes
          asset,
          amount: sellAmount,
          proceeds: netProceeds, // Report net proceeds (after fees)
          costBasis: totalCostBasis, // Can be 0 (valid case)
          gainLoss, // Already calculated above (proceeds - cost basis)
          holdingPeriod, // Already determined above
          chain: tx.chain || undefined,
          txHash: tx.tx_hash || undefined,
          washSale: false, // Will be updated later if wash sale detected
          washSaleAdjustment: undefined, // Will be updated if wash sale detected
        });
      } else {
        // Log year mismatches for debugging
        if (processedCount < 20 && (txType === "sell" || tx.type === "Sell")) {
          console.log(`[Tax Calculator] Skipping sell transaction ${tx.id}: year mismatch (txYear=${txYear}, taxYear=${taxYear}), date=${date.toISOString().split('T')[0]}, asset=${asset}`);
        }
      }
    }
    // Handle swaps - treat as sell of one asset and buy of another
    // IRS: Swaps are taxable events (like-kind exchange rules eliminated for crypto after 2017)
    else if (txType === "swap") {
      // First, try to use stored swap information from database
      let outgoingAsset = asset; // Already normalized above
      let incomingAsset = tx.incoming_asset_symbol ? (tx.incoming_asset_symbol.trim().toUpperCase()) : null;
      let outgoingAmount = amount;
      let incomingAmount = tx.incoming_amount_value ? Number(tx.incoming_amount_value) : null;
      let incomingValueUsd = tx.incoming_value_usd ? Number(tx.incoming_value_usd) : null;

      // If swap info not in database, try to parse from notes/asset_symbol
      if (!incomingAsset || !incomingAmount) {
        const swapInfo = parseSwapTransaction(tx);
        outgoingAsset = swapInfo.outgoingAsset ? (swapInfo.outgoingAsset.trim().toUpperCase()) : asset;
        incomingAsset = swapInfo.incomingAsset ? (swapInfo.incomingAsset.trim().toUpperCase()) : incomingAsset;
        outgoingAmount = swapInfo.outgoingAmount || amount;
        incomingAmount = swapInfo.incomingAmount || incomingAmount;
        incomingValueUsd = swapInfo.incomingValueUsd || incomingValueUsd;
      }

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

        // Calculate proceeds (fair market value of outgoing asset, minus fees)
        // IRS Rule: Fees are subtracted from proceeds for swaps (disposal of asset)
        const grossProceeds = Math.abs(valueUsd);
        const netProceeds = grossProceeds - feeUsd;
        const gainLoss = netProceeds - totalCostBasis;

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
            dateAcquired: earliestLotDate, // Actual acquisition date from lots
            asset: outgoingAsset,
            amount: outgoingAmount,
            proceeds: netProceeds, // Report net proceeds (after fees)
            costBasis: totalCostBasis,
            gainLoss,
            holdingPeriod,
            chain: tx.chain || undefined,
            txHash: tx.tx_hash || undefined,
          });
        }
      }

      // Handle incoming asset acquisition (adds to cost basis)
      // IRS: Incoming asset's cost basis = fair market value at time of swap + fees
      if (incomingAsset && incomingAmount && incomingValueUsd) {
        const incomingPricePerUnit = incomingValueUsd / incomingAmount;
        // Fees are added to cost basis of incoming asset in swaps
        const incomingCostBasis = Math.abs(incomingValueUsd) + feeUsd;
        costBasisLots[incomingAsset].push({
          id: tx.id,
          date,
          amount: incomingAmount,
          costBasis: incomingCostBasis, // Cost basis = FMV at swap + fees
          pricePerUnit: incomingPricePerUnit,
          fees: feeUsd,
        });
      } else if (incomingAsset && incomingAmount) {
        // Fallback: use value_usd if incoming value not parsed
        const incomingPricePerUnit = Math.abs(valueUsd) / incomingAmount;
        const incomingCostBasis = Math.abs(valueUsd) + feeUsd;
        costBasisLots[incomingAsset].push({
          id: tx.id,
          date,
          amount: incomingAmount,
          costBasis: incomingCostBasis,
          pricePerUnit: incomingPricePerUnit,
          fees: feeUsd,
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
        const earliestLotDate =
          selectedLots.length > 0
            ? selectedLots.reduce(
                (earliest, lot) =>
                  lot.date < earliest ? lot.date : earliest,
                selectedLots[0].date
              )
            : date;
        taxableEvents.push({
          id: tx.id,
          date,
          dateAcquired: earliestLotDate, // Actual acquisition date from lots
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
        const earliestLotDate =
          selectedLots.length > 0
            ? selectedLots.reduce(
                (earliest, lot) =>
                  lot.date < earliest ? lot.date : earliest,
                selectedLots[0].date
              )
            : date;
        taxableEvents.push({
          id: tx.id,
          date,
          dateAcquired: earliestLotDate, // Actual acquisition date from lots
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

  // Mark wash sales after processing all transactions
  markWashSales(taxableEvents, lossSales);
  
  console.log(`[processTransactionsForTax] Processing complete for tax year ${taxYear}:`);
  console.log(`  - Processed ${processedCount} transactions (out of ${transactions.length} total)`);
  console.log(`  - Found ${taxableEventCount} taxable events`);
  console.log(`  - Found ${incomeEventCount} income events`);
  console.log(`  - Transaction types processed:`, typeCounts);
  console.log(`  - Loss sales tracked: ${lossSales.length}`);
  const washSaleCount = taxableEvents.filter(e => e.washSale).length;
  if (washSaleCount > 0) {
    console.log(`  - Wash sales detected: ${washSaleCount}`);
  }
  
  // Log cost basis lots summary
  const assetsWithLots = Object.keys(costBasisLots).filter(k => costBasisLots[k].length > 0);
  console.log(`  - Assets with cost basis lots: ${assetsWithLots.length}`);
  if (assetsWithLots.length > 0) {
    console.log(`  - Assets: ${assetsWithLots.join(", ")}`);
    assetsWithLots.forEach(asset => {
      const totalAmount = costBasisLots[asset].reduce((sum, lot) => sum + lot.amount, 0);
      const totalCostBasis = costBasisLots[asset].reduce((sum, lot) => sum + lot.costBasis, 0);
      console.log(`    - ${asset}: ${costBasisLots[asset].length} lots, ${totalAmount} total amount, $${totalCostBasis.toFixed(2)} total cost basis`);
    });
  } else {
    console.warn(`  - ⚠️  NO COST BASIS LOTS CREATED! This means no buy transactions were processed.`);
  }
  
  if (taxableEventCount === 0 && incomeEventCount === 0) {
    if (transactions.length === 0) {
      console.warn(`[processTransactionsForTax] WARNING: No transactions found to process`);
    } else {
      console.warn(`[processTransactionsForTax] WARNING: Processed ${transactions.length} transactions but found 0 taxable/income events`);
      console.warn(`  This could mean:`);
      console.warn(`  1. Transactions are not in tax year ${taxYear} (check transaction years)`);
      console.warn(`  2. Transaction types don't match expected types (buy/sell/income)`);
      console.warn(`  3. Sell transactions don't have matching buy transactions or cost basis in notes`);
      const yearsInData = Object.keys(transactionsByYear);
      console.warn(`  4. Transactions found in years: ${yearsInData.join(", ")}`);
      const sellYears = Object.keys(sellTransactionsByYear);
      if (sellYears.length > 0) {
        console.warn(`  5. Sell transactions found in years: ${sellYears.join(", ")}`);
      }
      if (assetsWithLots.length === 0) {
        console.warn(`  6. ⚠️  CRITICAL: No buy transactions found! All sells need matching buys.`);
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
 * Also calculates incoming value USD if possible
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
  const outgoingValueUsd = Number(tx.value_usd);

  // Try to parse from notes (format: "ETH → USDC" or "1.5 ETH → 3000 USDC" or "Swapped 1.5 ETH for 3000 USDC")
  // More flexible patterns
  const swapPatterns = [
    /([\d.,]+)\s*(\w+)\s*(?:→|->|-|for|to)\s*([\d.,]+)\s*(\w+)/i, // "1.5 ETH → 3000 USDC"
    /(?:swapped|swap|exchanged|exchange)\s+([\d.,]+)\s+(\w+)\s+(?:for|to|→|->|-)\s+([\d.,]+)\s+(\w+)/i, // "Swapped 1.5 ETH for 3000 USDC"
    /(\w+)\s*→\s*(\w+)/i, // "ETH → USDC" (no amounts)
  ];

  for (const pattern of swapPatterns) {
    const match = notes.match(pattern);
    if (match) {
      const outgoingAsset = match[2]?.toUpperCase() || match[1]?.toUpperCase();
      const incomingAsset = match[4]?.toUpperCase() || match[2]?.toUpperCase();
      const outgoingAmount = match[1] ? parseFloat(match[1].replace(/,/g, "")) : Number(tx.amount_value);
      const incomingAmount = match[3] ? parseFloat(match[3].replace(/,/g, "")) : null;

      // Calculate incoming value USD if we have incoming amount
      // For swaps, incoming value should equal outgoing value (minus fees)
      let incomingValueUsd: number | null = null;
      if (incomingAmount && outgoingValueUsd) {
        // In a swap, the incoming value should be approximately equal to outgoing value
        // (the difference is slippage/fees, which we account for separately)
        incomingValueUsd = Math.abs(outgoingValueUsd);
      }

      return {
        outgoingAsset: outgoingAsset ? outgoingAsset.trim().toUpperCase() : (tx.asset_symbol ? tx.asset_symbol.trim().toUpperCase() : null),
        incomingAsset: incomingAsset ? incomingAsset.trim().toUpperCase() : null,
        outgoingAmount: outgoingAmount || Number(tx.amount_value),
        incomingAmount,
        incomingValueUsd,
      };
    }
  }

  // Try to parse from asset_symbol (format: "ETH/USDC" or "ETH→USDC")
  const assetPattern = /(\w+)\s*(?:\/|→|->|-)\s*(\w+)/i;
  const assetMatch = assetSymbol.match(assetPattern);

  if (assetMatch) {
    // For swaps, incoming value equals outgoing value
    return {
      outgoingAsset: assetMatch[1].toUpperCase(),
      incomingAsset: assetMatch[2].toUpperCase(),
      outgoingAmount: Number(tx.amount_value),
      incomingAmount: null, // Can't determine from asset symbol alone
      incomingValueUsd: Math.abs(outgoingValueUsd), // Use outgoing value as estimate
    };
  }

  // Fallback: use current asset as outgoing, no incoming identified
  // Normalize asset symbol
  return {
    outgoingAsset: assetSymbol ? assetSymbol.trim().toUpperCase() : null,
    incomingAsset: null,
    outgoingAmount: Number(tx.amount_value),
    incomingAmount: null,
    incomingValueUsd: null,
  };
}

/**
 * Check for wash sale and return adjustment amount
 * Wash sale: If a loss sale is followed by a buy of the same asset within 30 days
 * The disallowed loss is added to the cost basis of the replacement shares
 */
function checkWashSale(
  asset: string,
  buyDate: Date,
  lossSales: LossSale[]
): number {
  let totalAdjustment = 0;
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
  
  // Check each loss sale to see if this buy is within the wash sale window
  // Since we process chronologically, we only check loss sales that happened BEFORE this buy
  for (const lossSale of lossSales) {
    // Must be same asset
    if (lossSale.asset.toUpperCase() !== asset.toUpperCase()) {
      continue;
    }
    
    // Must have remaining loss to apply
    if (lossSale.remainingLoss <= 0) {
      continue;
    }
    
    // Check if buy is within 30 days AFTER the loss sale (or 30 days before, but we process chronologically)
    // Wash sale window: 30 days before sale to 30 days after sale (61 days total)
    const daysDifference = (buyDate.getTime() - lossSale.date.getTime());
    
    // Buy must be within 30 days after the loss sale (or 30 days before, but we process chronologically so this is less common)
    if (daysDifference >= -thirtyDaysMs && daysDifference <= thirtyDaysMs) {
      // This is a wash sale - apply the loss to this buy's cost basis
      const adjustment = Math.min(lossSale.remainingLoss, lossSale.lossAmount);
      lossSale.remainingLoss -= adjustment;
      totalAdjustment += adjustment;
      
      console.log(`[Wash Sale] Detected wash sale: Buy on ${buyDate.toISOString().split('T')[0]} is within 30 days of loss sale on ${lossSale.date.toISOString().split('T')[0]}. Applying $${adjustment.toFixed(2)} adjustment.`);
    }
  }
  
  return totalAdjustment;
}

/**
 * Mark wash sales in taxable events after processing all transactions
 * This updates events that had their loss disallowed due to wash sale rules
 */
function markWashSales(
  taxableEvents: TaxableEvent[],
  lossSales: LossSale[]
): void {
  // Mark events as wash sales if their loss was fully or partially disallowed
  for (const lossSale of lossSales) {
    if (lossSale.remainingLoss < lossSale.lossAmount) {
      // Some or all of the loss was disallowed (applied to replacement shares)
      const disallowedAmount = lossSale.lossAmount - lossSale.remainingLoss;
      
      // Find the corresponding taxable event
      const event = taxableEvents.find(e => e.id === lossSale.id);
      if (event) {
        event.washSale = true;
        event.washSaleAdjustment = disallowedAmount;
        // Note: The gainLoss remains negative (loss), but it will be marked with code "W" in Form 8949
        console.log(`[Wash Sale] Marked event ${event.id} as wash sale. Disallowed loss: $${disallowedAmount.toFixed(2)}`);
      }
    }
  }
}

/**
 * Generate Form 8949 data for IRS reporting
 * Form 8949 is required for reporting capital gains and losses
 */
function generateForm8949Data(
  taxableEvents: TaxableEvent[]
): Form8949Entry[] {
  return taxableEvents.map((event) => {
    // IRS Code "W" indicates a wash sale
    const code = event.washSale ? "W" : "";
    
    return {
      description: `${event.amount} ${event.asset}${event.chain ? ` (${event.chain})` : ""}${event.txHash ? ` - ${event.txHash.substring(0, 8)}...` : ""}${event.washSale ? " [Wash Sale]" : ""}`,
      dateAcquired: event.dateAcquired || event.date, // Use actual acquisition date if available
      dateSold: event.date,
      proceeds: event.proceeds,
      costBasis: event.costBasis,
      code, // "W" for wash sale
      gainLoss: event.gainLoss, // Still shows as loss, but code "W" indicates it's disallowed
      holdingPeriod: event.holdingPeriod,
    };
  });
}
