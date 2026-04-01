/**
 * Securities Lot Engine
 *
 * Core calculation engine for securities tax lot tracking.
 * Processes transactions in chronological order, creates lots on buys,
 * consumes lots on sells, and generates taxable events.
 *
 * Lot selection methods: FIFO, LIFO, HIFO, SPECIFIC_ID, AVERAGE_COST
 * Ported from the crypto selectLots pattern in tax-calculator.ts with
 * additions for Specific ID and Average Cost.
 */

import type { Decimal } from "@prisma/client/runtime/library";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Input transaction – matches SecuritiesTransaction Prisma model shape */
export interface SecuritiesTransaction {
  id: number;
  userId: string;
  brokerageId?: string | null;
  date: Date;
  type: string;
  symbol: string;
  assetClass: string;
  quantity: number | Decimal;
  price: number | Decimal;
  fees: number | Decimal;
  totalAmount?: number | Decimal | null;
  lotId?: string | null;
  underlyingSymbol?: string | null;
  optionType?: string | null;
  strikePrice?: number | Decimal | null;
  expirationDate?: Date | null;
  dividendType?: string | null;
  isCovered: boolean;
  isSection1256: boolean;
  notes?: string | null;
}

export interface SecuritiesLotData {
  id: number;
  symbol: string;
  assetClass: string;
  quantity: number;
  originalQuantity: number;
  costBasisPerShare: number;
  totalCostBasis: number;
  dateAcquired: Date;
  source: string;
  isCovered: boolean;
  isSection1256: boolean;
  brokerageId?: string;
  washSaleAdjustment: number;
  adjustedAcquisitionDate?: Date;
  status: "OPEN" | "CLOSED";
  dateSold?: Date;
  holdingPeriod?: string;
}

export interface SecuritiesTaxEvent {
  transactionId: number;
  lotId?: number;
  symbol: string;
  assetClass: string;
  quantity: number;
  dateAcquired: Date;
  dateSold: Date;
  proceeds: number;
  costBasis: number;
  gainLoss: number;
  holdingPeriod: "SHORT_TERM" | "LONG_TERM";
  gainType: "CAPITAL" | "ORDINARY" | "SECTION_1256";
  form8949Box?: string;
  formDestination: string;
  washSaleCode?: string;
  washSaleAdjustment: number;
  year: number;
}

export interface SecuritiesDividendRecord {
  transactionId: number;
  symbol: string;
  amount: number;
  dividendType: string;
  year: number;
}

// ---------------------------------------------------------------------------
// Internal mutable lot used during computation
// ---------------------------------------------------------------------------

interface MutableLot {
  id: number;
  symbol: string;
  assetClass: string;
  quantity: number;
  originalQuantity: number;
  costBasisPerShare: number;
  totalCostBasis: number;
  dateAcquired: Date;
  source: string;
  isCovered: boolean;
  isSection1256: boolean;
  brokerageId?: string;
  washSaleAdjustment: number;
  adjustedAcquisitionDate?: Date;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toNum(v: number | Decimal | null | undefined): number {
  if (v === null || v === undefined) return 0;
  return typeof v === "number" ? v : Number(v);
}

/** Returns true if >1 year between two dates */
function isLongTerm(acquired: Date, sold: Date): boolean {
  const oneYearLater = new Date(acquired);
  oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);
  // Must be held MORE than one year (sold date > one year anniversary)
  return sold > oneYearLater;
}

function determineForm8949Box(
  holdingPeriod: "SHORT_TERM" | "LONG_TERM",
  isCovered: boolean,
): string {
  // For covered securities with basis reported to IRS:
  //   Short-term -> Box A, Long-term -> Box D
  // For covered securities but basis NOT reported (rare):
  //   Short-term -> Box B, Long-term -> Box E
  // For non-covered:
  //   Short-term -> Box C, Long-term -> Box F
  // We assume covered means basis reported to IRS.
  if (isCovered) {
    return holdingPeriod === "SHORT_TERM" ? "A" : "D";
  }
  return holdingPeriod === "SHORT_TERM" ? "C" : "F";
}

