/**
 * Securities Wash Sale Engine
 *
 * Detects wash sales per IRS rules: a loss on a security is disallowed if a
 * "substantially identical" security is purchased within the 61-day window
 * (30 days before through 30 days after the sale).
 *
 * Handles:
 * - Same-symbol matching (automatic)
 * - Options on same underlying (METHOD_1 conservative / METHOD_2 narrow)
 * - User-defined equivalence groups
 * - Partial loss disallowance (prorated)
 * - IRA/401K/HSA/529 permanent disallowance
 * - Basis adjustment and holding period tacking on replacement lots
 * - Daisy-chain detection (adjusted basis creating new losses)
 * - Cross-year carry-forward (Nov/Dec loss, Jan replacement)
 *
 * Performance: O(N log N) using sorted maps with binary search for windows.
 */

import type {
  SecuritiesTaxEvent,
  SecuritiesLotData,
  SecuritiesTransaction,
} from "./securities-lot-engine";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WashSaleResult {
  lossTransactionId: number;
  replacementTransactionId: number;
  lossLotId?: number;
  replacementLotId?: number;
  disallowedAmount: number;
  isPermanent: boolean;
  basisAdjustment: number;
  holdingPeriodTackDays: number;
  year: number;
  carryForward: boolean;
}

/** Flattened acquisition record built from transactions */
interface AcquisitionRecord {
  transactionId: number;
  lotId?: number;
  symbol: string;
  underlyingSymbol?: string | null;
  optionType?: string | null;
  strikePrice?: number | null;
  expirationDate?: Date | null;
  date: Date;
  quantity: number;
  remainingQty: number;
  accountType: string; // from brokerage or default
  brokerageId?: string | null;
}

/** Mutable lot mirror used during wash sale adjustments */
interface MutableLotRef {
  lotId: number;
  costBasis: number;
  quantity: number;
  dateAcquired: Date;
  adjustedAcquisitionDate?: Date;
  washSaleAdjustment: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TAX_DEFERRED_ACCOUNTS = new Set([
  "IRA_TRADITIONAL",
  "IRA_ROTH",
  "401K",
  "HSA",
  "529",
]);

const ACQUISITION_TYPES = new Set([
  "BUY",
  "DIVIDEND_REINVEST",
  "TRANSFER_IN",
  "RSU_VEST",
  "ESPP_PURCHASE",
  "BUY_TO_COVER",
]);

const MILLIS_PER_DAY = 86400000;
const WASH_SALE_WINDOW_DAYS = 30;
const MAX_DAISY_CHAIN_ITERATIONS = 100;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toNum(v: number | { toString(): string } | null | undefined): number {
  if (v === null || v === undefined) return 0;
  return typeof v === "number" ? v : Number(v);
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / MILLIS_PER_DAY);
}

function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

/**
 * Binary search for the leftmost index where arr[i].date >= target.
 * arr must be sorted by date ascending.
 */
function lowerBound(arr: AcquisitionRecord[], target: Date): number {
  let lo = 0;
  let hi = arr.length;
  const t = target.getTime();
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid].date.getTime() < t) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return lo;
}

/**
 * Binary search for the leftmost index where arr[i].date > target (exclusive).
 */
function upperBound(arr: AcquisitionRecord[], target: Date): number {
  let lo = 0;
  let hi = arr.length;
  const t = target.getTime();
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid].date.getTime() <= t) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return lo;
}

// ---------------------------------------------------------------------------
// Substantially identical matching
// ---------------------------------------------------------------------------

/**
 * Returns the set of symbols that are "substantially identical" to the given
 * loss symbol, considering method and equivalence groups.
 */
function getSubstantiallyIdenticalSymbols(
  lossSymbol: string,
  lossUnderlyingSymbol: string | null | undefined,
  method: string,
  equivalenceGroups: { symbols: string[] }[],
  symbolToUnderlying: Map<string, string>,
): Set<string> {
  const result = new Set<string>();
  result.add(lossSymbol);

  // Determine the "base" symbol for option matching
  const lossBase = lossUnderlyingSymbol || lossSymbol;

  // Check equivalence groups
  for (const group of equivalenceGroups) {
    const upperSymbols = group.symbols.map((s) => s.toUpperCase());
    if (upperSymbols.includes(lossSymbol.toUpperCase())) {
      for (const s of upperSymbols) {
        result.add(s);
      }
    }
  }

  // For option matching, add symbols that share the same underlying
  if (method === "METHOD_1") {
    // Conservative: any option on the same underlying matches
    // Also, the underlying stock itself matches options on it
    // We add the underlying, and will check at match time
    result.add(lossBase);
  }

  return result;
}

