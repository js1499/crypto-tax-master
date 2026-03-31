import { PrismaClient, Transaction, Prisma } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { isTaxableBuy, isTaxableSell, isTransferSkip, getCategory } from "@/lib/transaction-categorizer";

// L-1 fix: Debug-guarded logging — only emit verbose logs in development
const TAX_DEBUG = process.env.NODE_ENV === "development" || process.env.TAX_DEBUG === "1";
function debugLog(...args: unknown[]) {
  if (TAX_DEBUG) console.log(...args);
}

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
  holdingPeriod: "short" | "long"; // Short-term: ≤ 1 year, Long-term: > 1 year (IRS: must be held MORE than 1 year)
  chain?: string;
  txHash?: string;
  source?: string; // Transaction source (JUPITER, Coinbase, etc.) for Form 8949 box selection
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
  // UK/DE Tax Fields
  annualExemption: number; // UK: £3,000 annual exempt amount deducted from gains; 0 for others
  // Currency display
  currency: string; // "USD", "GBP", "EUR"
  currencySymbol: string; // "$", "£", "€"
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

// Per-transaction cost basis result (for persisting to DB)
export interface TransactionCostBasisResult {
  transactionId: number;
  costBasisUsd: number | null;  // null = not applicable (transfers, etc.)
  gainLossUsd: number | null;   // null = not a disposal event
}

// Stablecoins: use face value ($1/unit) as cost basis for disposals.
// Lot tracking for stablecoins creates artifacts when tokens cycle through
// DeFi protocols (deposits/withdrawals deplete lots, causing phantom gains).
const STABLECOINS = new Set(["USDC", "USDT", "PYUSD", "DAI", "BUSD", "TUSD", "USDP", "FRAX", "USD1", "EURC", "USDH", "DOLLARCOIN"]);

// Known staking/governance contract addresses that should be treated as
// self-transfers (non-taxable). Tokens sent to these addresses are locked,
// not sold — they come back to the user later.
const STAKING_CONTRACT_ADDRESSES = new Set([
  "6a5vURu4cRdaJHfdq6JYcsk3MQ1FJBRoQ5zmrVbT1G5G", // JUP DAO staking/governance
]);

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

/** Compute the lot key: per-wallet mode uses "wallet:asset", universal uses just "asset" */
function lotKey(asset: string, walletAddress: string | null, perWallet: boolean): string {
  if (!perWallet) return asset;
  return `${walletAddress || "__global__"}:${asset}`;
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

// Track buy transactions for wash sale detection (buys that occur before loss sales)
interface BuyTransaction {
  id: number;
  date: Date;
  asset: string;
  amount: number;
  costBasis: number;
  lotId: number; // ID of the CostBasisLot for wash sale adjustment lookup
}

/**
 * Get the tax year for a given date in the user's timezone.
 * Without timezone conversion, a transaction at 11pm ET on Dec 31 would
 * be Jan 1 UTC and attributed to the wrong year.
 */
function getTaxYear(date: Date, timezone: string): number {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
    }).formatToParts(date);
    const yearPart = parts.find(p => p.type === "year");
    return yearPart ? parseInt(yearPart.value) : date.getFullYear();
  } catch {
    return date.getFullYear(); // Fallback to UTC if invalid timezone
  }
}

/**
 * Get the tax year start/end dates for a given year and country.
 * UK uses Apr 6 – Apr 5 fiscal year; US and DE use calendar year.
 */
function getTaxYearBounds(year: number, country: string): { start: Date; end: Date } {
  if (country === "UK") {
    // UK fiscal year: Apr 6 to Apr 5
    return {
      start: new Date(`${year}-04-06T00:00:00Z`),
      end: new Date(`${year + 1}-04-05T23:59:59.999Z`),
    };
  }
  // US and DE: calendar year
  return {
    start: new Date(`${year}-01-01T00:00:00Z`),
    end: new Date(`${year}-12-31T23:59:59.999Z`),
  };
}

/**
 * Determine if holding period is long-term using date-based calculation
 * IRS Rule: Long-term if held MORE than one year from acquisition date
 * This is date-based, not day-count based (e.g., Jan 1, 2024 to Jan 1, 2025 = exactly 1 year = short-term)
 */
function isLongTerm(dateAcquired: Date, dateSold: Date): boolean {
  const anniversary = new Date(dateAcquired);
  anniversary.setFullYear(anniversary.getFullYear() + 1);
  // Must be MORE than one year, so dateSold must be after the anniversary
  return dateSold > anniversary;
}

/**
 * Helper function to process asset disposal transactions (sell, margin sell, liquidation)
 * Returns the disposal details or null if processing should be skipped
 */
interface LotDisposal {
  lotDate: Date;
  amount: number;
  costBasis: number;
}

interface DisposalResult {
  totalCostBasis: number;
  netProceeds: number;
  gainLoss: number;
  earliestLotDate: Date;
  holdingPeriod: "short" | "long";
  shouldTrackAsLossSale: boolean;
  lotDisposals: LotDisposal[];
}

function processDisposal(
  tx: Transaction,
  asset: string,
  amount: number,
  valueUsd: number,
  feeUsd: number,
  date: Date,
  costBasisLots: Record<string, CostBasisLot[]>,
  method: "FIFO" | "LIFO" | "HIFO",
  processedCount: number,
  taxableEventCount: number,
  country: string = "US"
): DisposalResult {
  // IRS Rule: Fees are subtracted from proceeds for sales
  const grossProceeds = valueUsd >= 0 ? valueUsd : Math.abs(valueUsd);

  // For CSV imports, value_usd is already net proceeds, so don't subtract fees again
  const isCSVImport = tx.source_type === "csv_import";
  const netProceeds = isCSVImport
    ? grossProceeds
    : grossProceeds - feeUsd;

  const sellAmount = amount;
  let remainingToSell = sellAmount;
  let totalCostBasis = 0;
  let earliestLotDate = date; // Default to sale date
  let holdingPeriod: "short" | "long" = "short";
  let gainLoss: number;

  // Check if transaction has pre-calculated cost basis in notes (from tax report format)
  const notes = tx.notes || "";
  const costBasisMatch = notes.match(/Cost Basis:\s*\$?([\d,]+(?:\.\d+)?)/i);
  const purchasedMatch = notes.match(/Purchased:\s*(\d{4}-\d{2}-\d{2})/i);
  const holdingPeriodMatch = notes.match(/(Long-term|Short-term)\s*\((\d+)\s*days?\)/i);

  if (costBasisMatch) {
    // Use pre-calculated cost basis from tax report format
    const costBasisStr = costBasisMatch[1].replace(/,/g, "");
    totalCostBasis = parseFloat(costBasisStr);

    if (isNaN(totalCostBasis)) {
      console.warn(`[Tax Calculator] ${tx.type} transaction ${tx.id}: Failed to parse cost basis from notes. Matched: "${costBasisMatch[1]}", Parsed: ${costBasisStr}`);
      totalCostBasis = 0;
    }

    if (totalCostBasis === 0 && processedCount < 10) {
      debugLog(`[Tax Calculator] ${tx.type} transaction ${tx.id}: Found cost basis 0 in notes. Notes: ${notes.substring(0, 200)}`);
    } else if (processedCount < 10 || taxableEventCount < 5) {
      debugLog(`[Tax Calculator] ${tx.type} transaction ${tx.id}: Using cost basis from notes: $${totalCostBasis.toFixed(2)}`);
    }

    // Extract purchase date if available
    if (purchasedMatch) {
      earliestLotDate = new Date(purchasedMatch[1]);
    }

    // Determine holding period using date-based calculation
    if (earliestLotDate && earliestLotDate.getTime() !== date.getTime()) {
      holdingPeriod = isLongTerm(earliestLotDate, date) ? "long" : "short";
    } else if (holdingPeriodMatch) {
      holdingPeriod = holdingPeriodMatch[1].toLowerCase().includes("long") ? "long" : "short";
    } else {
      holdingPeriod = "short";
    }

    gainLoss = Math.round((netProceeds - totalCostBasis) * 100) / 100;

    // Germany: gains AND losses are tax-free after 1-year holding period (Section 23 EStG)
    if (country === "DE" && holdingPeriod === "long") {
      gainLoss = 0;
    }

    if (processedCount < 10 || taxableEventCount < 5) {
      debugLog(`[Tax Calculator] ${tx.type} transaction ${tx.id}: proceeds=${netProceeds}, costBasis=${totalCostBasis}, gainLoss=${gainLoss}, holdingPeriod=${holdingPeriod}`);
    }

    // For notes-based path, create a single-element lotDisposals
    const lotDisposals: LotDisposal[] = [{ lotDate: earliestLotDate, amount, costBasis: totalCostBasis }];

    return {
      totalCostBasis: Math.round(totalCostBasis * 100) / 100,
      netProceeds: Math.round(netProceeds * 100) / 100,
      gainLoss,
      earliestLotDate,
      holdingPeriod,
      shouldTrackAsLossSale: gainLoss < 0,
      lotDisposals,
    };
  } else {
    // Calculate cost basis from lots (normal flow)
    const selectedLots = selectLots(
      costBasisLots[asset],
      sellAmount,
      method
    );

    if (selectedLots.length === 0) {
      const availableAssets = Object.keys(costBasisLots).filter(k => costBasisLots[k].length > 0);
      console.warn(`[Tax Calculator] ${tx.type} transaction ${tx.id}: No cost basis lots found for asset "${asset}" (original: "${tx.asset_symbol}")`);
      console.warn(`  - Available assets with lots: ${availableAssets.length > 0 ? availableAssets.join(", ") : "NONE"}`);
    }

    // Calculate cost basis from selected lots
    const lotDisposals: LotDisposal[] = [];
    for (const lot of selectedLots) {
      if (remainingToSell <= 0) break;

      const amountFromLot = Math.min(remainingToSell, lot.amount);
      const costBasisPerUnit = lot.amount > 0 ? lot.costBasis / lot.amount : 0;
      const costBasisFromLot = costBasisPerUnit * amountFromLot;

      totalCostBasis += costBasisFromLot;
      lot.amount -= amountFromLot;
      lot.costBasis -= costBasisFromLot;
      remainingToSell -= amountFromLot;
      lotDisposals.push({ lotDate: lot.date, amount: amountFromLot, costBasis: costBasisFromLot });
    }

    if (remainingToSell > 0) {
      console.warn(`[Tax Calculator] ⚠️  ${tx.type} transaction ${tx.id}: Sold ${amount} ${asset} but only had lots for ${amount - remainingToSell}. Excess ${remainingToSell} has zero cost basis.`);
    }

    // Remove empty lots
    costBasisLots[asset] = costBasisLots[asset].filter((lot) => lot.amount > 0);

    // Determine holding period
    if (selectedLots.length > 0) {
      earliestLotDate = selectedLots.reduce(
        (earliest, lot) => lot.date < earliest ? lot.date : earliest,
        selectedLots[0].date
      );
      holdingPeriod = isLongTerm(earliestLotDate, date) ? "long" : "short";
    } else {
      console.warn(`[Tax Calculator] ${tx.type} transaction ${tx.id}: No cost basis lots available. Asset: ${asset}`);
    }

    // Stablecoin override: stablecoins always have ~$1 cost basis per unit.
    // Force cost basis = proceeds to prevent phantom gains from lot depletion.
    // Extract bare asset name from composite key (e.g., "walletAddr:USDC" → "USDC")
    const bareAsset = asset.includes(":") ? asset.split(":").pop()! : asset;
    if (STABLECOINS.has(bareAsset)) {
      // Always force break-even for stablecoins — they don't have real capital gains
      totalCostBasis = netProceeds;
    }

    gainLoss = Math.round((netProceeds - totalCostBasis) * 100) / 100;

    // Germany: gains AND losses are tax-free after 1-year holding period (Section 23 EStG)
    if (country === "DE" && holdingPeriod === "long") {
      gainLoss = 0;
    }

    if (processedCount < 10) {
      debugLog(`[Tax Calculator] ${tx.type} transaction ${tx.id} (from lots): proceeds=${netProceeds}, costBasis=${totalCostBasis}, gainLoss=${gainLoss}, lotsUsed=${selectedLots.length}${STABLECOINS.has(bareAsset) ? ' [stablecoin override]' : ''}`);
    }

    return {
      totalCostBasis: Math.round(totalCostBasis * 100) / 100,
      netProceeds: Math.round(netProceeds * 100) / 100,
      gainLoss,
      earliestLotDate,
      holdingPeriod,
      shouldTrackAsLossSale: gainLoss < 0,
      lotDisposals,
    };
  }
}