// ---------------------------------------------------------------------------
// Lot selection
// ---------------------------------------------------------------------------

/**
 * Select lots to consume for a sell transaction.
 * Returns references to the ORIGINAL lot objects (mutations propagate).
 */
function selectLots(
  lots: MutableLot[],
  amount: number,
  method: string,
  specificLotId?: string | null,
): MutableLot[] {
  if (lots.length === 0) return [];

  let sortedLots: MutableLot[];

  switch (method) {
    case "FIFO":
      sortedLots = [...lots].sort(
        (a, b) => a.dateAcquired.getTime() - b.dateAcquired.getTime(),
      );
      break;
    case "LIFO":
      sortedLots = [...lots].sort(
        (a, b) => b.dateAcquired.getTime() - a.dateAcquired.getTime(),
      );
      break;
    case "HIFO":
      sortedLots = [...lots].sort(
        (a, b) => b.costBasisPerShare - a.costBasisPerShare,
      );
      break;
    case "SPECIFIC_ID":
      if (specificLotId) {
        const match = lots.find((l) => String(l.id) === String(specificLotId));
        if (match) return [match];
      }
      // Fall back to FIFO if specific lot not found
      sortedLots = [...lots].sort(
        (a, b) => a.dateAcquired.getTime() - b.dateAcquired.getTime(),
      );
      break;
    case "AVERAGE_COST":
      // Average cost: return all lots for the symbol (will be handled specially)
      sortedLots = [...lots].sort(
        (a, b) => a.dateAcquired.getTime() - b.dateAcquired.getTime(),
      );
      break;
    default:
      sortedLots = [...lots];
  }

  const selected: MutableLot[] = [];
  let remaining = amount;

  for (const lot of sortedLots) {
    if (remaining <= 1e-10) break;
    selected.push(lot);
    remaining -= lot.quantity;
  }

  return selected;
}

// ---------------------------------------------------------------------------
// Tax-deferred account types
// ---------------------------------------------------------------------------

const TAX_DEFERRED_ACCOUNTS = new Set([
  "IRA_TRADITIONAL",
  "IRA_ROTH",
  "401K",
  "HSA",
  "529",
]);

// ---------------------------------------------------------------------------
// Main computation
// ---------------------------------------------------------------------------