/**
 * Checks if an acquisition is substantially identical to a loss sale.
 * METHOD_1 (conservative): any option on same underlying matches stock and
 *   other options on that underlying.
 * METHOD_2 (narrow): only options with same underlying, type, strike,
 *   and expiration are substantially identical.
 */
function isSubstantiallyIdentical(
  lossSymbol: string,
  lossUnderlying: string | null | undefined,
  lossOptionType: string | null | undefined,
  lossStrike: number | null | undefined,
  lossExpiration: Date | null | undefined,
  acqSymbol: string,
  acqUnderlying: string | null | undefined,
  acqOptionType: string | null | undefined,
  acqStrike: number | null | undefined,
  acqExpiration: Date | null | undefined,
  method: string,
  identicalSymbols: Set<string>,
): boolean {
  // Direct symbol match
  if (lossSymbol.toUpperCase() === acqSymbol.toUpperCase()) {
    return true;
  }

  // Equivalence group match
  if (identicalSymbols.has(acqSymbol.toUpperCase())) {
    return true;
  }

  // Option-based matching
  const lossBase = (lossUnderlying || lossSymbol).toUpperCase();
  const acqBase = (acqUnderlying || acqSymbol).toUpperCase();

  if (lossBase !== acqBase) {
    return false;
  }

  // At this point, same underlying
  if (method === "METHOD_1") {
    // Conservative: same underlying => substantially identical
    return true;
  }

  if (method === "METHOD_2") {
    // Narrow: must have same option type, strike, and expiration
    // If neither is an option, they are the same underlying stock => match
    if (!lossOptionType && !acqOptionType) {
      return true;
    }
    // If one is an option and the other is not, not a match under METHOD_2
    if (!lossOptionType || !acqOptionType) {
      return false;
    }
    // Both are options: must match type, strike, expiration
    if (lossOptionType !== acqOptionType) return false;
    if (Math.abs(toNum(lossStrike) - toNum(acqStrike)) > 0.001) return false;
    if (lossExpiration && acqExpiration) {
      if (startOfDay(lossExpiration).getTime() !== startOfDay(acqExpiration).getTime()) {
        return false;
      }
    } else if (lossExpiration !== acqExpiration) {
      return false;
    }
    return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Build acquisition indexes
// ---------------------------------------------------------------------------

/**
 * Builds a Map<symbol, AcquisitionRecord[]> from all transactions.
 * Each symbol key maps to acquisitions sorted by date ascending.
 * Also builds a secondary index by underlying symbol for option matching.
 */
function buildAcquisitionIndexes(
  allTransactions: SecuritiesTransaction[],
  brokerageAccountTypes: Map<string, string>,
): {
  bySymbol: Map<string, AcquisitionRecord[]>;
  byUnderlying: Map<string, AcquisitionRecord[]>;
  symbolToUnderlying: Map<string, string>;
} {
  const bySymbol = new Map<string, AcquisitionRecord[]>();
  const byUnderlying = new Map<string, AcquisitionRecord[]>();
  const symbolToUnderlying = new Map<string, string>();

  for (const tx of allTransactions) {
    if (!ACQUISITION_TYPES.has(tx.type)) continue;

    const qty = toNum(tx.quantity);
    if (qty <= 0) continue;

    const sym = tx.symbol.toUpperCase();
    const underlying = tx.underlyingSymbol?.toUpperCase() || null;
    const accountType = tx.brokerageId
      ? brokerageAccountTypes.get(tx.brokerageId) || "TAXABLE"
      : "TAXABLE";

    const record: AcquisitionRecord = {
      transactionId: tx.id,
      symbol: sym,
      underlyingSymbol: underlying,
      optionType: tx.optionType || null,
      strikePrice: tx.strikePrice ? toNum(tx.strikePrice) : null,
      expirationDate: tx.expirationDate ? new Date(tx.expirationDate) : null,
      date: startOfDay(new Date(tx.date)),
      quantity: qty,
      remainingQty: qty,
      accountType,
      brokerageId: tx.brokerageId,
    };

    // Index by symbol
    if (!bySymbol.has(sym)) bySymbol.set(sym, []);
    bySymbol.get(sym)!.push(record);

    // Index by underlying for option matching
    if (underlying) {
      symbolToUnderlying.set(sym, underlying);
      if (!byUnderlying.has(underlying)) byUnderlying.set(underlying, []);
      byUnderlying.get(underlying)!.push(record);
    } else {
      // Stock itself can be looked up by its own symbol as "underlying"
      if (!byUnderlying.has(sym)) byUnderlying.set(sym, []);
      byUnderlying.get(sym)!.push(record);
    }
  }

  // Sort all arrays by date
  for (const arr of bySymbol.values()) {
    arr.sort((a, b) => a.date.getTime() - b.date.getTime());
  }
  for (const arr of byUnderlying.values()) {
    arr.sort((a, b) => a.date.getTime() - b.date.getTime());
  }

  return { bySymbol, byUnderlying, symbolToUnderlying };
}

// ---------------------------------------------------------------------------
// Find acquisitions within 61-day window
// ---------------------------------------------------------------------------

function findWindowAcquisitions(
  saleDate: Date,
  lossSymbol: string,
  lossUnderlying: string | null | undefined,
  lossOptionType: string | null | undefined,
  lossStrike: number | null | undefined,
  lossExpiration: Date | null | undefined,
  method: string,
  identicalSymbols: Set<string>,
  bySymbol: Map<string, AcquisitionRecord[]>,
  byUnderlying: Map<string, AcquisitionRecord[]>,
  lossTransactionId: number,
): AcquisitionRecord[] {
  const windowStart = new Date(saleDate.getTime() - WASH_SALE_WINDOW_DAYS * MILLIS_PER_DAY);
  const windowEnd = new Date(saleDate.getTime() + WASH_SALE_WINDOW_DAYS * MILLIS_PER_DAY);

  const candidates: AcquisitionRecord[] = [];
  const seenTxIds = new Set<number>();

  // Gather candidate acquisitions from all matching symbols
  const symbolsToCheck = new Set<string>();
  for (const sym of identicalSymbols) {
    symbolsToCheck.add(sym.toUpperCase());
  }

  // Also check by underlying for option matching
  const lossBase = (lossUnderlying || lossSymbol).toUpperCase();
  if (method === "METHOD_1") {
    symbolsToCheck.add(lossBase);
  }

  // Collect from bySymbol index
  for (const sym of symbolsToCheck) {
    const arr = bySymbol.get(sym);
    if (!arr) continue;

    const lo = lowerBound(arr, windowStart);
    const hi = upperBound(arr, windowEnd);

    for (let i = lo; i < hi; i++) {
      const acq = arr[i];
      if (seenTxIds.has(acq.transactionId)) continue;
      if (acq.transactionId === lossTransactionId) continue;
      if (acq.remainingQty <= 1e-10) continue;

      if (isSubstantiallyIdentical(
        lossSymbol, lossUnderlying, lossOptionType, lossStrike, lossExpiration,
        acq.symbol, acq.underlyingSymbol, acq.optionType, acq.strikePrice, acq.expirationDate,
        method, identicalSymbols,
      )) {
        candidates.push(acq);
        seenTxIds.add(acq.transactionId);
      }
    }
  }

  // Also check byUnderlying for option <-> stock matching
  if (method === "METHOD_1") {
    const underlyingArr = byUnderlying.get(lossBase);
    if (underlyingArr) {
      const lo = lowerBound(underlyingArr, windowStart);
      const hi = upperBound(underlyingArr, windowEnd);

      for (let i = lo; i < hi; i++) {
        const acq = underlyingArr[i];
        if (seenTxIds.has(acq.transactionId)) continue;
        if (acq.transactionId === lossTransactionId) continue;
        if (acq.remainingQty <= 1e-10) continue;

        if (isSubstantiallyIdentical(
          lossSymbol, lossUnderlying, lossOptionType, lossStrike, lossExpiration,
          acq.symbol, acq.underlyingSymbol, acq.optionType, acq.strikePrice, acq.expirationDate,
          method, identicalSymbols,
        )) {
          candidates.push(acq);
          seenTxIds.add(acq.transactionId);
        }
      }
    }
  }

  // Sort: 30-day lookback priority (before sale date first), then FIFO
  candidates.sort((a, b) => {
    const aIsBefore = a.date.getTime() < saleDate.getTime();
    const bIsBefore = b.date.getTime() < saleDate.getTime();

    // Acquisitions before the sale date have priority
    if (aIsBefore && !bIsBefore) return -1;
    if (!aIsBefore && bIsBefore) return 1;

    // Within each group, FIFO (earliest first)
    return a.date.getTime() - b.date.getTime();
  });

  return candidates;
}

// ---------------------------------------------------------------------------
// Build lot reference map
// ---------------------------------------------------------------------------

function buildLotMap(lots: SecuritiesLotData[]): Map<number, MutableLotRef> {
  const map = new Map<number, MutableLotRef>();
  for (const lot of lots) {
    map.set(lot.id, {
      lotId: lot.id,
      costBasis: lot.totalCostBasis,
      quantity: lot.quantity,
      dateAcquired: new Date(lot.dateAcquired),
      adjustedAcquisitionDate: lot.adjustedAcquisitionDate
        ? new Date(lot.adjustedAcquisitionDate)
        : undefined,
      washSaleAdjustment: lot.washSaleAdjustment,
    });
  }
  return map;
}

// ---------------------------------------------------------------------------
// Detect if a loss event's replacement creates a cross-year carry-forward
// ---------------------------------------------------------------------------

function isCarryForward(saleDate: Date, replacementDate: Date): boolean {
  const saleYear = saleDate.getFullYear();
  const replYear = replacementDate.getFullYear();

  // Cross-year if the loss is in year X and the replacement is in year X+1
  // This covers: Dec loss + Jan replacement, Nov loss + Jan replacement, etc.
  // Also covers: Dec loss + Dec replacement where the adjusted lot carries into next year
  // (but that case is handled by the lot being open at year-end, not here)
  if (replYear > saleYear) {
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Build brokerage account type map from transactions
// ---------------------------------------------------------------------------

function inferBrokerageAccountTypes(
  allTransactions: SecuritiesTransaction[],
): Map<string, string> {
  // Without full brokerage data, we default everything to TAXABLE.
  // The compute API can pass richer info in the future.
  const map = new Map<string, string>();
  for (const tx of allTransactions) {
    if (tx.brokerageId && !map.has(tx.brokerageId)) {
      map.set(tx.brokerageId, "TAXABLE");
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// Main detection function
// ---------------------------------------------------------------------------

/**
 * Detects wash sales across all loss events and generates WashSaleResults.
 *
 * @param taxableEvents - All taxable events from the lot engine
 * @param lots - All lots (open and closed) from the lot engine
 * @param allTransactions - All transactions across all accounts
 * @param settings - User's substantially identical method preference
 * @param equivalenceGroups - User-defined equivalence groups
 * @param taxStatus - INVESTOR, TRADER_NO_MTM, or TRADER_MTM
 * @param brokerageAccountTypes - Map of brokerageId to account type string
 * @returns Array of WashSaleResult records
 */
export function detectWashSales(
  taxableEvents: SecuritiesTaxEvent[],
  lots: SecuritiesLotData[],
  allTransactions: SecuritiesTransaction[],
  settings: { substantiallyIdenticalMethod: string },
  equivalenceGroups: { symbols: string[] }[],
  taxStatus: string,
  brokerageAccountTypes?: Map<string, string>,
): WashSaleResult[] {
  // Mark-to-market traders have no wash sale rules
  if (taxStatus === "TRADER_MTM") {
    return [];
  }

  const method = settings.substantiallyIdenticalMethod || "METHOD_1";

  // Build brokerage account types if not provided
  const accountTypes = brokerageAccountTypes || inferBrokerageAccountTypes(allTransactions);

  // Build acquisition indexes from all transactions
  const { bySymbol, byUnderlying, symbolToUnderlying } = buildAcquisitionIndexes(
    allTransactions,
    accountTypes,
  );

  // Build mutable lot map for basis adjustments
  const lotMap = buildLotMap(lots);

  // Transaction lookup for option details
  const txById = new Map<number, SecuritiesTransaction>();
  for (const tx of allTransactions) {
    txById.set(tx.id, tx);
  }

  const results: WashSaleResult[] = [];

  // Collect all capital loss events
  let lossEvents = taxableEvents.filter(
    (ev) => ev.gainLoss < 0 && ev.gainType === "CAPITAL",
  );

  // Sort by date, then by transaction ID for stable ordering
  lossEvents.sort((a, b) => {
    const dateDiff = new Date(a.dateSold).getTime() - new Date(b.dateSold).getTime();
    return dateDiff !== 0 ? dateDiff : a.transactionId - b.transactionId;
  });

  // Track which loss events have been fully matched
  const lossRemainingAmounts = new Map<string, number>();
  for (const ev of lossEvents) {
    const key = `${ev.transactionId}-${ev.lotId || 0}`;
    lossRemainingAmounts.set(key, Math.abs(ev.gainLoss));
  }

  // Daisy chain loop
  let iteration = 0;
  let hasNewLosses = true;

  while (hasNewLosses && iteration < MAX_DAISY_CHAIN_ITERATIONS) {
    hasNewLosses = false;
    iteration++;

    for (const lossEvent of lossEvents) {
      const lossKey = `${lossEvent.transactionId}-${lossEvent.lotId || 0}`;
      const remainingLoss = lossRemainingAmounts.get(lossKey) || 0;

      if (remainingLoss <= 0.005) continue;

      const saleDate = startOfDay(new Date(lossEvent.dateSold));
      const totalLossQty = lossEvent.quantity;
      const lossSym = lossEvent.symbol.toUpperCase();

      // Get the original transaction for option details
      const lossTx = txById.get(lossEvent.transactionId);
      const lossUnderlying = lossTx?.underlyingSymbol || null;
      const lossOptionType = lossTx?.optionType || null;
      const lossStrike = lossTx?.strikePrice ? toNum(lossTx.strikePrice) : null;
      const lossExpiration = lossTx?.expirationDate ? new Date(lossTx.expirationDate) : null;

      // Get substantially identical symbols
      const identicalSymbols = getSubstantiallyIdenticalSymbols(
        lossSym,
        lossUnderlying,
        method,
        equivalenceGroups,
        symbolToUnderlying,
      );

      // Find matching acquisitions in the 61-day window
      const candidates = findWindowAcquisitions(
        saleDate,
        lossSym,
        lossUnderlying,
        lossOptionType,
        lossStrike,
        lossExpiration,
        method,
        identicalSymbols,
        bySymbol,
        byUnderlying,
        lossEvent.transactionId,
      );

      if (candidates.length === 0) continue;

      // Match acquisitions FIFO within window (already sorted with lookback priority)
      let lossRemaining = remainingLoss;

      for (const acq of candidates) {
        if (lossRemaining <= 0.005) break;
        if (acq.remainingQty <= 1e-10) continue;

        // Determine how much of this acquisition matches
        const matchedQty = Math.min(acq.remainingQty, totalLossQty);

        // Prorate the disallowed amount
        const disallowedAmount = totalLossQty > 0
          ? Math.min(lossRemaining, Math.abs(lossEvent.gainLoss) * (matchedQty / totalLossQty))
          : 0;

        if (disallowedAmount <= 0.005) continue;

        // Check if replacement is in a tax-deferred account
        const isPermanent = TAX_DEFERRED_ACCOUNTS.has(acq.accountType);

        // Compute holding period tack days (days the loss lot was held)
        const lossAcquiredDate = new Date(lossEvent.dateAcquired);
        const tackDays = daysBetween(lossAcquiredDate, saleDate);

        // Determine carry-forward status
        const cf = isCarryForward(saleDate, acq.date);

        // Determine the year (from the sale date)
        const year = saleDate.getFullYear();

        // Create result
        const washSale: WashSaleResult = {
          lossTransactionId: lossEvent.transactionId,
          replacementTransactionId: acq.transactionId,
          lossLotId: lossEvent.lotId,
          replacementLotId: acq.lotId,
          disallowedAmount: Math.round(disallowedAmount * 100) / 100,
          isPermanent,
          basisAdjustment: isPermanent ? 0 : Math.round(disallowedAmount * 100) / 100,
          holdingPeriodTackDays: isPermanent ? 0 : Math.max(0, tackDays),
          year,
          carryForward: cf,
        };

        results.push(washSale);

        // Update remaining amounts
        lossRemaining -= disallowedAmount;
        lossRemainingAmounts.set(lossKey, Math.max(0, lossRemaining));

        // Consume from the acquisition
        acq.remainingQty -= matchedQty;

        // Adjust replacement lot basis (if not permanent and lot exists)
        if (!isPermanent && acq.lotId) {
          const lotRef = lotMap.get(acq.lotId);
          if (lotRef) {
            lotRef.costBasis += disallowedAmount;
            lotRef.washSaleAdjustment += disallowedAmount;

            // Tack holding period: adjust the acquisition date backward
            if (tackDays > 0) {
              const baseDate = lotRef.adjustedAcquisitionDate || lotRef.dateAcquired;
              const adjusted = new Date(baseDate.getTime() - tackDays * MILLIS_PER_DAY);
              lotRef.adjustedAcquisitionDate = adjusted;
            }
          }
        }
      }
    }

    // Daisy-chain: check if any basis adjustments created new losses
    // A lot that received a wash sale basis adjustment and was subsequently sold
    // might now have a loss (adjusted cost basis > proceeds).
    // Build a set of adjusted lot IDs for quick lookup.
    const adjustedLotIds = new Set<number>();
    for (const [, lotRef] of lotMap) {
      if (lotRef.washSaleAdjustment > 0) {
        adjustedLotIds.add(lotRef.lotId);
      }
    }

    // Find new loss events from adjusted lots that weren't in the original set
    const existingLossKeys = new Set<string>();
    for (const ev of lossEvents) {
      existingLossKeys.add(`${ev.transactionId}-${ev.lotId || 0}`);
    }

    const newLossEvents: SecuritiesTaxEvent[] = [];
    for (const ev of taxableEvents) {
      if (ev.gainType !== "CAPITAL") continue;
      if (!ev.lotId || !adjustedLotIds.has(ev.lotId)) continue;

      const lotRef = lotMap.get(ev.lotId);
      if (!lotRef) continue;

      // Recalculate gain/loss with adjusted basis
      const adjustedCostBasis = ev.costBasis + lotRef.washSaleAdjustment;
      const adjustedGainLoss = ev.proceeds - adjustedCostBasis;

      if (adjustedGainLoss >= 0) continue;

      const key = `${ev.transactionId}-${ev.lotId}`;
      if (existingLossKeys.has(key)) continue;

      // Create a synthetic loss event for the adjustment
      const newEv: SecuritiesTaxEvent = {
        ...ev,
        costBasis: adjustedCostBasis,
        gainLoss: adjustedGainLoss,
      };

      newLossEvents.push(newEv);
      lossRemainingAmounts.set(key, Math.abs(adjustedGainLoss));
    }

    if (newLossEvents.length > 0) {
      hasNewLosses = true;
      lossEvents = newLossEvents.sort((a, b) => {
        const dateDiff = new Date(a.dateSold).getTime() - new Date(b.dateSold).getTime();
        return dateDiff !== 0 ? dateDiff : a.transactionId - b.transactionId;
      });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Apply wash sale adjustments to lots and events
// ---------------------------------------------------------------------------

/**
 * Applies wash sale results back to the lots and taxable events arrays.
 * Mutates the input arrays in place.
 */
export function applyWashSaleAdjustments(
  washSales: WashSaleResult[],
  lots: SecuritiesLotData[],
  taxableEvents: SecuritiesTaxEvent[],
): void {
  if (washSales.length === 0) return;

  // Index lots by ID
  const lotById = new Map<number, SecuritiesLotData>();
  for (const lot of lots) {
    lotById.set(lot.id, lot);
  }

  // Index taxable events by transactionId + lotId
  const eventsByKey = new Map<string, SecuritiesTaxEvent[]>();
  for (const ev of taxableEvents) {
    const key = `${ev.transactionId}-${ev.lotId || 0}`;
    if (!eventsByKey.has(key)) eventsByKey.set(key, []);
    eventsByKey.get(key)!.push(ev);
  }

  // Aggregate adjustments per replacement lot
  const lotAdjustments = new Map<number, { basisAdd: number; tackDays: number }>();
  // Aggregate disallowed amounts per loss event
  const eventDisallowed = new Map<string, number>();

  for (const ws of washSales) {
    // Track disallowed amounts on loss events
    const lossKey = `${ws.lossTransactionId}-${ws.lossLotId || 0}`;
    eventDisallowed.set(lossKey, (eventDisallowed.get(lossKey) || 0) + ws.disallowedAmount);

    // Track basis adjustments on replacement lots
    if (!ws.isPermanent && ws.replacementLotId) {
      const existing = lotAdjustments.get(ws.replacementLotId) || { basisAdd: 0, tackDays: 0 };
      existing.basisAdd += ws.basisAdjustment;
      existing.tackDays = Math.max(existing.tackDays, ws.holdingPeriodTackDays);
      lotAdjustments.set(ws.replacementLotId, existing);
    }
  }

  // Apply to replacement lots
  for (const [lotId, adj] of lotAdjustments) {
    const lot = lotById.get(lotId);
    if (!lot) continue;

    lot.washSaleAdjustment += adj.basisAdd;
    lot.totalCostBasis += adj.basisAdd;
    if (lot.quantity > 0) {
      lot.costBasisPerShare = lot.totalCostBasis / lot.quantity;
    }

    // Tack holding period
    if (adj.tackDays > 0) {
      const baseDate = lot.adjustedAcquisitionDate
        ? new Date(lot.adjustedAcquisitionDate)
        : new Date(lot.dateAcquired);
      lot.adjustedAcquisitionDate = new Date(baseDate.getTime() - adj.tackDays * MILLIS_PER_DAY);
    }
  }

  // Apply wash sale codes and adjustments to loss events
  for (const [key, disallowed] of eventDisallowed) {
    const events = eventsByKey.get(key);
    if (!events) continue;

    for (const ev of events) {
      ev.washSaleCode = "W";
      ev.washSaleAdjustment = Math.round(disallowed * 100) / 100;
    }
  }

  // Mark permanently disallowed events
  for (const ws of washSales) {
    if (!ws.isPermanent) continue;
    const lossKey = `${ws.lossTransactionId}-${ws.lossLotId || 0}`;
    const events = eventsByKey.get(lossKey);
    if (!events) continue;
    for (const ev of events) {
      ev.washSaleCode = "W";
    }
  }
}

// ---------------------------------------------------------------------------
// Summary statistics for the UI
// ---------------------------------------------------------------------------

export interface WashSaleSummary {
  totalDisallowed: number;
  permanentlyDisallowed: number;
  temporarilyDisallowed: number;
  carryForwardCount: number;
  totalWashSales: number;
}

export function computeWashSaleSummary(washSales: WashSaleResult[]): WashSaleSummary {
  let totalDisallowed = 0;
  let permanentlyDisallowed = 0;
  let temporarilyDisallowed = 0;
  let carryForwardCount = 0;

  for (const ws of washSales) {
    totalDisallowed += ws.disallowedAmount;
    if (ws.isPermanent) {
      permanentlyDisallowed += ws.disallowedAmount;
    } else {
      temporarilyDisallowed += ws.disallowedAmount;
    }
    if (ws.carryForward) {
      carryForwardCount++;
    }
  }

  return {
    totalDisallowed: Math.round(totalDisallowed * 100) / 100,
    permanentlyDisallowed: Math.round(permanentlyDisallowed * 100) / 100,
    temporarilyDisallowed: Math.round(temporarilyDisallowed * 100) / 100,
    carryForwardCount,
    totalWashSales: washSales.length,
  };
}