function createDisposalTaxEvents(
  tx: Transaction,
  asset: string,
  totalAmount: number,
  disposal: DisposalResult,
  date: Date,
): TaxableEvent[] {
  const lotDisposals = disposal.lotDisposals;

  // If single lot or all lots have the same holding period, create one event
  if (lotDisposals.length <= 1) {
    return [{
      id: tx.id,
      date,
      dateAcquired: disposal.earliestLotDate,
      asset,
      amount: totalAmount,
      proceeds: disposal.netProceeds,
      costBasis: disposal.totalCostBasis,
      gainLoss: disposal.gainLoss,
      holdingPeriod: disposal.holdingPeriod,
      chain: tx.chain || undefined,
      txHash: tx.tx_hash || undefined,
      source: tx.source || undefined,
      washSale: false,
      washSaleAdjustment: undefined,
    }];
  }

  // Group lots by holding period
  const shortTermLots = lotDisposals.filter(l => !isLongTerm(l.lotDate, date));
  const longTermLots = lotDisposals.filter(l => isLongTerm(l.lotDate, date));

  // C-5 fix: If all same period, derive holdingPeriod from actual lots, not
  // disposal.holdingPeriod which is based on the earliest lot only.
  if (shortTermLots.length === 0 || longTermLots.length === 0) {
    const actualHoldingPeriod: "short" | "long" = shortTermLots.length === 0 ? "long" : "short";
    return [{
      id: tx.id,
      date,
      dateAcquired: disposal.earliestLotDate,
      asset,
      amount: totalAmount,
      proceeds: disposal.netProceeds,
      costBasis: disposal.totalCostBasis,
      gainLoss: disposal.gainLoss,
      holdingPeriod: actualHoldingPeriod,
      chain: tx.chain || undefined,
      txHash: tx.tx_hash || undefined,
      source: tx.source || undefined,
      washSale: false,
      washSaleAdjustment: undefined,
    }];
  }

  // Mixed holding periods — split into separate events
  const events: TaxableEvent[] = [];
  for (const [lots, hp] of [[shortTermLots, "short"] as const, [longTermLots, "long"] as const] as const) {
    if (lots.length === 0) continue;
    const lotCostBasis = lots.reduce((s: number, l: LotDisposal) => s + l.costBasis, 0);
    const lotAmount = lots.reduce((s: number, l: LotDisposal) => s + l.amount, 0);
    // Distribute proceeds proportionally by amount
    const lotProceeds = totalAmount > 0 ? disposal.netProceeds * (lotAmount / totalAmount) : 0;
    const earliestDate = lots.reduce((m: Date, l: LotDisposal) => l.lotDate < m ? l.lotDate : m, lots[0].lotDate);

    events.push({
      id: tx.id,
      date,
      dateAcquired: earliestDate,
      asset,
      amount: lotAmount,
      proceeds: Math.round(lotProceeds * 100) / 100,
      costBasis: Math.round(lotCostBasis * 100) / 100,
      gainLoss: Math.round((lotProceeds - lotCostBasis) * 100) / 100,
      holdingPeriod: hp,
      chain: tx.chain || undefined,
      txHash: tx.tx_hash || undefined,
      source: tx.source || undefined,
      washSale: false,
      washSaleAdjustment: undefined,
    });
  }
  return events;
}

/**
 * Calculate tax report for a given year
 */