export function computeSecuritiesLots(
  transactions: SecuritiesTransaction[],
  method: string,
  accountType: string,
): {
  lots: SecuritiesLotData[];
  taxableEvents: SecuritiesTaxEvent[];
  dividends: SecuritiesDividendRecord[];
} {
  // Sort by date ASC, then by id for stable ordering
  const sorted = [...transactions].sort((a, b) => {
    const dateDiff = new Date(a.date).getTime() - new Date(b.date).getTime();
    return dateDiff !== 0 ? dateDiff : a.id - b.id;
  });

  // Open lots keyed by symbol (long positions)
  const openLots: Record<string, MutableLot[]> = {};
  // Open short positions keyed by symbol
  interface ShortPosition {
    id: number;
    transactionId: number;
    symbol: string;
    assetClass: string;
    quantity: number;
    proceeds: number;
    proceedsPerShare: number;
    dateOpened: Date;
    isCovered: boolean;
    isSection1256: boolean;
    brokerageId?: string;
  }
  const openShorts: Record<string, ShortPosition[]> = {};
  // All lots (open + closed) for output
  const allLots: SecuritiesLotData[] = [];
  const taxableEvents: SecuritiesTaxEvent[] = [];
  const dividends: SecuritiesDividendRecord[] = [];

  let lotIdCounter = 1;
  const isTaxDeferred = TAX_DEFERRED_ACCOUNTS.has(accountType);

  for (const tx of sorted) {
    const sym = tx.symbol;
    const qty = toNum(tx.quantity);
    const price = toNum(tx.price);
    const fees = toNum(tx.fees);
    const totalOverride = tx.totalAmount ? toNum(tx.totalAmount) : null;
    const txDate = new Date(tx.date);
    const year = txDate.getFullYear();

    if (!openLots[sym]) openLots[sym] = [];

    switch (tx.type) {
      // ------------------------------------------------------------------
      // Acquisition types: create new lots
      // ------------------------------------------------------------------
      case "BUY":
      case "DIVIDEND_REINVEST":
      case "TRANSFER_IN":
      case "RSU_VEST":
      case "ESPP_PURCHASE": {
        const costBasis = totalOverride ?? qty * price + fees;
        const costPerShare = qty > 0 ? costBasis / qty : 0;

        const lot: MutableLot = {
          id: lotIdCounter++,
          symbol: sym,
          assetClass: tx.assetClass,
          quantity: qty,
          originalQuantity: qty,
          costBasisPerShare: costPerShare,
          totalCostBasis: costBasis,
          dateAcquired: txDate,
          source: tx.type,
          isCovered: tx.isCovered,
          isSection1256: tx.isSection1256,
          brokerageId: tx.brokerageId ?? undefined,
          washSaleAdjustment: 0,
        };

        openLots[sym].push(lot);

        allLots.push({
          ...lot,
          status: "OPEN",
        });
        break;
      }

      // ------------------------------------------------------------------
      // Disposal types: consume lots and generate taxable events
      // ------------------------------------------------------------------
      // ------------------------------------------------------------------
      // Short sale: SELL_SHORT consumes long lots first (flip/close), then
      // opens a short position for any remaining quantity.
      // e.g., Own 100, SELL_SHORT 150 → close 100 long (taxable), open 50 short
      // ------------------------------------------------------------------
      case "SELL_SHORT": {
        const proceedsPerShare = price;
        const totalProceeds = totalOverride ?? qty * price - fees;
        let remainingQty = qty;

        // First: consume any existing long lots for this symbol
        const symLots = openLots[sym] || [];
        if (symLots.length > 0) {
          const selected = selectLots(symLots, Math.min(remainingQty, symLots.reduce((s, l) => s + l.quantity, 0)), method);
          for (const lot of selected) {
            if (remainingQty <= 1e-10) break;
            const consumed = Math.min(lot.quantity, remainingQty);
            const portionProceeds = totalProceeds * (consumed / qty);
            const costBasis = lot.costBasisPerShare * consumed;
            const gainLoss = Math.round((portionProceeds - costBasis) * 100) / 100;
            const holdPeriod = isLongTerm(lot.dateAcquired, txDate) ? "LONG_TERM" as const : "SHORT_TERM" as const;

            if (!isTaxDeferred) {
              taxableEvents.push({
                transactionId: tx.id,
                lotId: lot.id,
                symbol: sym,
                assetClass: tx.assetClass,
                quantity: consumed,
                dateAcquired: lot.dateAcquired,
                dateSold: txDate,
                proceeds: Math.round(portionProceeds * 100) / 100,
                costBasis: Math.round(costBasis * 100) / 100,
                gainLoss,
                holdingPeriod: holdPeriod,
                gainType: tx.isSection1256 ? "SECTION_1256" : "CAPITAL",
                form8949Box: determineForm8949Box(holdPeriod, lot.isCovered),
                formDestination: tx.isSection1256 ? "6781" : "8949",
                washSaleAdjustment: 0,
                year,
              });
            }

            lot.quantity -= consumed;
            lot.totalCostBasis -= costBasis;
            remainingQty -= consumed;

            const allLotEntry = allLots.find((l) => l.id === lot.id);
            if (allLotEntry) {
              if (lot.quantity <= 1e-10) {
                allLotEntry.status = "CLOSED";
                allLotEntry.dateSold = txDate;
                allLotEntry.holdingPeriod = holdPeriod;
                allLotEntry.quantity = 0;
              } else {
                allLotEntry.quantity = lot.quantity;
                allLotEntry.totalCostBasis = lot.totalCostBasis;
              }
            }
          }
          openLots[sym] = symLots.filter((l) => l.quantity > 1e-10);
        }

        // Then: any remaining quantity opens a new short position
        if (remainingQty > 1e-10) {
          const shortProceeds = totalProceeds * (remainingQty / qty);
          if (!openShorts[sym]) openShorts[sym] = [];
          openShorts[sym].push({
            id: lotIdCounter++,
            transactionId: tx.id,
            symbol: sym,
            assetClass: tx.assetClass,
            quantity: remainingQty,
            proceeds: shortProceeds,
            proceedsPerShare: remainingQty > 0 ? shortProceeds / remainingQty : 0,
            dateOpened: txDate,
            isCovered: tx.isCovered,
            isSection1256: tx.isSection1256,
            brokerageId: tx.brokerageId ?? undefined,
          });
        }
        break;
      }

      // ------------------------------------------------------------------
      // BUY_TO_COVER: closes a short position (taxable event)
      // ------------------------------------------------------------------
      case "BUY_TO_COVER": {
        const coverCost = totalOverride ?? qty * price + fees;
        let remainingQty = qty;
        const symShorts = openShorts[sym] || [];

        // Match against open short positions (FIFO)
        while (remainingQty > 0 && symShorts.length > 0) {
          const shortPos = symShorts[0];
          const coverQty = Math.min(remainingQty, shortPos.quantity);
          const coverPortion = coverQty / qty;
          const coverCostPortion = coverCost * coverPortion;
          const proceedsPortion = shortPos.proceedsPerShare * coverQty;
          const gainLoss = Math.round((proceedsPortion - coverCostPortion) * 100) / 100;

          // Short sales are generally short-term unless specific conditions met
          const holdPeriod: "SHORT_TERM" | "LONG_TERM" = "SHORT_TERM";

          if (!isTaxDeferred) {
            taxableEvents.push({
              transactionId: tx.id,
              symbol: sym,
              assetClass: tx.assetClass,
              quantity: coverQty,
              dateAcquired: shortPos.dateOpened,
              dateSold: txDate,
              proceeds: Math.round(proceedsPortion * 100) / 100,
              costBasis: Math.round(coverCostPortion * 100) / 100,
              gainLoss,
              holdingPeriod: holdPeriod,
              gainType: shortPos.isSection1256 ? "SECTION_1256" : "CAPITAL",
              form8949Box: determineForm8949Box(holdPeriod, shortPos.isCovered),
              formDestination: shortPos.isSection1256 ? "6781" : "8949",
              washSaleAdjustment: 0,
              year,
            });
          }

          shortPos.quantity -= coverQty;
          if (shortPos.quantity <= 0) symShorts.shift();
          remainingQty -= coverQty;
        }

        // If no matching short positions, treat as a regular buy (create lot)
        if (remainingQty > 0) {
          const remainCost = coverCost * (remainingQty / qty);
          const costPerShare = remainingQty > 0 ? remainCost / remainingQty : 0;
          const lot: MutableLot = {
            id: lotIdCounter++,
            symbol: sym,
            assetClass: tx.assetClass,
            quantity: remainingQty,
            originalQuantity: remainingQty,
            costBasisPerShare: costPerShare,
            totalCostBasis: remainCost,
            dateAcquired: txDate,
            source: "BUY_TO_COVER",
            isCovered: tx.isCovered,
            isSection1256: tx.isSection1256,
            brokerageId: tx.brokerageId ?? undefined,
            washSaleAdjustment: 0,
          };
          openLots[sym].push(lot);
          allLots.push({ ...lot, status: "OPEN" });
        }
        break;
      }

      // ------------------------------------------------------------------
      // Regular sell: consume long lots
      // ------------------------------------------------------------------
      case "SELL": {
        const proceeds = totalOverride ?? qty * price - fees;
        let remainingQty = qty;

        const symLots = openLots[sym];
        if (!symLots || symLots.length === 0) {
          // No lots — generate event with zero cost basis
          if (!isTaxDeferred) {
            const holdPeriod: "SHORT_TERM" | "LONG_TERM" = "SHORT_TERM";
            taxableEvents.push({
              transactionId: tx.id,
              symbol: sym,
              assetClass: tx.assetClass,
              quantity: qty,
              dateAcquired: txDate,
              dateSold: txDate,
              proceeds,
              costBasis: 0,
              gainLoss: proceeds,
              holdingPeriod: holdPeriod,
              gainType: tx.isSection1256 ? "SECTION_1256" : "CAPITAL",
              form8949Box: determineForm8949Box(holdPeriod, tx.isCovered),
              formDestination: tx.isSection1256 ? "6781" : "8949",
              washSaleAdjustment: 0,
              year,
            });
          }
          break;
        }

        // Average Cost method: compute weighted average first
        if (method === "AVERAGE_COST") {
          const totalQty = symLots.reduce((s, l) => s + l.quantity, 0);
          const totalBasis = symLots.reduce((s, l) => s + l.totalCostBasis, 0);
          const avgCostPerShare = totalQty > 0 ? totalBasis / totalQty : 0;

          // Consume proportionally from lots (FIFO order)
          const selected = selectLots(symLots, remainingQty, "FIFO");
          for (const lot of selected) {
            if (remainingQty <= 1e-10) break;
            const consumed = Math.min(lot.quantity, remainingQty);
            const costBasis = consumed * avgCostPerShare;
            const portionProceeds = qty > 0 ? proceeds * (consumed / qty) : 0;

            const holdPeriod = isLongTerm(lot.dateAcquired, txDate)
              ? "LONG_TERM" as const
              : "SHORT_TERM" as const;

            if (!isTaxDeferred) {
              taxableEvents.push({
                transactionId: tx.id,
                lotId: lot.id,
                symbol: sym,
                assetClass: tx.assetClass,
                quantity: consumed,
                dateAcquired: lot.dateAcquired,
                dateSold: txDate,
                proceeds: portionProceeds,
                costBasis,
                gainLoss: portionProceeds - costBasis,
                holdingPeriod: holdPeriod,
                gainType: tx.isSection1256 ? "SECTION_1256" : "CAPITAL",
                form8949Box: determineForm8949Box(holdPeriod, lot.isCovered),
                formDestination: tx.isSection1256 ? "6781" : "8949",
                washSaleAdjustment: 0,
                year,
              });
            }

            lot.quantity -= consumed;
            lot.totalCostBasis -= costBasis;
            remainingQty -= consumed;

            // Update allLots entry
            const allLotEntry = allLots.find((l) => l.id === lot.id);
            if (allLotEntry) {
              if (lot.quantity <= 1e-10) {
                allLotEntry.status = "CLOSED";
                allLotEntry.dateSold = txDate;
                allLotEntry.holdingPeriod = holdPeriod;
                allLotEntry.quantity = 0;
              } else {
                allLotEntry.quantity = lot.quantity;
                allLotEntry.totalCostBasis = lot.totalCostBasis;
              }
            }
          }

          // Remove empty lots
          openLots[sym] = openLots[sym].filter((l) => l.quantity > 1e-10);
          break;
        }

        // Non-average methods
        const selected = selectLots(symLots, remainingQty, method, tx.lotId);

        for (const lot of selected) {
          if (remainingQty <= 1e-10) break;
          const consumed = Math.min(lot.quantity, remainingQty);
          const costBasis = consumed * lot.costBasisPerShare;
          const portionProceeds = qty > 0 ? proceeds * (consumed / qty) : 0;

          const holdPeriod = isLongTerm(
            lot.adjustedAcquisitionDate ?? lot.dateAcquired,
            txDate,
          )
            ? "LONG_TERM" as const
            : "SHORT_TERM" as const;

          if (!isTaxDeferred) {
            taxableEvents.push({
              transactionId: tx.id,
              lotId: lot.id,
              symbol: sym,
              assetClass: tx.assetClass,
              quantity: consumed,
              dateAcquired: lot.dateAcquired,
              dateSold: txDate,
              proceeds: portionProceeds,
              costBasis,
              gainLoss: portionProceeds - costBasis,
              holdingPeriod: holdPeriod,
              gainType: tx.isSection1256 ? "SECTION_1256" : "CAPITAL",
              form8949Box: determineForm8949Box(holdPeriod, lot.isCovered),
              formDestination: tx.isSection1256 ? "6781" : "8949",
              washSaleAdjustment: lot.washSaleAdjustment,
              year,
            });
          }

          lot.quantity -= consumed;
          lot.totalCostBasis -= costBasis;
          remainingQty -= consumed;

          // Update allLots entry
          const allLotEntry = allLots.find((l) => l.id === lot.id);
          if (allLotEntry) {
            if (lot.quantity <= 1e-10) {
              allLotEntry.status = "CLOSED";
              allLotEntry.dateSold = txDate;
              allLotEntry.holdingPeriod = holdPeriod;
              allLotEntry.quantity = 0;
            } else {
              allLotEntry.quantity = lot.quantity;
              allLotEntry.totalCostBasis = lot.totalCostBasis;
            }
          }
        }

        // Remove fully consumed lots
        openLots[sym] = openLots[sym].filter((l) => l.quantity > 1e-10);
        break;
      }

      // ------------------------------------------------------------------
      // Dividends: record income, no lot change
      // ------------------------------------------------------------------
      case "DIVIDEND":
      case "INTEREST": {
        const amount = totalOverride ?? qty * price;
        dividends.push({
          transactionId: tx.id,
          symbol: sym,
          amount,
          dividendType: tx.dividendType ?? (tx.type === "INTEREST" ? "ORDINARY" : "QUALIFIED"),
          year,
        });
        break;
      }

      // ------------------------------------------------------------------
      // Stock split: adjust all open lots for the symbol
      // ------------------------------------------------------------------
      case "SPLIT": {
        // quantity field represents the split ratio (e.g. 2 for 2:1 split)
        // price field can be used for reverse splits (ratio < 1)
        const splitRatio = qty; // e.g. 4 for a 4:1 split
        if (splitRatio <= 0) break;

        const symLots = openLots[sym];
        if (!symLots) break;

        for (const lot of symLots) {
          const oldQty = lot.quantity;
          const oldOrigQty = lot.originalQuantity;
          // Multiply quantity by ratio, divide cost basis per share by ratio
          lot.quantity = oldQty * splitRatio;
          lot.originalQuantity = oldOrigQty * splitRatio;
          lot.costBasisPerShare = lot.costBasisPerShare / splitRatio;
          // totalCostBasis stays the same

          // Update allLots entry
          const allLotEntry = allLots.find((l) => l.id === lot.id);
          if (allLotEntry) {
            allLotEntry.quantity = lot.quantity;
            allLotEntry.originalQuantity = lot.originalQuantity;
            allLotEntry.costBasisPerShare = lot.costBasisPerShare;
          }
        }
        break;
      }

      // ------------------------------------------------------------------
      // Return of capital: reduce basis across all lots
      // ------------------------------------------------------------------
      case "RETURN_OF_CAPITAL": {
        const totalReturn = totalOverride ?? qty * price;
        const symLots = openLots[sym];
        if (!symLots || symLots.length === 0) break;

        const totalBasis = symLots.reduce((s, l) => s + l.totalCostBasis, 0);
        if (totalBasis <= 0) break;

        for (const lot of symLots) {
          // Pro-rata reduction
          const proportion = lot.totalCostBasis / totalBasis;
          const reduction = totalReturn * proportion;
          lot.totalCostBasis = Math.max(0, lot.totalCostBasis - reduction);
          lot.costBasisPerShare =
            lot.quantity > 0 ? lot.totalCostBasis / lot.quantity : 0;

          // Update allLots entry
          const allLotEntry = allLots.find((l) => l.id === lot.id);
          if (allLotEntry) {
            allLotEntry.totalCostBasis = lot.totalCostBasis;
            allLotEntry.costBasisPerShare = lot.costBasisPerShare;
          }
        }
        break;
      }

      // ------------------------------------------------------------------
      // Year-end FMV: record for Section 1256 / 475 mark-to-market
      // ------------------------------------------------------------------
      case "YEAR_END_FMV": {
        // For Section 1256 contracts: treated as sold at FMV on last business day
        if (tx.isSection1256) {
          const fmvPrice = price;
          const symLots = openLots[sym];
          if (!symLots) break;

          for (const lot of symLots) {
            const proceeds = lot.quantity * fmvPrice;
            const costBasis = lot.totalCostBasis;
            const gainLoss = proceeds - costBasis;

            if (!isTaxDeferred) {
              // Section 1256: 60% long-term, 40% short-term
              const longTermPortion = gainLoss * 0.6;
              const shortTermPortion = gainLoss * 0.4;

              if (Math.abs(shortTermPortion) > 0.005) {
                taxableEvents.push({
                  transactionId: tx.id,
                  lotId: lot.id,
                  symbol: sym,
                  assetClass: tx.assetClass,
                  quantity: lot.quantity,
                  dateAcquired: lot.dateAcquired,
                  dateSold: txDate,
                  proceeds: proceeds * 0.4,
                  costBasis: costBasis * 0.4,
                  gainLoss: shortTermPortion,
                  holdingPeriod: "SHORT_TERM",
                  gainType: "SECTION_1256",
                  formDestination: "6781",
                  washSaleAdjustment: 0,
                  year,
                });
              }

              if (Math.abs(longTermPortion) > 0.005) {
                taxableEvents.push({
                  transactionId: tx.id,
                  lotId: lot.id,
                  symbol: sym,
                  assetClass: tx.assetClass,
                  quantity: lot.quantity,
                  dateAcquired: lot.dateAcquired,
                  dateSold: txDate,
                  proceeds: proceeds * 0.6,
                  costBasis: costBasis * 0.6,
                  gainLoss: longTermPortion,
                  holdingPeriod: "LONG_TERM",
                  gainType: "SECTION_1256",
                  formDestination: "6781",
                  washSaleAdjustment: 0,
                  year,
                });
              }
            }

            // Reset basis to FMV for next year
            lot.totalCostBasis = proceeds;
            lot.costBasisPerShare = fmvPrice;
          }
        }
        break;
      }

      // ------------------------------------------------------------------
      // Transfer out: remove lots (not a taxable event)
      // ------------------------------------------------------------------
      case "TRANSFER_OUT": {
        let remainingQty2 = qty;
        const symLots = openLots[sym];
        if (!symLots) break;

        const selected = selectLots(symLots, remainingQty2, "FIFO");
        for (const lot of selected) {
          if (remainingQty2 <= 1e-10) break;
          const consumed = Math.min(lot.quantity, remainingQty2);
          lot.quantity -= consumed;
          lot.totalCostBasis -= consumed * lot.costBasisPerShare;
          remainingQty2 -= consumed;

          const allLotEntry = allLots.find((l) => l.id === lot.id);
          if (allLotEntry) {
            if (lot.quantity <= 1e-10) {
              allLotEntry.status = "CLOSED";
              allLotEntry.dateSold = txDate;
              allLotEntry.quantity = 0;
            } else {
              allLotEntry.quantity = lot.quantity;
              allLotEntry.totalCostBasis = lot.totalCostBasis;
            }
          }
        }
        openLots[sym] = openLots[sym].filter((l) => l.quantity > 1e-10);
        break;
      }

      // ------------------------------------------------------------------
      // Types we track but don't process lots for (yet)
      // ------------------------------------------------------------------
      case "MERGER":
      case "SPINOFF":
      case "OPTION_EXERCISE":
      case "OPTION_ASSIGNMENT":
      case "OPTION_EXPIRATION":
      default:
        // Future: implement merger/spinoff/option handling
        break;
    }
  }

  return { lots: allLots, taxableEvents, dividends };
}