export async function calculateTaxReport(
  prisma: PrismaClient,
  walletAddresses: string[],
  year: number,
  method: "FIFO" | "LIFO" | "HIFO" = "FIFO",
  userId?: string, // Optional user ID to include CSV-imported transactions
  filingStatus: "single" | "married_joint" | "married_separate" | "head_of_household" = "single",
  timezone: string = "America/New_York",
  country: string = "US"
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
  
  // Include CSV imports — scoped to this user via userId column
  if (userId) {
    orConditions.push({
      AND: [
        { source_type: "csv_import" },
        { userId },
      ],
    });
  }

  // Include exchange API imports — scoped to user's connected exchanges
  if (userId) {
    const userExchanges = await prisma.exchange.findMany({
      where: { userId },
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
  }

  if (orConditions.length > 0) {
    whereClause.OR = orConditions;
  }

  // Filter by status - include both confirmed and completed transactions
  // Also include pending transactions (some CSV imports might be pending)
  whereClause.status = { in: ["confirmed", "completed", "pending"] };

  debugLog(`[Tax Calculator] Fetching transactions for year ${year}`);
  debugLog(`[Tax Calculator] Wallet addresses:`, walletAddresses);
  debugLog(`[Tax Calculator] User ID:`, userId);
  debugLog(`[Tax Calculator] Where clause:`, JSON.stringify(whereClause, null, 2));

  const allTransactions = await prisma.transaction.findMany({
    where: whereClause,
    orderBy: {
      tx_timestamp: "asc",
    },
  });

  debugLog(`[Tax Calculator] Found ${allTransactions.length} total transactions`);
  
  // L-6 fix: removed redundant case-sensitive checks (txType is already lowercased)
  const buyTransactions = allTransactions.filter(tx => isTaxableBuy(tx.type || ""));
  const sellTransactions = allTransactions.filter(tx => isTaxableSell(tx.type || ""));
  debugLog(`[Tax Calculator] Transaction breakdown: ${buyTransactions.length} buy, ${sellTransactions.length} sell, ${allTransactions.length - buyTransactions.length - sellTransactions.length} other`);
  
  // Log first few buy transactions to verify they're included
  if (buyTransactions.length > 0) {
    debugLog(`[Tax Calculator] First 5 buy transactions:`, buyTransactions.slice(0, 5).map(tx => ({
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
    debugLog(`[Tax Calculator] Transaction date range:`, dateRange);
    const csvImports = allTransactions.filter(tx => tx.source_type === "csv_import");
    debugLog(`[Tax Calculator] CSV imports: ${csvImports.length}`);
    const walletTransactions = allTransactions.filter(tx => tx.source_type !== "csv_import");
    debugLog(`[Tax Calculator] Wallet transactions: ${walletTransactions.length}`);
    
    // Check transaction types
    const typeCounts: Record<string, number> = {};
    allTransactions.forEach(tx => {
      const type = tx.type || "unknown";
      typeCounts[type] = (typeCounts[type] || 0) + 1;
    });
    debugLog(`[Tax Calculator] Transaction types:`, typeCounts);
    
    // L-2 fix: Removed duplicate sellTransactions filter — already defined above
    debugLog(`[Tax Calculator] Sell transactions: ${sellTransactions.length}`);
    
    // Check transaction years distribution
    const yearCounts: Record<number, number> = {};
    allTransactions.forEach(tx => {
      const txYear = tx.tx_timestamp.getFullYear();
      yearCounts[txYear] = (yearCounts[txYear] || 0) + 1;
    });
    debugLog(`[Tax Calculator] Transactions by year:`, yearCounts);
    
    // Check sell transactions by year
    const sellYearCounts: Record<number, number> = {};
    sellTransactions.forEach(tx => {
      const txYear = tx.tx_timestamp.getFullYear();
      sellYearCounts[txYear] = (sellYearCounts[txYear] || 0) + 1;
    });
    debugLog(`[Tax Calculator] Sell transactions by year:`, sellYearCounts);
    
    // Check a few sell transactions to see their structure
    if (sellTransactions.length > 0) {
      const sampleSell = sellTransactions[0];
      debugLog(`[Tax Calculator] Sample sell transaction:`, {
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
      debugLog(`[Tax Calculator] Sample sell transactions by year:`, samplesByYear);
    }
  }

  // Process ALL transactions together (unified across chains) so cost basis lots
  // are shared across chains. allTransactions is already sorted chronologically.
  debugLog(`[Tax Calculator] Processing ${allTransactions.length} transactions (unified across all chains)`);

  const perWallet = year >= 2025;
  const unifiedReport = country === "UK"
    ? processTransactionsForTaxUK(
        allTransactions,
        year,
        walletAddresses,
        undefined, // costBasisResults
        timezone,
      )
    : processTransactionsForTax(
        allTransactions,
        year,
        method,
        walletAddresses,
        undefined, // costBasisResults
        timezone,
        perWallet,
        country
      );

  const combinedTaxableEvents = unifiedReport.taxableEvents;
  const combinedIncomeEvents = unifiedReport.incomeEvents;

  // Germany: Freigrenze (Section 23 EStG) — if net short-term gains < EUR 1,000,
  // all short-term gains AND losses are exempt. If >= EUR 1,000, everything is taxable.
  // Long-term disposals are already zeroed out in processDisposal.
  if (country === "DE") {
    const netSTGain = combinedTaxableEvents
      .filter(e => e.holdingPeriod === "short")
      .reduce((s, e) => s + e.gainLoss, 0);
    if (netSTGain > 0 && netSTGain < 1000) {
      // Below Freigrenze: zero out all short-term gains AND losses
      for (const event of combinedTaxableEvents) {
        if (event.holdingPeriod === "short") {
          event.gainLoss = 0;
        }
      }
      debugLog(`[Tax Calculator] Germany Freigrenze: Net short-term gain EUR ${netSTGain.toFixed(2)} < EUR 1,000 — all short-term gains/losses zeroed out.`);
    }
    // If netSTGain >= 1000, everything stays taxable (no adjustment)
    // If netSTGain <= 0, losses remain for carry-forward

    // Germany: €256 Freigrenze for staking/mining/lending income (Section 22 Nr. 3 EStG)
    // If total income < 256, all exempt. If >= 256, all taxable.
    const totalIncomeDE = combinedIncomeEvents.reduce((s, e) => s + e.valueUsd, 0);
    if (totalIncomeDE > 0 && totalIncomeDE < 256) {
      // Below threshold: zero out all income events
      for (const event of combinedIncomeEvents) {
        event.valueUsd = 0;
      }
      debugLog(`[Tax Calculator] Germany Income Freigrenze: Total income EUR ${totalIncomeDE.toFixed(2)} < EUR 256 — all income events zeroed out.`);
    }
  }

  debugLog(`[Tax Calculator] Combined: ${combinedTaxableEvents.length} taxable events, ${combinedIncomeEvents.length} income events`);

  // Calculate diagnostic totals for verification
  const totalProceeds = combinedTaxableEvents.reduce((sum, e) => sum + e.proceeds, 0);
  const totalCostBasis = combinedTaxableEvents.reduce((sum, e) => sum + e.costBasis, 0);
  const totalGainLoss = combinedTaxableEvents.reduce((sum, e) => sum + e.gainLoss, 0);
  const expectedGain = totalProceeds - totalCostBasis;
  
  debugLog(`[Tax Calculator] DIAGNOSTIC TOTALS:`);
  debugLog(`  - Total Proceeds: $${totalProceeds.toFixed(2)}`);
  debugLog(`  - Total Cost Basis: $${totalCostBasis.toFixed(2)}`);
  debugLog(`  - Expected Gain (Proceeds - Cost Basis): $${expectedGain.toFixed(2)}`);
  debugLog(`  - Actual Total Gain/Loss (sum of all gainLoss): $${totalGainLoss.toFixed(2)}`);
  debugLog(`  - Difference: $${Math.abs(expectedGain - totalGainLoss).toFixed(2)}`);
  
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
  
  debugLog(`[Tax Calculator] Event breakdown (gainLoss = proceeds - costBasis):`);
  debugLog(`  - Short-term gains: ${shortTermGainsEvents.length} events, total: $${shortTermGains.toFixed(2)}`);
  debugLog(`  - Long-term gains: ${longTermGainsEvents.length} events, total: $${longTermGains.toFixed(2)}`);
  debugLog(`  - Short-term losses: ${shortTermLossEvents.length} events, total: $${shortTermLosses.toFixed(2)}`);
  debugLog(`  - Long-term losses: ${longTermLossEvents.length} events, total: $${longTermLosses.toFixed(2)}`);
  debugLog(`  - Zero gain/loss: ${zeroGainCount} events`);
  debugLog(`  - Total events: ${combinedTaxableEvents.length}`);
  debugLog(`  - Net gain (gains - losses): $${calculatedNetGain.toFixed(2)}`);
  debugLog(`  - Sum of all gainLoss: $${actualTotalGainLoss.toFixed(2)}`);
  const totalIncome = Math.round(combinedIncomeEvents.reduce(
    (sum, e) => sum + e.valueUsd,
    0
  ) * 100) / 100;
  
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
  debugLog(`[Tax Calculator] Taxable events by year:`, eventsByYear);
  debugLog(`[Tax Calculator] Taxable events by year with gains:`, Object.entries(eventsByYearWithGains).map(([year, data]) => ({
    year: parseInt(year),
    count: data.count,
    totalGain: data.totalGain.toFixed(2)
  })));
  debugLog(`[Tax Calculator] Total Taxable Events: ${combinedTaxableEvents.length}`);
  
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
  
  debugLog(`[Tax Calculator] CALCULATED TOTALS:`);
  debugLog(`  - Short-term Gains: $${shortTermGains.toFixed(2)}`);
  debugLog(`  - Long-term Gains: $${longTermGains.toFixed(2)}`);
  debugLog(`  - Short-term Losses: $${shortTermLosses.toFixed(2)}`);
  debugLog(`  - Long-term Losses: $${longTermLosses.toFixed(2)}`);
  
  // Warn if totals don't match
  const calculatedTotal = shortTermGains + longTermGains - shortTermLosses - longTermLosses;
  if (Math.abs(calculatedTotal - totalGainLoss) > 0.01) {
    console.warn(`[Tax Calculator] ⚠️  WARNING: Calculated total (${calculatedTotal.toFixed(2)}) doesn't match sum of gain/loss (${totalGainLoss.toFixed(2)})`);
  }

  // M-1 fix: Round all final USD values to cents to avoid float precision drift
  const roundCents = (n: number) => Math.round(n * 100) / 100;
  shortTermGains = roundCents(shortTermGains);
  shortTermLosses = roundCents(shortTermLosses);
  longTermGains = roundCents(longTermGains);
  longTermLosses = roundCents(longTermLosses);

  // Calculate net gains/losses
  const netShortTermGain = roundCents(shortTermGains - shortTermLosses);
  const netLongTermGain = roundCents(longTermGains - longTermLosses);
  const totalNetLoss = Math.max(0, -(netShortTermGain + netLongTermGain));

  // US Tax Law: Capital loss deduction limit varies by filing status (IRC Section 1211)
  // Single/Married Joint/Head of Household: $3,000 per year
  // Married Filing Separately: $1,500 per year
  // Losses can offset gains without limit, but net losses are limited to deduction amount
  const MAX_CAPITAL_LOSS_DEDUCTION = filingStatus === "married_separate" ? 1500 : 3000;
  const deductibleLosses = Math.min(totalNetLoss, MAX_CAPITAL_LOSS_DEDUCTION);
  const lossCarryover = Math.max(0, totalNetLoss - MAX_CAPITAL_LOSS_DEDUCTION);

  // Generate Form 8949 data (required for IRS reporting)
  const form8949Data = generateForm8949Data(combinedTaxableEvents);

  // UK: £3,000 annual exempt amount (Annual Exempt Amount / AEA)
  // Unlike the German Freigrenze (all-or-nothing), the UK allowance is a straight deduction
  // from net gains. The first £3,000 of gains are tax-free.
  const totalTaxableGain =
    (netShortTermGain + netLongTermGain) >= 0
      ? (netShortTermGain + netLongTermGain)
      : -deductibleLosses;
  const annualExemption = country === "UK" ? Math.min(3000, Math.max(0, totalTaxableGain)) : 0;

  // Currency display based on country
  const currency = country === "UK" ? "GBP" : country === "DE" ? "EUR" : "USD";
  const currencySymbol = country === "UK" ? "\u00a3" : country === "DE" ? "\u20ac" : "$";

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
    totalTaxableGain,
    deductibleLosses,
    lossCarryover,
    form8949Data,
    annualExemption,
    currency,
    currencySymbol,
  };
}

/**
 * Compute cost basis and gain/loss for all transactions.
 * Reuses the same lot-tracking logic as processTransactionsForTax().
 * Returns per-transaction results suitable for writing back to DB.
 */
export function computeCostBasisForTransactions(
  transactions: Transaction[],
  method: "FIFO" | "LIFO" | "HIFO",
  walletAddresses: string[] = [],
  perWalletOverride?: boolean,
  country: string = "US",
): TransactionCostBasisResult[] {
  const resultMap = new Map<number, TransactionCostBasisResult>();

  // Use the max year found in data so all transactions pass through the full processing loop
  const maxYear = transactions.length > 0
    ? Math.max(...transactions.map(tx => tx.tx_timestamp.getFullYear()))
    : 9999;

  const perWallet = perWalletOverride !== undefined ? perWalletOverride : maxYear >= 2025;
  if (country === "UK") {
    processTransactionsForTaxUK(transactions, maxYear, walletAddresses, resultMap, "Europe/London");
  } else {
    processTransactionsForTax(transactions, maxYear, method, walletAddresses, resultMap, "America/New_York", perWallet, country);
  }

  return Array.from(resultMap.values());
}

// ---------------------------------------------------------------------------
// UK Share Pooling — Section 104, Same-Day & 30-Day Bed & Breakfast Rules
// ---------------------------------------------------------------------------

interface Section104Pool {
  quantity: number;
  totalCost: number; // total allowable cost in the pool (GBP/USD — whichever the DB stores)
}

interface UKDisposal {
  id: number;
  date: string; // ISO date string (YYYY-MM-DD) for same-day matching
  asset: string;
  amount: number;
  proceeds: number;
  matched: number; // amount already matched to acquisitions
  tx: Transaction;
}

interface UKAcquisition {
  id: number;
  date: string; // ISO date string (YYYY-MM-DD)
  asset: string;
  amount: number;
  cost: number;
  matched: number; // amount already consumed by matching
  tx: Transaction;
}

/** Strip time from a Date, returning a YYYY-MM-DD string in the given tz. */
function toDateKey(d: Date, timezone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
    return parts; // en-CA already gives YYYY-MM-DD
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

/** Check if dateB is within 30 calendar days AFTER dateA (B > A and B <= A+30). */
function isWithin30DaysAfter(dateA: string, dateB: string): boolean {
  const a = new Date(dateA + "T00:00:00Z");
  const b = new Date(dateB + "T00:00:00Z");
  const diffMs = b.getTime() - a.getTime();
  return diffMs > 0 && diffMs <= 30 * 24 * 60 * 60 * 1000;
}

/**
 * UK Share Pooling tax processor.
 *
 * Implements the mandatory 3-tier matching system:
 *   1. Same-Day Rule
 *   2. 30-Day Bed & Breakfast Rule (forward-looking)
 *   3. Section 104 Pool (weighted-average cost)
 *
 * The function mirrors the signature / return shape of processTransactionsForTax
 * so callers can swap between them based on country.
 */
function processTransactionsForTaxUK(
  transactions: Transaction[],
  taxYear: number,
  walletAddresses: string[] = [],
  costBasisResults?: Map<number, TransactionCostBasisResult>,
  timezone: string = "Europe/London",
): {
  taxableEvents: TaxableEvent[];
  incomeEvents: IncomeEvent[];
} {
  const taxableEvents: TaxableEvent[] = [];
  const incomeEvents: IncomeEvent[] = [];

  // Section 104 pools keyed by asset symbol (upper-cased)
  const pools: Record<string, Section104Pool> = {};
  // Collected disposals & acquisitions for the two-pass matching
  const disposals: UKDisposal[] = [];
  const acquisitions: UKAcquisition[] = [];

  const FIAT_CURRENCIES = new Set(["USD", "EUR", "GBP", "CAD", "AUD", "JPY", "CHF", "CNY", "INR", "KRW", "BRL", "MXN"]);

  // ---------- Pass 1: Collect disposals / acquisitions & build Section 104 pool ----------
  for (const tx of transactions) {
    const asset = (tx.asset_symbol || "").trim().toUpperCase();
    const amount = Math.abs(Number(tx.amount_value));
    const valueUsd = Number(tx.value_usd);
    const feeUsd = tx.fee_usd ? Math.abs(Number(tx.fee_usd)) : 0;
    const date = tx.tx_timestamp;
    const dateKey = toDateKey(date, timezone);
    const txType = (tx.type || "").toLowerCase();

    // Skip fiat
    if (FIAT_CURRENCIES.has(asset)) {
      if (costBasisResults) costBasisResults.set(tx.id, { transactionId: tx.id, costBasisUsd: null, gainLossUsd: null });
      continue;
    }

    // --- Transfer / self-transfer detection (reuse existing helpers) ---
    if (isTransferSkip(tx.type || "")) {
      const typeUpper = (tx.type || "").toUpperCase();
      const isSelfTransfer = typeUpper === "TRANSFER_SELF" || (
        tx.counterparty_address && walletAddresses.some(addr =>
          addr.toLowerCase() === tx.counterparty_address?.toLowerCase()
        )
      );
      if (typeUpper === "TRANSFER_IN" && !isSelfTransfer) {
        // fall through to acquisition logic below
      } else if (typeUpper === "TRANSFER_OUT" && !isSelfTransfer) {
        if (tx.subtype === "dca_deposit" || Math.abs(valueUsd) < 0.01) {
          if (costBasisResults) costBasisResults.set(tx.id, { transactionId: tx.id, costBasisUsd: null, gainLossUsd: null });
          continue;
        }
        // fall through to disposal logic below
      } else {
        // True self-transfer — skip
        if (costBasisResults) costBasisResults.set(tx.id, { transactionId: tx.id, costBasisUsd: null, gainLossUsd: null });
        continue;
      }
    }

    // Skip economically neutral types
    if (["self", "approve", "nft activity", "defi setup", "zero transaction", "spam",
         "unstake", "unstaking", "deposit", "withdraw", "borrow", "repay",
         "wrap", "unwrap", "bridge"].includes(txType)) {
      if (costBasisResults) costBasisResults.set(tx.id, { transactionId: tx.id, costBasisUsd: null, gainLossUsd: null });
      continue;
    }

    // --- Determine if acquisition or disposal ---
    const isIncomeTx = tx.is_income || getCategory(tx.type || "") === "income" ||
      ["staking reward", "staking", "reward", "airdrop", "mining", "yield",
       "interest", "claim_rewards", "harvest", "payout", "fund_reward",
       "yield farming", "farm reward"].includes(txType);

    const isBuy = isTaxableBuy(tx.type || "");
    const isSell = isTaxableSell(tx.type || "");
    const isSwap = getCategory(tx.type || "") === "swap" || txType === "nft_purchase" || txType === "nft_sale";
    const isReceive = txType === "receive" || txType === "transfer_in";
    const isSend = txType === "send" || txType === "transfer_out";
    const isBurn = txType === "burn";
    const isLPAdd = ["liquidity providing", "liquidity add", "add liquidity"].includes(txType);
    const isLPRemove = ["liquidity removal", "liquidity remove", "liquidity exit", "remove liquidity"].includes(txType);
    const isMarginBuy = txType === "margin buy";
    const isMarginSell = txType === "margin sell";
    const isLiquidation = txType === "liquidation";

    // --- Income ---
    if (isIncomeTx) {
      const incValue = Math.abs(valueUsd);
      if (!pools[asset]) pools[asset] = { quantity: 0, totalCost: 0 };
      if (incValue > 0) {
        pools[asset].quantity += amount;
        pools[asset].totalCost += incValue;
        acquisitions.push({ id: tx.id, date: dateKey, asset, amount, cost: incValue, matched: 0, tx });
      }
      const txYear = getTaxYear(date, timezone);
      if (txYear === taxYear && incValue > 0) {
        let incomeType: IncomeEvent["type"] = "other";
        if (txType === "staking reward" || txType === "staking") incomeType = "staking";
        else if (txType === "reward") incomeType = "reward";
        else if (txType === "airdrop") incomeType = "airdrop";
        else if (txType === "mining") incomeType = "mining";
        incomeEvents.push({ id: tx.id, date, asset, amount, valueUsd: incValue, type: incomeType, chain: tx.chain || undefined, txHash: tx.tx_hash || undefined });
      }
      if (costBasisResults) costBasisResults.set(tx.id, { transactionId: tx.id, costBasisUsd: incValue, gainLossUsd: null });
      continue;
    }

    // --- Buy / Margin Buy / Receive / LP Add (Acquisition) ---
    if (isBuy || isMarginBuy || isReceive || isLPAdd) {
      const cost = Math.abs(valueUsd) + (isBuy || isMarginBuy ? feeUsd : 0);
      if (!pools[asset]) pools[asset] = { quantity: 0, totalCost: 0 };
      pools[asset].quantity += amount;
      pools[asset].totalCost += cost;
      acquisitions.push({ id: tx.id, date: dateKey, asset, amount, cost, matched: 0, tx });
      if (costBasisResults) costBasisResults.set(tx.id, { transactionId: tx.id, costBasisUsd: cost, gainLossUsd: 0 });
      continue;
    }

    // --- Swap (disposal of outgoing + acquisition of incoming) ---
    if (isSwap) {
      // Outgoing side — disposal
      let outgoingAsset = asset;
      let outgoingAmount = amount;
      let incomingAsset = tx.incoming_asset_symbol ? tx.incoming_asset_symbol.trim().toUpperCase() : null;
      let incomingAmount = tx.incoming_amount_value ? Number(tx.incoming_amount_value) : null;
      let incomingValueUsd = tx.incoming_value_usd ? Number(tx.incoming_value_usd) : null;

      if (!incomingAsset || !incomingAmount) {
        const swapInfo = parseSwapTransaction(tx);
        outgoingAsset = swapInfo.outgoingAsset ? swapInfo.outgoingAsset.trim().toUpperCase() : asset;
        incomingAsset = swapInfo.incomingAsset ? swapInfo.incomingAsset.trim().toUpperCase() : incomingAsset;
        outgoingAmount = swapInfo.outgoingAmount || amount;
        incomingAmount = swapInfo.incomingAmount || incomingAmount;
        incomingValueUsd = swapInfo.incomingValueUsd || incomingValueUsd;
      }

      const swapProceeds = (valueUsd === 0 && incomingValueUsd && incomingValueUsd > 0)
        ? Math.abs(incomingValueUsd)
        : valueUsd;
      const isCSVImport = tx.source_type === "csv_import";
      const netProceeds = isCSVImport ? Math.abs(swapProceeds) : Math.abs(swapProceeds) - feeUsd;

      disposals.push({ id: tx.id, date: dateKey, asset: outgoingAsset, amount: outgoingAmount, proceeds: Math.max(0, netProceeds), matched: 0, tx });

      // Incoming side — acquisition
      if (incomingAsset && incomingAmount) {
        const inCost = incomingValueUsd ? Math.abs(incomingValueUsd) : Math.abs(valueUsd);
        if (!pools[incomingAsset]) pools[incomingAsset] = { quantity: 0, totalCost: 0 };
        pools[incomingAsset].quantity += incomingAmount;
        pools[incomingAsset].totalCost += inCost;
        acquisitions.push({ id: tx.id, date: dateKey, asset: incomingAsset, amount: incomingAmount, cost: inCost, matched: 0, tx });
      }
      // costBasisResults will be set in Pass 2 after matching
      continue;
    }

    // --- Sell / Margin Sell / Liquidation / Send / LP Remove / Burn (Disposal) ---
    if (isSell || isMarginSell || isLiquidation || isSend || isLPRemove || isBurn) {
      // Self-transfer detection for send
      if (isSend) {
        const isSelfTransfer = (
          tx.notes?.toLowerCase().includes("self transfer") ||
          tx.notes?.toLowerCase().includes("internal transfer") ||
          (tx.counterparty_address && walletAddresses.some(addr =>
            addr.toLowerCase() === tx.counterparty_address?.toLowerCase()
          )) ||
          (tx.counterparty_address && STAKING_CONTRACT_ADDRESSES.has(tx.counterparty_address))
        );
        if (isSelfTransfer || valueUsd === 0) {
          if (costBasisResults) costBasisResults.set(tx.id, { transactionId: tx.id, costBasisUsd: null, gainLossUsd: null });
          continue;
        }
      }

      const grossProceeds = isBurn ? 0 : (valueUsd >= 0 ? valueUsd : Math.abs(valueUsd));
      const isCSVImport = tx.source_type === "csv_import";
      const netProceeds = isCSVImport ? grossProceeds : grossProceeds - feeUsd;

      disposals.push({ id: tx.id, date: dateKey, asset, amount, proceeds: Math.max(0, netProceeds), matched: 0, tx });
      continue;
    }

    // Fallback: skip
    if (costBasisResults) costBasisResults.set(tx.id, { transactionId: tx.id, costBasisUsd: null, gainLossUsd: null });
  }

  // ---------- Pass 2: Match disposals using UK 3-tier rules ----------
  for (const disposal of disposals) {
    const asset = disposal.asset;
    let unmatched = disposal.amount - disposal.matched;
    let totalCostBasis = 0;

    if (!pools[asset]) pools[asset] = { quantity: 0, totalCost: 0 };

    // --- Rule 1: Same-Day matching ---
    for (const acq of acquisitions) {
      if (unmatched <= 0) break;
      if (acq.asset !== asset || acq.date !== disposal.date) continue;
      const available = acq.amount - acq.matched;
      if (available <= 0) continue;
      const matchQty = Math.min(unmatched, available);
      const matchCost = acq.amount > 0 ? (acq.cost * matchQty / acq.amount) : 0;
      totalCostBasis += matchCost;
      acq.matched += matchQty;
      disposal.matched += matchQty;
      unmatched -= matchQty;
      // Remove matched amount from Section 104 pool (it was added in Pass 1)
      pools[asset].quantity -= matchQty;
      pools[asset].totalCost -= matchCost;
    }

    // --- Rule 2: 30-Day B&B matching (acquisitions within next 30 days, FIFO) ---
    for (const acq of acquisitions) {
      if (unmatched <= 0) break;
      if (acq.asset !== asset) continue;
      if (!isWithin30DaysAfter(disposal.date, acq.date)) continue;
      const available = acq.amount - acq.matched;
      if (available <= 0) continue;
      const matchQty = Math.min(unmatched, available);
      const matchCost = acq.amount > 0 ? (acq.cost * matchQty / acq.amount) : 0;
      totalCostBasis += matchCost;
      acq.matched += matchQty;
      disposal.matched += matchQty;
      unmatched -= matchQty;
      // Remove matched amount from Section 104 pool
      pools[asset].quantity -= matchQty;
      pools[asset].totalCost -= matchCost;
    }

    // --- Rule 3: Section 104 Pool ---
    if (unmatched > 0 && pools[asset].quantity > 0) {
      const poolQty = Math.min(unmatched, pools[asset].quantity);
      const avgCost = pools[asset].quantity > 0
        ? (pools[asset].totalCost / pools[asset].quantity)
        : 0;
      const poolCost = avgCost * poolQty;
      totalCostBasis += poolCost;
      pools[asset].quantity -= poolQty;
      pools[asset].totalCost -= poolCost;
      disposal.matched += poolQty;
      unmatched -= poolQty;
    }

    // Stablecoin override
    const bareAsset = asset.includes(":") ? asset.split(":").pop()! : asset;
    if (STABLECOINS.has(bareAsset)) {
      totalCostBasis = disposal.proceeds;
    }

    totalCostBasis = Math.round(totalCostBasis * 100) / 100;
    const netProceeds = Math.round(disposal.proceeds * 100) / 100;
    const gainLoss = Math.round((netProceeds - totalCostBasis) * 100) / 100;

    // Persist cost basis result for every disposal
    if (costBasisResults) {
      costBasisResults.set(disposal.id, { transactionId: disposal.id, costBasisUsd: totalCostBasis, gainLossUsd: gainLoss });
    }

    // Only emit taxable events for the requested tax year
    const txYear = getTaxYear(disposal.tx.tx_timestamp, timezone);
    if (txYear === taxYear) {
      taxableEvents.push({
        id: disposal.id,
        date: disposal.tx.tx_timestamp,
        dateAcquired: undefined, // UK pooling has no single acquisition date
        asset,
        amount: disposal.amount,
        proceeds: netProceeds,
        costBasis: totalCostBasis,
        gainLoss,
        holdingPeriod: "short", // UK has no short/long distinction
        chain: disposal.tx.chain || undefined,
        txHash: disposal.tx.tx_hash || undefined,
        source: disposal.tx.source || undefined,
        washSale: false,
        washSaleAdjustment: undefined,
      });
    }
  }

  debugLog(`[processTransactionsForTaxUK] Complete: ${disposals.length} disposals, ${acquisitions.length} acquisitions, ${taxableEvents.length} taxable events, ${incomeEvents.length} income events`);
  return { taxableEvents, incomeEvents };
}

/**
 * Process transactions to calculate taxable events and income
 */
function processTransactionsForTax(
  transactions: Transaction[],
  taxYear: number,
  method: "FIFO" | "LIFO" | "HIFO",
  walletAddresses: string[] = [], // For detecting self-transfers
  costBasisResults?: Map<number, TransactionCostBasisResult>, // Per-transaction cost basis collector
  timezone: string = "America/New_York", // User's timezone for year boundary determination
  perWallet: boolean = false,
  country: string = "US"
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
  
  // Track buy transactions for wash sale detection (buys that occur before loss sales)
  const buyTransactions: BuyTransaction[] = [];

  // C-1 fix: Track cost basis consumed by sends so self-transfer receives can carry
  // forward the original cost basis instead of using FMV.
  // Key: tx_hash or counterparty_address, Value: consumed lots
  const pendingTransferBasis: Map<string, { costBasis: number; lots: Array<{ date: Date; amount: number; costBasis: number }> }> = new Map();

  // Process transactions chronologically
  debugLog(`[processTransactionsForTax] Processing ${transactions.length} transactions for tax year ${taxYear}`);
  
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
  debugLog(`[processTransactionsForTax] Transactions by year:`, transactionsByYear);
  
  // Count sell transactions by year
  const sellTransactionsByYear: Record<number, number> = {};
  transactions.filter(tx => (tx.type || "").toLowerCase() === "sell").forEach(tx => {
    const year = tx.tx_timestamp.getFullYear();
    sellTransactionsByYear[year] = (sellTransactionsByYear[year] || 0) + 1;
  });
  debugLog(`[processTransactionsForTax] Sell transactions by year:`, sellTransactionsByYear);

  // List of fiat currencies to exclude from tax calculations
  // Bank transfers and fiat currency movements are not taxable crypto events
  const FIAT_CURRENCIES = new Set(["USD", "EUR", "GBP", "CAD", "AUD", "JPY", "CHF", "CNY", "INR", "KRW", "BRL", "MXN"]);

  for (const tx of transactions) {
    processedCount++;
    // Normalize asset symbol: trim whitespace and convert to uppercase for consistent matching
    // This ensures "BTC", "btc", "BTC " all match the same asset
    const asset = (tx.asset_symbol || "").trim().toUpperCase();
    const txWallet = tx.wallet_address || null;
    const lk = lotKey(asset, txWallet, perWallet);
    // H-5 fix: Guard negative amounts — some CSV imports encode sells as negative
    // amounts. Cost basis lot tracking requires positive quantities.
    const amount = Math.abs(Number(tx.amount_value));
    const valueUsd = Number(tx.value_usd);
    const feeUsd = tx.fee_usd ? Math.abs(Number(tx.fee_usd)) : 0;
    const pricePerUnit = tx.price_per_unit
      ? Number(tx.price_per_unit)
      : amount > 0 ? valueUsd / amount : 0;
    const date = tx.tx_timestamp;
    const txYear = getTaxYear(date, timezone);

    // Track transaction types
    const txType = (tx.type || "").toLowerCase();
    typeCounts[txType] = (typeCounts[txType] || 0) + 1;

    // Skip fiat currency transactions (bank transfers)
    // These are not crypto transactions and should not be included in tax calculations
    if (FIAT_CURRENCIES.has(asset)) {
      if (processedCount < 20) {
        debugLog(`[Tax Calculator] Skipping fiat currency transaction: ${tx.type} ${amount} ${asset}`);
      }
      if (costBasisResults) {
        costBasisResults.set(tx.id, { transactionId: tx.id, costBasisUsd: null, gainLossUsd: null });
      }
      continue;
    }

    // Remap TRANSFER_IN/TRANSFER_OUT to receive/send so they go through
    // proper cost basis handling. Only skip true self-transfers (TRANSFER_SELF)
    // and generic "transfer" types with no direction.
    if (isTransferSkip(tx.type || "")) {
      const typeUpper = (tx.type || "").toUpperCase();
      const isSelfTransfer = typeUpper === "TRANSFER_SELF" || (
        tx.counterparty_address && walletAddresses.some(addr =>
          addr.toLowerCase() === tx.counterparty_address?.toLowerCase()
        )
      );

      if (typeUpper === "TRANSFER_IN" && !isSelfTransfer) {
        // External transfer in = acquisition, remap to "receive" handler
        typeCounts["receive"] = (typeCounts["receive"] || 0) + 1;
        typeCounts[txType] = (typeCounts[txType] || 1) - 1;
        // Fall through — the receive branch below will handle it
      } else if (typeUpper === "TRANSFER_OUT" && !isSelfTransfer) {
        // Skip DCA vault deposits — the actual disposals are captured as SWAP transactions.
        // These TRANSFER_OUTs just move tokens into the Jupiter DCA vault, not a sale.
        if (tx.subtype === "dca_deposit") {
          if (costBasisResults) {
            costBasisResults.set(tx.id, { transactionId: tx.id, costBasisUsd: null, gainLossUsd: null });
          }
          continue;
        }
        // Skip unpriced transfers — treating $0 proceeds as a disposal creates
        // phantom losses AND depletes cost basis lots for subsequent priced swaps.
        // Better to skip and let the lots be consumed by priced events.
        if (Math.abs(valueUsd) < 0.01) {
          if (costBasisResults) {
            costBasisResults.set(tx.id, { transactionId: tx.id, costBasisUsd: null, gainLossUsd: null });
          }
          continue;
        }
        // External transfer out = disposal, remap to "send" handler
        typeCounts["send"] = (typeCounts["send"] || 0) + 1;
        typeCounts[txType] = (typeCounts[txType] || 1) - 1;
        // Fall through — the send branch below will handle it
      } else {
        // True self-transfer or generic transfer — skip
        if (costBasisResults) {
          costBasisResults.set(tx.id, { transactionId: tx.id, costBasisUsd: null, gainLossUsd: null });
        }
        continue;
      }
    }

    // If is_income flag is set (from income detection), route to income handler
    // regardless of raw type. This handles INITIALIZE_ACCOUNT airdrops, etc.
    if (tx.is_income && getCategory(tx.type || "") !== "income") {
      if (!costBasisLots[lk]) costBasisLots[lk] = [];

      if (txYear === taxYear && valueUsd > 0) {
        incomeEventCount++;
        incomeEvents.push({
          id: tx.id,
          date,
          asset,
          amount,
          valueUsd: Math.abs(valueUsd),
          type: "airdrop",
          chain: tx.chain || undefined,
          txHash: tx.tx_hash || undefined,
        });
      }

      if (valueUsd > 0) {
        costBasisLots[lk].push({
          id: tx.id,
          date,
          amount,
          costBasis: Math.abs(valueUsd),
          pricePerUnit,
        });
      }

      if (costBasisResults) {
        costBasisResults.set(tx.id, { transactionId: tx.id, costBasisUsd: Math.abs(valueUsd), gainLossUsd: null });
      }
      continue;
    }

    // Log first few sell transactions for debugging
    if (txType === "sell" && processedCount < 10) {
      debugLog(`[processTransactionsForTax] Processing sell transaction ${tx.id}: type=${tx.type}, asset=${asset} (original: "${tx.asset_symbol}"), valueUsd=${valueUsd}, date=${date.toISOString().split('T')[0]}, year=${txYear}, taxYear=${taxYear}, notes=${tx.notes?.substring(0, 150) || "none"}`);
    }

    // Initialize asset lots if needed
    if (!costBasisLots[lk]) {
      costBasisLots[lk] = [];
    }

    // Handle buys - add to cost basis (including fees per IRS rules)
    // NFT Purchase is treated as a buy (cost basis for future sale)
    if (isTaxableBuy(tx.type || "")) {
      // IRS Rule: Fees are added to cost basis for purchases
      // For CSV imports with tax report format, value_usd is NEGATIVE (cost basis as negative value)
      // For standard format, value_usd might be negative, so use absolute value
      // IMPORTANT: value_usd for buys from CSV is negative (cost.neg()), so we need Math.abs
      let totalCostBasis = Math.abs(valueUsd) + feeUsd;
      
      // Check for wash sale: if this buy is within 30 days of a previous loss sale, apply wash sale rules
      const washSaleAdjustment = checkWashSale(lk, date, amount, lossSales);
      if (washSaleAdjustment > 0) {
        // Add disallowed loss to cost basis of replacement shares
        totalCostBasis += washSaleAdjustment;
        debugLog(`[Wash Sale] Buy transaction ${tx.id}: Added $${washSaleAdjustment.toFixed(2)} wash sale adjustment to cost basis. New cost basis: $${totalCostBasis.toFixed(2)}`);
      }

      // Log if this is a CSV import buy to verify it's being processed
      if (tx.source_type === "csv_import" && processedCount < 20) {
        debugLog(`[processTransactionsForTax] Processing CSV buy ${tx.id}: asset=${asset}, value_usd=${valueUsd}, totalCostBasis=${totalCostBasis}, date=${date.toISOString().split('T')[0]}, year=${txYear}`);
      }
      costBasisLots[lk].push({
        id: tx.id,
        date,
        amount,
        costBasis: totalCostBasis, // Cost basis includes purchase price + fees + wash sale adjustment
        // H-4 fix: pricePerUnit must reflect actual cost basis (including fees + wash sale)
        // so that lot consumption computes correct per-unit cost basis.
        pricePerUnit: amount > 0 ? totalCostBasis / amount : 0,
        fees: feeUsd, // Track fees separately for reference
        washSaleAdjustment: washSaleAdjustment > 0 ? washSaleAdjustment : undefined,
      });

      // Track buy transaction for wash sale detection (buys before loss sales)
      buyTransactions.push({
        id: tx.id,
        date,
        asset: lk,
        amount,
        costBasis: totalCostBasis,
        lotId: tx.id,
      });

      if (processedCount < 10 || costBasisLots[lk].length <= 3) {
        debugLog(`[processTransactionsForTax] Added buy transaction ${tx.id} to cost basis: asset=${asset} (original: "${tx.asset_symbol}"), amount=${amount}, costBasis=${totalCostBasis}, date=${date.toISOString().split('T')[0]}, lotsForAsset=${costBasisLots[lk].length}`);
      }

      if (costBasisResults) {
        costBasisResults.set(tx.id, { transactionId: tx.id, costBasisUsd: totalCostBasis, gainLossUsd: 0 });
      }
    }
    // Handle sells - calculate capital gains/losses
    // NFT Sale is treated as a sell (taxable disposal event)
    else if (isTaxableSell(tx.type || "")) {
      // Use the processDisposal helper to calculate disposal details
      const disposal = processDisposal(
        tx,
        lk,
        amount,
        valueUsd,
        feeUsd,
        date,
        costBasisLots,
        method,
        processedCount,
        taxableEventCount,
        country
      );

      // Track loss sales for wash sale detection (before checking tax year)
      if (disposal.shouldTrackAsLossSale) {
        lossSales.push({
          id: tx.id,
          date,
          asset: lk,
          amount,
          lossAmount: Math.abs(disposal.gainLoss),
          costBasis: disposal.totalCostBasis,
          proceeds: disposal.netProceeds,
          holdingPeriod: disposal.holdingPeriod,
          remainingLoss: Math.abs(disposal.gainLoss),
        });
      }

      if (costBasisResults) {
        costBasisResults.set(tx.id, { transactionId: tx.id, costBasisUsd: disposal.totalCostBasis, gainLossUsd: disposal.gainLoss });
      }

      // Only include in tax year if the sale occurred in that year
      if (txYear === taxYear) {
        // Warn if we don't have cost basis and no matching buy transactions
        const hasCostBasisInNotes = tx.notes?.includes("Cost Basis:") || false;
        const availableAssets = Object.keys(costBasisLots).filter(k => costBasisLots[k].length > 0);

        if (disposal.totalCostBasis === 0 && !hasCostBasisInNotes && costBasisLots[lk]?.length === 0) {
          // Check if this might be from income/airdrops (expected zero cost basis scenario)
          const hasIncomeForAsset = incomeEvents.some(e =>
            e.asset.toUpperCase() === asset.toUpperCase() &&
            e.date <= date // Income occurred before or at sale date
          );

          if (taxableEventCount < 20) {
            if (hasIncomeForAsset) {
              debugLog(`[Tax Calculator] ℹ️  Sell transaction ${tx.id} has zero cost basis, but income was recorded for "${asset}".`);
              debugLog(`  - This is expected if you received "${asset}" as income/airdrop and sold it without buying more.`);
              debugLog(`  - Cost basis should equal the income value when received. Verify income events are correct.`);
            } else {
              console.warn(`[Tax Calculator] ⚠️  Sell transaction ${tx.id} has NO cost basis and NO matching buy/income transactions!`);
              console.warn(`  - Asset: "${asset}" (original: "${tx.asset_symbol}")`);
              console.warn(`  - Date: ${date.toISOString().split('T')[0]}`);
              console.warn(`  - Proceeds: $${disposal.netProceeds.toFixed(2)}`);
              console.warn(`  - Available assets with lots: ${availableAssets.length > 0 ? availableAssets.join(", ") : "NONE"}`);
              console.warn(`  - This sell will show as 100% gain (proceeds = gain), which may be incorrect!`);
            }
          }
        }

        if (taxableEventCount < 10 || (disposal.totalCostBasis === 0 && taxableEventCount < 20)) {
          debugLog(`[Tax Calculator] Including taxable event: asset=${asset}, proceeds=${disposal.netProceeds}, costBasis=${disposal.totalCostBasis}, gainLoss=${disposal.gainLoss}, holdingPeriod=${disposal.holdingPeriod}, year=${txYear}`);
        }

        const events = createDisposalTaxEvents(tx, asset, amount, disposal, date);
        for (const event of events) {
          taxableEventCount++;
          taxableEvents.push(event);
        }
      } else {
        if (processedCount < 20 && txType === "sell") {
          debugLog(`[Tax Calculator] Skipping sell transaction ${tx.id}: year mismatch (txYear=${txYear}, taxYear=${taxYear}), date=${date.toISOString().split('T')[0]}, asset=${asset}`);
        }
      }
    }
    // Handle swaps - treat as sell of one asset and buy of another
    // IRS: Swaps are taxable events (like-kind exchange rules eliminated for crypto after 2017)
    // NFT trades are two-sided (SOL↔NFT) and handled identically to swaps
    else if (getCategory(tx.type || "") === "swap" || txType === "nft_purchase" || txType === "nft_sale") {
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
      const inLk = incomingAsset ? lotKey(incomingAsset, txWallet, perWallet) : null;
      if (inLk && !costBasisLots[inLk]) {
        costBasisLots[inLk] = [];
      }

      // For swaps, both sides are equal in value. If the outgoing asset is unpriced
      // (value_usd = 0) but the incoming side has a known value, use that as proceeds.
      const swapProceeds = (valueUsd === 0 && incomingValueUsd && incomingValueUsd > 0)
        ? Math.abs(incomingValueUsd)
        : valueUsd;

      // Handle outgoing asset disposal using processDisposal for consistency
      // This ensures: fee deduction, rounding, lotDisposals tracking, mixed holding period split
      const disposal = processDisposal(
        tx,
        lk,
        outgoingAmount,
        swapProceeds,
        feeUsd,
        date,
        costBasisLots,
        method,
        processedCount,
        taxableEventCount,
        country
      );

      // Track loss sales for wash sale detection
      if (disposal.shouldTrackAsLossSale) {
        lossSales.push({
          id: tx.id,
          date,
          asset: lk,
          amount: outgoingAmount,
          lossAmount: Math.abs(disposal.gainLoss),
          costBasis: disposal.totalCostBasis,
          proceeds: disposal.netProceeds,
          holdingPeriod: disposal.holdingPeriod,
          remainingLoss: Math.abs(disposal.gainLoss),
        });
      }

      if (costBasisResults) {
        costBasisResults.set(tx.id, { transactionId: tx.id, costBasisUsd: disposal.totalCostBasis, gainLossUsd: disposal.gainLoss });
      }

      // Create taxable events with proper holding period splitting
      if (txYear === taxYear) {
        const events = createDisposalTaxEvents(tx, outgoingAsset, outgoingAmount, disposal, date);
        for (const event of events) {
          taxableEventCount++;
          taxableEvents.push(event);
        }
      }

      // Handle incoming asset acquisition (adds to cost basis)
      // IRS: Incoming cost basis = FMV of acquired asset. Fees are already deducted
      // from proceeds on the disposal side (netProceeds above), so they are NOT added
      // here to avoid double-counting.
      if (incomingAsset && inLk && incomingAmount && incomingValueUsd) {
        const incomingCostBasis = Math.abs(incomingValueUsd);
        const incomingPricePerUnit = incomingCostBasis / incomingAmount;
        costBasisLots[inLk].push({
          id: tx.id,
          date,
          amount: incomingAmount,
          costBasis: incomingCostBasis,
          pricePerUnit: incomingPricePerUnit,
        });
        // H-3 fix: Track swap incoming as a buy for wash sale detection
        buyTransactions.push({
          id: tx.id, date, asset: inLk,
          amount: incomingAmount, costBasis: incomingCostBasis, lotId: tx.id,
        });
      } else if (incomingAsset && inLk && incomingAmount) {
        // Fallback: use value_usd if incoming value not parsed
        const incomingCostBasis = Math.abs(valueUsd);
        const incomingPricePerUnit = incomingCostBasis / incomingAmount;
        costBasisLots[inLk].push({
          id: tx.id,
          date,
          amount: incomingAmount,
          costBasis: incomingCostBasis,
          pricePerUnit: incomingPricePerUnit,
        });
        // H-3 fix: Track swap incoming as a buy for wash sale detection
        buyTransactions.push({
          id: tx.id, date, asset: inLk,
          amount: incomingAmount, costBasis: incomingCostBasis, lotId: tx.id,
        });
      } else {
        // H-6 fix: No incoming asset data — use outgoing FMV as cost basis estimate
        // for the incoming token. This prevents zero cost basis which would cause
        // over-reported gains when the received token is eventually sold.
        // In a fair swap, outgoing FMV ≈ incoming FMV.
        const estimatedCostBasis = Math.abs(valueUsd);
        debugLog(`[Tax Calculator] Swap ${tx.id}: No incoming asset data. Using outgoing FMV ($${estimatedCostBasis.toFixed(2)}) as estimated cost basis for received token.`);
        if (!incomingAsset || !inLk) {
          debugLog(`[Tax Calculator] ⚠️  Swap ${tx.id}: Cannot determine incoming asset symbol. User should review and manually assign cost basis.`);
        } else {
          // We have the asset symbol but no amount — estimate amount from outgoing
          const estimatedAmount = incomingAmount || amount; // Best guess: same quantity
          costBasisLots[inLk].push({
            id: tx.id,
            date,
            amount: estimatedAmount,
            costBasis: estimatedCostBasis,
            pricePerUnit: estimatedAmount > 0 ? estimatedCostBasis / estimatedAmount : 0,
          });
        }
      }
    }
    // Handle income events (explicit income types only)
    // IRS: Income is taxable when received at fair market value
    // H-5 fix: Only explicit income types generate income events.
    // Plain "receive" is handled separately below — it creates a cost basis
    // lot but does NOT generate an income event (it could be a transfer from
    // another wallet, an exchange withdrawal, etc.).
    else if (
      txType === "staking reward" ||
      txType === "staking" ||
      txType === "reward" ||
      txType === "airdrop" ||
      txType === "mining" ||
      txType === "yield" ||
      txType === "interest" ||
      txType === "claim_rewards" ||
      txType === "harvest" ||
      txType === "payout" ||
      txType === "fund_reward" ||
      getCategory(tx.type || "") === "income"
    ) {
      // Determine income type per IRS guidance
      let incomeType: IncomeEvent["type"] = "other";
      if (txType === "staking reward" || txType === "staking") {
        incomeType = "staking";
      } else if (txType === "reward") {
        incomeType = "reward";
      } else if (txType === "airdrop") {
        incomeType = "airdrop";
      } else if (txType === "mining") {
        incomeType = "mining";
      } else if (txType === "yield" || txType === "interest") {
        incomeType = "reward";
      }

      // Only count as income if it occurred in the tax year and has positive value
      if (txYear === taxYear && valueUsd > 0) {
        incomeEventCount++;
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
      if (valueUsd > 0) {
        costBasisLots[lk].push({
          id: tx.id,
          date,
          amount,
          costBasis: Math.abs(valueUsd),
          pricePerUnit,
        });
      }

      // Cost basis = FMV at receipt (becomes basis for future capital gains)
      if (costBasisResults) {
        costBasisResults.set(tx.id, { transactionId: tx.id, costBasisUsd: Math.abs(valueUsd), gainLossUsd: null });
      }
    }
    // H-5 fix: Handle "receive" separately — non-income transfer by default.
    // Creates a cost basis lot at FMV for tracking purposes, but does NOT
    // generate an income event. Self-transfer detection still applies.
    else if (txType === "receive" || txType === "transfer_in") {
      // Check if this is a self-transfer (sender address is in user's wallets or is a known staking contract)
      const isSelfTransfer = (
        tx.notes?.toLowerCase().includes("self transfer") ||
        tx.notes?.toLowerCase().includes("internal transfer") ||
        (tx.counterparty_address && walletAddresses.some(addr =>
          addr.toLowerCase() === tx.counterparty_address?.toLowerCase()
        )) ||
        (tx.counterparty_address && STAKING_CONTRACT_ADDRESSES.has(tx.counterparty_address)) ||
        false
      );

      if (isSelfTransfer) {
        // C-1 fix: Self-transfers carry forward the ORIGINAL cost basis from the
        // send side, not FMV. Look up pending transfer basis first.
        const transferKey = tx.tx_hash || tx.counterparty_address;
        const pendingBasis = transferKey ? pendingTransferBasis.get(`${transferKey}:${asset}`) : null;

        if (pendingBasis && pendingBasis.lots.length > 0) {
          // Re-create cost basis lots from the original send's consumed lots
          // into the destination wallet's pool
          for (const lot of pendingBasis.lots) {
            costBasisLots[lk].push({
              id: tx.id,
              date: lot.date, // Original acquisition date preserved
              amount: lot.amount,
              costBasis: lot.costBasis, // Original cost basis, not FMV
              pricePerUnit: lot.amount > 0 ? lot.costBasis / lot.amount : 0,
            });
          }
          // Clean up
          if (transferKey) pendingTransferBasis.delete(`${transferKey}:${asset}`);
        } else if (perWallet) {
          // Per-wallet mode: no pending basis found — create FMV fallback lot
          // in the destination wallet's pool
          if (valueUsd > 0) {
            costBasisLots[lk].push({
              id: tx.id,
              date,
              amount,
              costBasis: Math.abs(valueUsd),
              pricePerUnit,
            });
          }
          debugLog(`[Tax Calculator] Receive ${tx.id}: Self-transfer (per-wallet) — created FMV fallback lot in destination wallet.`);
        } else {
          // H-2 fix: If send handler preserved lots (self-transfer), this receive
          // is a no-op — the lots are already in place. Only create a new lot if
          // there's genuinely no cost basis data for this asset at all.
          debugLog(`[Tax Calculator] Receive ${tx.id}: Self-transfer — cost basis already preserved from send side.`);
        }
      } else {
        // Not a self-transfer: create cost basis lot at FMV but NO income event.
        // The user may later reclassify this as income if appropriate.
        if (valueUsd > 0) {
          costBasisLots[lk].push({
            id: tx.id,
            date,
            amount,
            costBasis: Math.abs(valueUsd),
            pricePerUnit,
          });
        }
      }
      if (costBasisResults) {
        costBasisResults.set(tx.id, { transactionId: tx.id, costBasisUsd: Math.abs(valueUsd), gainLossUsd: null });
      }
    }
    // H-2 fix: Detect self-transfer BEFORE consuming lots.
    // Sends to own wallets = non-taxable transfer (cost basis preserved in place)
    // Sends to others = cost basis consumed (gift or transfer out)
    else if (txType === "send" || txType === "transfer_out") {
      const isSelfTransfer = (
        tx.notes?.toLowerCase().includes("self transfer") ||
        tx.notes?.toLowerCase().includes("internal transfer") ||
        (tx.counterparty_address && walletAddresses.some(addr =>
          addr.toLowerCase() === tx.counterparty_address?.toLowerCase()
        )) ||
        (tx.counterparty_address && STAKING_CONTRACT_ADDRESSES.has(tx.counterparty_address)) ||
        false
      );

      if (isSelfTransfer) {
        if (perWallet) {
          // Per-wallet mode: extract lots from source wallet's pool and store
          // them in pendingTransferBasis for the receive side to pick up.
          const selectedLots = selectLots(costBasisLots[lk] || [], amount, method);
          const transferLots: Array<{ date: Date; amount: number; costBasis: number }> = [];
          let remainingToMove = amount;
          for (const lot of selectedLots) {
            if (remainingToMove <= 0) break;
            const amountFromLot = Math.min(remainingToMove, lot.amount);
            const costBasisPerUnit = lot.amount > 0 ? lot.costBasis / lot.amount : 0;
            const costBasisFromLot = costBasisPerUnit * amountFromLot;
            transferLots.push({ date: lot.date, amount: amountFromLot, costBasis: costBasisFromLot });
            lot.amount -= amountFromLot;
            lot.costBasis -= costBasisFromLot;
            remainingToMove -= amountFromLot;
          }
          // Remove empty lots from source pool
          if (costBasisLots[lk]) {
            costBasisLots[lk] = costBasisLots[lk].filter((lot) => lot.amount > 0);
          }
          // Store for the receive side (keyed by bare asset for cross-wallet matching)
          const transferKey = tx.tx_hash || tx.counterparty_address;
          if (transferKey) {
            const totalCostBasis = transferLots.reduce((s, l) => s + l.costBasis, 0);
            pendingTransferBasis.set(`${transferKey}:${asset}`, {
              costBasis: totalCostBasis,
              lots: transferLots,
            });
          }
          debugLog(`[Tax Calculator] Send ${tx.id}: Self-transfer (per-wallet) of ${amount} ${asset} — extracted ${transferLots.length} lots from source wallet.`);
        } else {
          // Universal mode: cost basis lots remain untouched — the user still owns
          // the tokens on a different wallet. The receive side should be a no-op.
          debugLog(`[Tax Calculator] Send ${tx.id}: Self-transfer of ${amount} ${asset} — cost basis preserved.`);
        }
        if (costBasisResults) {
          costBasisResults.set(tx.id, { transactionId: tx.id, costBasisUsd: null, gainLossUsd: null });
        }
      } else {
        // Non-self send: taxable disposal (spending crypto = taxable event per IRS)
        // Skip unpriced sends ($0 value) to avoid phantom gains/losses
        if (valueUsd === 0) {
          debugLog(`[Tax Calculator] Send ${tx.id}: Skipping unpriced send of ${amount} ${asset} ($0 value).`);
          if (costBasisResults) {
            costBasisResults.set(tx.id, { transactionId: tx.id, costBasisUsd: null, gainLossUsd: null });
          }
        } else {
          // Use processDisposal for proper lot consumption, holding period, and lot splitting
          const feeUsd = tx.fee_usd ? Math.abs(Number(tx.fee_usd)) : 0;
          const disposal = processDisposal(
            tx, lk, amount, Math.abs(valueUsd), feeUsd, date,
            costBasisLots, method, processedCount, taxableEventCount,
            country
          );

          // C-1 fix: Store consumed cost basis so receives can carry it forward if needed
          const transferKey = tx.tx_hash || tx.counterparty_address;
          if (transferKey) {
            pendingTransferBasis.set(`${transferKey}:${asset}`, {
              costBasis: disposal.totalCostBasis,
              lots: disposal.lotDisposals.map(l => ({ date: l.lotDate, amount: l.amount, costBasis: l.costBasis })),
            });
          }

          // Stablecoin: always force break-even (extract bare asset from composite key)
          const swapBareAsset = asset.includes(":") ? asset.split(":").pop()! : asset;
          const finalCostBasis = STABLECOINS.has(swapBareAsset) ? disposal.netProceeds : disposal.totalCostBasis;
          const finalGainLoss = disposal.netProceeds - finalCostBasis;

          if (costBasisResults) {
            costBasisResults.set(tx.id, { transactionId: tx.id, costBasisUsd: finalCostBasis, gainLossUsd: finalGainLoss });
          }

          // Create taxable events for this disposal (sends = taxable per IRS)
          if (txYear === taxYear) {
            const events = createDisposalTaxEvents(tx, asset, amount, {
              ...disposal,
              totalCostBasis: finalCostBasis,
              gainLoss: finalGainLoss,
            }, date);
            for (const event of events) {
              taxableEventCount++;
              taxableEvents.push(event);
            }
          }
        }
      }
    }
    // H-1 fix: Unstake is the return of staked tokens — NOT a disposal.
    // Cost basis lots must remain untouched so they're available when the user
    // eventually sells. Rewards during staking are already counted as income
    // via separate "stake"/"reward" transactions.
    else if (txType === "unstake" || txType === "unstaking") {
      // No-op: cost basis lots are preserved. The tokens are simply "unstaked"
      // and still owned by the user with their original acquisition cost basis.
      debugLog(`[Tax Calculator] Unstake ${tx.id}: ${amount} ${asset} — cost basis preserved (non-taxable).`);
      if (costBasisResults) {
        costBasisResults.set(tx.id, { transactionId: tx.id, costBasisUsd: null, gainLossUsd: null });
      }
    }
    // C-4 fix: Handle bridge as non-taxable transfer for same-token bridges.
    // Bridging the same token to another chain is economically equivalent to a
    // self-transfer — IRS has no specific guidance, but most tax professionals
    // treat it as non-taxable. Cost basis carries forward.
    else if (txType === "bridge") {
      // Check if incoming asset is different (e.g., ETH → WETH cross-chain)
      const incomingAsset = tx.incoming_asset_symbol
        ? tx.incoming_asset_symbol.trim().toUpperCase()
        : asset;
      const isSameTokenBridge = incomingAsset === asset;

      if (isSameTokenBridge) {
        // Non-taxable: cost basis lots remain unchanged, no disposal event.
        // The tokens are the same asset on a different chain.
        debugLog(`[Tax Calculator] Bridge ${tx.id}: Same-token bridge for ${asset} — non-taxable transfer, cost basis preserved.`);
        if (costBasisResults) {
          costBasisResults.set(tx.id, { transactionId: tx.id, costBasisUsd: null, gainLossUsd: null });
        }
      } else {
        // Different-token bridge (e.g., ETH → WETH): treated as a swap/disposal
        const disposal = processDisposal(
          tx, lk, amount, valueUsd, feeUsd, date,
          costBasisLots, method, processedCount, taxableEventCount,
          country
        );

        // Track loss sales for wash sale detection
        if (disposal.shouldTrackAsLossSale) {
          lossSales.push({
            id: tx.id, date, asset: lk, amount,
            lossAmount: Math.abs(disposal.gainLoss),
            costBasis: disposal.totalCostBasis,
            proceeds: disposal.netProceeds,
            holdingPeriod: disposal.holdingPeriod,
            remainingLoss: Math.abs(disposal.gainLoss),
          });
        }

        if (txYear === taxYear) {
          const events = createDisposalTaxEvents(tx, asset, amount, disposal, date);
          for (const event of events) {
            taxableEventCount++;
            taxableEvents.push(event);
          }
        }

        if (costBasisResults) {
          costBasisResults.set(tx.id, { transactionId: tx.id, costBasisUsd: disposal.totalCostBasis, gainLossUsd: disposal.gainLoss });
        }

        // Create cost basis lot for the incoming asset at FMV
        const bridgeInLk = lotKey(incomingAsset, txWallet, perWallet);
        if (!costBasisLots[bridgeInLk]) costBasisLots[bridgeInLk] = [];
        const bridgeProceeds = disposal.netProceeds;
        costBasisLots[bridgeInLk].push({
          id: tx.id, date, amount,
          costBasis: bridgeProceeds,
          pricePerUnit: amount > 0 ? bridgeProceeds / amount : 0,
        });
      }
    }
    // Handle liquidity providing - LP token acquisition
    // IRS: Adding liquidity creates LP tokens with cost basis = value of assets provided
    else if (txType === "liquidity providing" || txType === "liquidity add" || txType === "add liquidity") {
      // LP token acquisition - cost basis = total value of assets provided
      // The LP token itself is the asset_symbol
      const lpTokenAmount = amount;
      const totalValueProvided = Math.abs(valueUsd); // Total value of assets added to pool
      const lpTokenPrice = lpTokenAmount > 0 ? totalValueProvided / lpTokenAmount : 0;

      costBasisLots[lk].push({
        id: tx.id,
        date,
        amount: lpTokenAmount,
        costBasis: totalValueProvided,
        pricePerUnit: lpTokenPrice,
      });
      if (costBasisResults) {
        costBasisResults.set(tx.id, { transactionId: tx.id, costBasisUsd: totalValueProvided, gainLossUsd: 0 });
      }
    }
    // Handle liquidity removal - LP token disposal
    // IRS: Removing liquidity disposes of LP tokens, may have impermanent loss
    else if (
      txType === "liquidity removal" ||
      txType === "liquidity remove" ||
      txType === "liquidity exit" ||
      txType === "remove liquidity"
    ) {
      // C-1/C-2/H-7 fix: Use processDisposal for consistent lot consumption,
      // rounding, holding period splitting, and loss tracking.
      const disposal = processDisposal(
        tx, lk, amount, valueUsd, feeUsd, date,
        costBasisLots, method, processedCount, taxableEventCount,
        country
      );

      // Track loss sales for wash sale detection (impermanent loss)
      if (disposal.shouldTrackAsLossSale) {
        lossSales.push({
          id: tx.id, date, asset: lk, amount,
          lossAmount: Math.abs(disposal.gainLoss),
          costBasis: disposal.totalCostBasis,
          proceeds: disposal.netProceeds,
          holdingPeriod: disposal.holdingPeriod,
          remainingLoss: Math.abs(disposal.gainLoss),
        });
      }

      if (costBasisResults) {
        costBasisResults.set(tx.id, { transactionId: tx.id, costBasisUsd: disposal.totalCostBasis, gainLossUsd: disposal.gainLoss });
      }

      if (txYear === taxYear) {
        const events = createDisposalTaxEvents(tx, asset, amount, disposal, date);
        for (const event of events) {
          taxableEventCount++;
          taxableEvents.push(event);
        }
      }
    }
    // Handle margin trades - treat as regular buy/sell for tax purposes
    // IRS: Margin trading creates taxable events when positions are opened/closed
    else if (txType === "margin buy") {
      // Margin buy is treated as a regular buy (adds to cost basis)
      let totalCostBasis = Math.abs(valueUsd) + feeUsd;
      
      // Check for wash sale
      const washSaleAdjustment = checkWashSale(lk, date, amount, lossSales);
      if (washSaleAdjustment > 0) {
        totalCostBasis += washSaleAdjustment;
        debugLog(`[Wash Sale] Margin buy transaction ${tx.id}: Added $${washSaleAdjustment.toFixed(2)} wash sale adjustment to cost basis.`);
      }
      
      costBasisLots[lk].push({
        id: tx.id,
        date,
        amount,
        costBasis: totalCostBasis,
        pricePerUnit: amount > 0 ? totalCostBasis / amount : 0,
        fees: feeUsd,
        washSaleAdjustment: washSaleAdjustment > 0 ? washSaleAdjustment : undefined,
      });
      if (costBasisResults) {
        costBasisResults.set(tx.id, { transactionId: tx.id, costBasisUsd: totalCostBasis, gainLossUsd: 0 });
      }
    }
    else if (txType === "margin sell") {
      // Margin sell is treated as a regular sell (taxable disposal)
      const disposal = processDisposal(
        tx,
        lk,
        amount,
        valueUsd,
        feeUsd,
        date,
        costBasisLots,
        method,
        processedCount,
        taxableEventCount,
        country
      );

      // Track loss sales for wash sale detection
      if (disposal.shouldTrackAsLossSale) {
        lossSales.push({
          id: tx.id,
          date,
          asset: lk,
          amount,
          lossAmount: Math.abs(disposal.gainLoss),
          costBasis: disposal.totalCostBasis,
          proceeds: disposal.netProceeds,
          holdingPeriod: disposal.holdingPeriod,
          remainingLoss: Math.abs(disposal.gainLoss),
        });
      }

      if (costBasisResults) {
        costBasisResults.set(tx.id, { transactionId: tx.id, costBasisUsd: disposal.totalCostBasis, gainLossUsd: disposal.gainLoss });
      }

      if (txYear === taxYear) {
        const events = createDisposalTaxEvents(tx, asset, amount, disposal, date);
        for (const event of events) {
          taxableEventCount++;
          taxableEvents.push(event);
        }
      }
    }
    // Handle liquidations - treated as forced sale at market price
    // IRS: Liquidations are taxable events (disposal of assets)
    else if (txType === "liquidation") {
      // Liquidation is treated as a sell (forced disposal)
      const disposal = processDisposal(
        tx,
        lk,
        amount,
        valueUsd,
        feeUsd,
        date,
        costBasisLots,
        method,
        processedCount,
        taxableEventCount,
        country
      );

      // Track loss sales for wash sale detection
      if (disposal.shouldTrackAsLossSale) {
        lossSales.push({
          id: tx.id,
          date,
          asset: lk,
          amount,
          lossAmount: Math.abs(disposal.gainLoss),
          costBasis: disposal.totalCostBasis,
          proceeds: disposal.netProceeds,
          holdingPeriod: disposal.holdingPeriod,
          remainingLoss: Math.abs(disposal.gainLoss),
        });
      }

      if (costBasisResults) {
        costBasisResults.set(tx.id, { transactionId: tx.id, costBasisUsd: disposal.totalCostBasis, gainLossUsd: disposal.gainLoss });
      }

      if (txYear === taxYear) {
        const events = createDisposalTaxEvents(tx, asset, amount, disposal, date);
        for (const event of events) {
          taxableEventCount++;
          taxableEvents.push(event);
        }
      }
    }
    // Handle borrow - not taxable but affects holdings tracking
    else if (txType === "borrow") {
      // LIMITATION: Borrowing doesn't create taxable event
      // However, borrowed assets should be tracked separately (not part of cost basis)
      // Currently, borrowed assets are NOT tracked separately
      //
      // IMPORTANT: If you borrow crypto and then sell it, the cost basis calculation
      // will be incorrect because:
      // 1. The borrowed amount doesn't create a cost basis lot
      // 2. When you sell borrowed crypto, it will use existing cost basis lots (wrong!)
      // 3. When you repay the loan, those assets should come from borrowed pool, not owned pool
      //
      // RECOMMENDATION: Users should avoid mixing borrowed and owned crypto in the same
      // wallet, or manually track borrowed positions separately.
      //
      // For production, you would need to:
      // - Track borrowed vs owned assets separately
      // - Prevent borrowed assets from being used in cost basis calculations
      // - Ensure repayments reduce borrowed pool, not owned pool
      debugLog(`[Tax Calculator] Borrow transaction ${tx.id}: Borrowing is not currently tracked. Ensure you don't mix borrowed and owned crypto.`);
      if (costBasisResults) {
        costBasisResults.set(tx.id, { transactionId: tx.id, costBasisUsd: null, gainLossUsd: null });
      }
    }
    // Handle repay - not taxable but affects holdings tracking
    else if (txType === "repay") {
      // LIMITATION: Repaying doesn't create taxable event
      // Reduces borrowed amount (which is not currently tracked)
      // See borrow handler above for full explanation of limitations
      debugLog(`[Tax Calculator] Repay transaction ${tx.id}: Repayment is not currently tracked. Ensure you don't mix borrowed and owned crypto.`);
      if (costBasisResults) {
        costBasisResults.set(tx.id, { transactionId: tx.id, costBasisUsd: null, gainLossUsd: null });
      }
    }
    // Handle deposit — treat as acquisition (same as buy: creates cost basis lot)
    // H-3 fix: Deposit/Withdraw are transfers (e.g., to/from exchange), NOT
    // acquisitions/disposals. Cost basis lots remain unchanged — the tokens
    // are the same ones the user already owns, just moving between wallets/exchanges.
    else if (txType === "deposit") {
      // No-op: tokens moved to exchange. Cost basis lots are already tracked.
      debugLog(`[Tax Calculator] Deposit ${tx.id}: ${amount} ${asset} to exchange — non-taxable transfer.`);
      if (costBasisResults) {
        costBasisResults.set(tx.id, { transactionId: tx.id, costBasisUsd: null, gainLossUsd: null });
      }
    }
    else if (txType === "withdraw") {
      // No-op: tokens moved from exchange. Cost basis lots are already tracked.
      debugLog(`[Tax Calculator] Withdraw ${tx.id}: ${amount} ${asset} from exchange — non-taxable transfer.`);
      if (costBasisResults) {
        costBasisResults.set(tx.id, { transactionId: tx.id, costBasisUsd: null, gainLossUsd: null });
      }
    }
    // Handle burn — disposal at $0 proceeds (capital loss = full cost basis)
    // C-1/C-2/H-7 fix: Use processDisposal for consistent lot consumption,
    // rounding, holding period splitting, and loss tracking.
    else if (txType === "burn") {
      // Skip misclassified token burns: if asset_symbol says "SOL" but asset_address
      // points to a different SPL token mint, this is a spam token burn that was
      // incorrectly labeled as SOL during sync. Don't consume SOL lots for it.
      const SOL_NATIVE_MINT = "So11111111111111111111111111111111111111112";
      if (asset === "SOL" && tx.asset_address && tx.asset_address !== SOL_NATIVE_MINT) {
        debugLog(`[Tax Calculator] Burn ${tx.id}: Skipping misclassified token burn (asset_address=${tx.asset_address} ≠ SOL)`);
        if (costBasisResults) {
          costBasisResults.set(tx.id, { transactionId: tx.id, costBasisUsd: null, gainLossUsd: null });
        }
        continue;
      }
      // Pass valueUsd=0 since burn proceeds are always $0
      const disposal = processDisposal(
        tx, lk, amount, 0, feeUsd, date,
        costBasisLots, method, processedCount, taxableEventCount,
        country
      );

      // Track loss sales for wash sale detection
      if (disposal.shouldTrackAsLossSale) {
        lossSales.push({
          id: tx.id, date, asset: lk, amount,
          lossAmount: Math.abs(disposal.gainLoss),
          costBasis: disposal.totalCostBasis,
          proceeds: disposal.netProceeds,
          holdingPeriod: disposal.holdingPeriod,
          remainingLoss: Math.abs(disposal.gainLoss),
        });
      }

      if (costBasisResults) {
        costBasisResults.set(tx.id, { transactionId: tx.id, costBasisUsd: disposal.totalCostBasis, gainLossUsd: disposal.gainLoss });
      }

      if (txYear === taxYear) {
        const events = createDisposalTaxEvents(tx, asset, amount, disposal, date);
        for (const event of events) {
          taxableEventCount++;
          taxableEvents.push(event);
        }
      }
    }
    // H-1 fix: Wrap/unwrap transfers cost basis between asset symbols (e.g., ETH→WETH).
    // IRS: Non-taxable event, but cost basis must move to the new asset symbol.
    else if (txType === "wrap" || txType === "unwrap") {
      const incomingAsset = tx.incoming_asset_symbol
        ? tx.incoming_asset_symbol.trim().toUpperCase()
        : null;

      if (incomingAsset && incomingAsset !== asset) {
        // Move cost basis lots from outgoing asset to incoming asset
        const wrapInLk = lotKey(incomingAsset, txWallet, perWallet);
        if (!costBasisLots[wrapInLk]) costBasisLots[wrapInLk] = [];
        const selectedLots = selectLots(costBasisLots[lk] || [], amount, method);
        let remainingToMove = amount;
        for (const lot of selectedLots) {
          if (remainingToMove <= 0) break;
          const amountFromLot = Math.min(remainingToMove, lot.amount);
          const costBasisPerUnit = lot.amount > 0 ? lot.costBasis / lot.amount : 0;
          const costBasisFromLot = costBasisPerUnit * amountFromLot;
          costBasisLots[wrapInLk].push({
            id: tx.id, date: lot.date, amount: amountFromLot,
            costBasis: costBasisFromLot,
            pricePerUnit: costBasisPerUnit,
          });
          lot.amount -= amountFromLot;
          lot.costBasis -= costBasisFromLot;
          remainingToMove -= amountFromLot;
        }
        if (costBasisLots[lk]) {
          costBasisLots[lk] = costBasisLots[lk].filter((lot) => lot.amount > 0);
        }
        debugLog(`[Tax Calculator] ${txType} ${tx.id}: Transferred cost basis from ${asset} to ${incomingAsset} — non-taxable.`);
      }
      // If no incoming asset data, it's a no-op (cost basis stays on same symbol)
      if (costBasisResults) {
        costBasisResults.set(tx.id, { transactionId: tx.id, costBasisUsd: null, gainLossUsd: null });
      }
    }
    // Skip economically neutral types — no taxable event, no cost basis change
    else if (
      txType === "self" ||
      txType === "approve" ||
      txType === "nft activity" ||
      txType === "defi setup" ||
      txType === "zero transaction" ||
      txType === "spam"
    ) {
      // These types are economically neutral and require no tax processing
      if (costBasisResults) {
        costBasisResults.set(tx.id, { transactionId: tx.id, costBasisUsd: null, gainLossUsd: null });
      }
    }
    // Handle yield farming rewards - income recognition
    else if (txType === "yield farming" || txType === "farm reward") {
      // Yield farming rewards are income
      const incomeType: IncomeEvent["type"] = "reward";
      const rewardValue = Math.abs(valueUsd);

      if (txYear === taxYear && rewardValue > 0) {
        incomeEventCount++;
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
        costBasisLots[lk].push({
          id: tx.id,
          date,
          amount,
          costBasis: rewardValue,
          pricePerUnit,
        });
      }

      // Cost basis = FMV at receipt (becomes basis for future capital gains)
      if (costBasisResults) {
        costBasisResults.set(tx.id, { transactionId: tx.id, costBasisUsd: rewardValue, gainLossUsd: null });
      }
    }
    // Gambling: bets/wagers — track separately from capital gains.
    // The wager is not a capital loss; winnings are not capital gains.
    // For now, record cost basis (wager amount) so gambling P&L can be computed,
    // but set gainLossUsd = null to exclude from capital gains reporting.
    else if ([
      "place_bet", "place_sol_bet", "create_bet", "create_raffle", "buy_tickets",
    ].includes(txType)) {
      // Wager: creates a cost basis lot (money spent on the bet)
      if (valueUsd > 0) {
        costBasisLots[lk].push({
          id: tx.id, date, amount,
          costBasis: Math.abs(valueUsd),
          pricePerUnit,
        });
      }
      if (costBasisResults) {
        costBasisResults.set(tx.id, { transactionId: tx.id, costBasisUsd: Math.abs(valueUsd), gainLossUsd: null });
      }
    }
    // Catch-all: log unhandled transaction types
    else {
      if (processedCount < 50) {
        console.warn(`[Tax Calculator] Unhandled transaction type: "${tx.type}" (id=${tx.id}, asset=${asset}, value=$${valueUsd.toFixed(2)}). No tax treatment applied.`);
      }
      if (costBasisResults) {
        costBasisResults.set(tx.id, { transactionId: tx.id, costBasisUsd: null, gainLossUsd: null });
      }
    }
  }

  // Mark wash sales after processing all transactions
  // This includes checking buys that occurred BEFORE loss sales (two-pass approach)
  markWashSales(taxableEvents, lossSales, buyTransactions, costBasisLots);
  
  debugLog(`[processTransactionsForTax] Processing complete for tax year ${taxYear}:`);
  debugLog(`  - Processed ${processedCount} transactions (out of ${transactions.length} total)`);
  debugLog(`  - Found ${taxableEventCount} taxable events`);
  debugLog(`  - Found ${incomeEventCount} income events`);
  debugLog(`  - Transaction types processed:`, typeCounts);
  debugLog(`  - Loss sales tracked: ${lossSales.length}`);
  const washSaleCount = taxableEvents.filter(e => e.washSale).length;
  if (washSaleCount > 0) {
    debugLog(`  - Wash sales detected: ${washSaleCount}`);
  }
  
  // Log cost basis lots summary
  const assetsWithLots = Object.keys(costBasisLots).filter(k => costBasisLots[k].length > 0);
  debugLog(`  - Assets with cost basis lots: ${assetsWithLots.length}`);
  if (assetsWithLots.length > 0) {
    debugLog(`  - Assets: ${assetsWithLots.join(", ")}`);
    assetsWithLots.forEach(asset => {
      const totalAmount = costBasisLots[asset].reduce((sum, lot) => sum + lot.amount, 0);
      const totalCostBasis = costBasisLots[asset].reduce((sum, lot) => sum + lot.costBasis, 0);
      debugLog(`    - ${asset}: ${costBasisLots[asset].length} lots, ${totalAmount} total amount, $${totalCostBasis.toFixed(2)} total cost basis`);
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
 *
 * C-6 MUTATION CONTRACT: Returns references to the ORIGINAL lot objects from the
 * `lots` array (not copies). Callers MUST mutate `lot.amount` and `lot.costBasis`
 * on the returned lots to consume them. The sort creates a new array ordering but
 * the elements share identity with the originals, so mutations propagate back to
 * the `costBasisLots[asset]` array. After consumption, callers should filter out
 * empty lots: `costBasisLots[asset] = costBasisLots[asset].filter(l => l.amount > 0)`
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
  const sym = report.currencySymbol || "$";
  const fmtCur = (value: number) => formatCurrencyWithSymbol(value, sym, report.currency || "USD");
  return {
    shortTermGains: fmtCur(report.shortTermGains),
    longTermGains: fmtCur(report.longTermGains),
    shortTermLosses: fmtCur(report.shortTermLosses),
    longTermLosses: fmtCur(report.longTermLosses),
    totalIncome: fmtCur(report.totalIncome),
    netShortTermGain: fmtCur(report.netShortTermGain),
    netLongTermGain: fmtCur(report.netLongTermGain),
    totalTaxableGain: fmtCur(report.totalTaxableGain),
    taxableEvents: report.taxableEvents.length,
    incomeEvents: report.incomeEvents.length,
    annualExemption: fmtCur(report.annualExemption),
    currency: report.currency,
    currencySymbol: report.currencySymbol,
  };
}

function formatCurrencyWithSymbol(value: number, symbol: string, currencyCode: string): string {
  const locale = currencyCode === "GBP" ? "en-GB" : currencyCode === "EUR" ? "de-DE" : "en-US";
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currencyCode,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    // Fallback: manual formatting
    const abs = Math.abs(value);
    const formatted = abs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return value < 0 ? `-${symbol}${formatted}` : `${symbol}${formatted}`;
  }
}

function formatCurrency(value: number): string {
  return formatCurrencyWithSymbol(value, "$", "USD");
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

  // Pattern 1: "1.5 ETH → 3000 USDC" (4 capture groups)
  const pattern1 = /([\d.,]+)\s*(\w+)\s*(?:→|->|\bfor\b|\bto\b)\s*([\d.,]+)\s*(\w+)/i;
  const match1 = notes.match(pattern1);
  if (match1) {
    const outgoingAsset = match1[2].toUpperCase();
    const incomingAsset = match1[4].toUpperCase();
    const outgoingAmount = parseFloat(match1[1].replace(/,/g, ""));
    const incomingAmount = parseFloat(match1[3].replace(/,/g, ""));
    let incomingValueUsd: number | null = null;
    if (incomingAmount && outgoingValueUsd) {
      incomingValueUsd = Math.abs(outgoingValueUsd);
    }
    return {
      outgoingAsset: outgoingAsset.trim().toUpperCase(),
      incomingAsset: incomingAsset.trim().toUpperCase(),
      outgoingAmount: outgoingAmount || Number(tx.amount_value),
      incomingAmount,
      incomingValueUsd,
    };
  }

  // Pattern 2: "Swapped 1.5 ETH for 3000 USDC" (4 capture groups)
  const pattern2 = /(?:swapped|swap|exchanged|exchange)\s+([\d.,]+)\s+(\w+)\s+(?:\bfor\b|\bto\b|→|->)\s+([\d.,]+)\s+(\w+)/i;
  const match2 = notes.match(pattern2);
  if (match2) {
    const outgoingAsset = match2[2].toUpperCase();
    const incomingAsset = match2[4].toUpperCase();
    const outgoingAmount = parseFloat(match2[1].replace(/,/g, ""));
    const incomingAmount = parseFloat(match2[3].replace(/,/g, ""));
    let incomingValueUsd: number | null = null;
    if (incomingAmount && outgoingValueUsd) {
      incomingValueUsd = Math.abs(outgoingValueUsd);
    }
    return {
      outgoingAsset: outgoingAsset.trim().toUpperCase(),
      incomingAsset: incomingAsset.trim().toUpperCase(),
      outgoingAmount: outgoingAmount || Number(tx.amount_value),
      incomingAmount,
      incomingValueUsd,
    };
  }

  // Pattern 3: "ETH → USDC" (2 capture groups, no amounts)
  const pattern3 = /(\w+)\s*→\s*(\w+)/i;
  const match3 = notes.match(pattern3);
  if (match3) {
    return {
      outgoingAsset: match3[1].toUpperCase(),
      incomingAsset: match3[2].toUpperCase(),
      outgoingAmount: Number(tx.amount_value),
      incomingAmount: null,
      incomingValueUsd: outgoingValueUsd ? Math.abs(outgoingValueUsd) : null,
    };
  }

  // Try to parse from asset_symbol (format: "ETH/USDC" or "ETH→USDC")
  const assetPattern = /(\w+)\s*(?:\/|→|->)\s*(\w+)/i;
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
 *
 * H-4 fix: Loss disallowance is proportional to the number of replacement shares
 * purchased. If you sold 100 shares at a loss and buy back 60, only 60% of the
 * loss is disallowed (IRS Publication 550).
 */
function checkWashSale(
  asset: string,
  buyDate: Date,
  buyAmount: number,
  lossSales: LossSale[]
): number {
  let totalAdjustment = 0;
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
  // C-4 fix: Track remaining buy quantity so a single buy can't trigger wash
  // sale against more loss shares than it actually replaces.
  let remainingBuyAmount = buyAmount;

  for (const lossSale of lossSales) {
    if (remainingBuyAmount <= 0) break;
    if (lossSale.asset.toUpperCase() !== asset.toUpperCase()) continue;
    if (lossSale.remainingLoss <= 0) continue;

    const daysDifference = (buyDate.getTime() - lossSale.date.getTime());

    if (daysDifference >= -thirtyDaysMs && daysDifference <= thirtyDaysMs) {
      // Proportional disallowance based on replacement share quantity
      const replacementShares = Math.min(remainingBuyAmount, lossSale.amount);
      const proportionReplaced = lossSale.amount > 0
        ? replacementShares / lossSale.amount
        : 1;
      const proportionalLoss = lossSale.lossAmount * proportionReplaced;
      const adjustment = Math.min(lossSale.remainingLoss, proportionalLoss);
      lossSale.remainingLoss -= adjustment;
      totalAdjustment += adjustment;
      remainingBuyAmount -= replacementShares;

      debugLog(`[Wash Sale] Detected wash sale: Buy ${buyAmount} on ${buyDate.toISOString().split('T')[0]} is within 30 days of loss sale (${lossSale.amount}) on ${lossSale.date.toISOString().split('T')[0]}. Proportional disallowance: $${adjustment.toFixed(2)} (${(proportionReplaced * 100).toFixed(0)}%).`);
    }
  }

  return totalAdjustment;
}

/**
 * Mark wash sales in taxable events after processing all transactions
 * This updates events that had their loss disallowed due to wash sale rules
 * IRS Rule: Wash sale occurs when you sell at a loss and buy the same asset
 * within 30 days before OR after the sale
 */
function markWashSales(
  taxableEvents: TaxableEvent[],
  lossSales: LossSale[],
  buyTransactions: BuyTransaction[],
  costBasisLots: Record<string, CostBasisLot[]>
): void {
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

  // C-4 fix: Track remaining buy quantity per buy transaction so a single buy
  // can't be used as replacement shares for more loss sales than its quantity covers.
  const remainingBuyAmounts = new Map<string, number>();
  for (const buyTx of buyTransactions) {
    const key = String(buyTx.lotId || buyTx.id);
    remainingBuyAmounts.set(key, buyTx.amount);
  }

  // Process each loss sale to check for wash sales
  for (const lossSale of lossSales) {
    // C-2 fix: Use remainingLoss (which checkWashSale already decremented for
    // buys AFTER the loss sale) to avoid double-applying the same disallowed loss.
    let remainingLossToDisallow = lossSale.remainingLoss;

    // Check for buys within 30 days BEFORE the loss sale
    for (const buyTx of buyTransactions) {
      if (remainingLossToDisallow <= 0) break;

      // Must be same asset
      if (buyTx.asset.toUpperCase() !== lossSale.asset.toUpperCase()) {
        continue;
      }

      const buyKey = String(buyTx.lotId || buyTx.id);
      const remainingBuyQty = remainingBuyAmounts.get(buyKey) || 0;
      if (remainingBuyQty <= 0) continue;

      // Check if buy occurred within 30 days BEFORE the loss sale
      const daysDifference = lossSale.date.getTime() - buyTx.date.getTime();

      if (daysDifference >= 0 && daysDifference <= thirtyDaysMs) {
        // This buy occurred before the loss sale within 30 days - wash sale applies
        // Proportional disallowance: only disallow the fraction matching replacement shares
        const replacementShares = Math.min(remainingBuyQty, lossSale.amount);
        const proportionalLoss = lossSale.amount > 0
          ? lossSale.lossAmount * replacementShares / lossSale.amount
          : lossSale.lossAmount;
        const disallowedAmount = Math.min(remainingLossToDisallow, proportionalLoss);

        // Find the lot and add the wash sale adjustment
        const lot = costBasisLots[buyTx.asset]?.find(l => l.id === buyTx.lotId);
        if (lot) {
          // Only apply if not already applied
          if (!lot.washSaleAdjustment || lot.washSaleAdjustment === 0) {
            lot.washSaleAdjustment = disallowedAmount;
            lot.costBasis += disallowedAmount;
            remainingLossToDisallow -= disallowedAmount;
            remainingBuyAmounts.set(buyKey, remainingBuyQty - replacementShares);

            debugLog(`[Wash Sale] Buy ${buyTx.id} occurred ${Math.round(daysDifference / (24 * 60 * 60 * 1000))} days BEFORE loss sale ${lossSale.id}. Adding $${disallowedAmount.toFixed(2)} to cost basis.`);
          }
        }
      }
    }

    // Update remaining loss after checking buys before the sale
    lossSale.remainingLoss = remainingLossToDisallow;
  }

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
        debugLog(`[Wash Sale] Marked event ${event.id} as wash sale. Total disallowed loss: $${disallowedAmount.toFixed(2)}`);
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
