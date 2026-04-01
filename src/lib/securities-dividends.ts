/**
 * Securities Dividends Engine
 *
 * Processes dividend, interest, and return-of-capital transactions to produce
 * Schedule B data and lot basis adjustments.
 *
 * Handles:
 * - Ordinary and qualified dividend classification
 * - Dividend reinvestment recording
 * - Return-of-capital basis reduction across open lots (pro-rata)
 * - Excess return-of-capital as capital gain
 * - Interest income recording
 * - Foreign tax paid tracking
 * - Schedule B aggregation (flags if total > $1,500)
 */

import type { SecuritiesTransaction, SecuritiesLotData } from "./securities-lot-engine";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DividendRecord {
  transactionId: number;
  symbol: string;
  payer: string;
  amount: number;
  dividendType: string;
  foreignTaxPaid: number;
  year: number;
}

export interface LotBasisAdjustment {
  lotId: number;
  basisReduction: number;
}

export interface ScheduleBData {
  totalOrdinary: number;
  totalQualified: number;
  totalCapGainDistributions: number;
  totalForeignTax: number;
  totalInterest: number;
  requiresScheduleB: boolean;
  byPayer: Record<string, { ordinary: number; qualified: number }>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SCHEDULE_B_THRESHOLD = 1500;

const DIVIDEND_TYPES = new Set([
  "DIVIDEND",
  "DIVIDEND_REINVEST",
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toNum(v: number | { toString(): string } | null | undefined): number {
  if (v === null || v === undefined) return 0;
  return typeof v === "number" ? v : Number(v);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// Main processing function
// ---------------------------------------------------------------------------

/**
 * Processes all dividend/interest/return-of-capital transactions.
 *
 * @param transactions - All securities transactions for the user
 * @param openLots - Open lots (used for return-of-capital basis reduction)
 * @returns Dividend records, lot basis adjustments, and Schedule B data
 */
export function processDividends(
  transactions: SecuritiesTransaction[],
  openLots: SecuritiesLotData[],
): {
  dividends: DividendRecord[];
  lotAdjustments: LotBasisAdjustment[];
  scheduleBData: ScheduleBData;
} {
  const dividends: DividendRecord[] = [];
  const lotAdjustments: LotBasisAdjustment[] = [];

  // Build a mutable map of open lots keyed by symbol for RoC processing
  const lotsBySymbol = new Map<string, { lotId: number; basis: number; qty: number }[]>();
  for (const lot of openLots) {
    if (lot.status !== "OPEN") continue;
    const sym = lot.symbol.toUpperCase();
    if (!lotsBySymbol.has(sym)) lotsBySymbol.set(sym, []);
    lotsBySymbol.get(sym)!.push({
      lotId: lot.id,
      basis: toNum(lot.totalCostBasis),
      qty: toNum(lot.quantity),
    });
  }

  // Track cumulative return-of-capital per symbol for excess detection
  const cumulativeRoC = new Map<string, number>();

  // Schedule B accumulators
  let totalOrdinary = 0;
  let totalQualified = 0;
  let totalCapGainDistributions = 0;
  let totalForeignTax = 0;
  let totalInterest = 0;
  const byPayer: Record<string, { ordinary: number; qualified: number }> = {};

  // Filter and sort relevant transactions by date
  const relevant = transactions.filter(
    (tx) =>
      tx.type === "DIVIDEND" ||
      tx.type === "DIVIDEND_REINVEST" ||
      tx.type === "INTEREST" ||
      tx.type === "RETURN_OF_CAPITAL",
  );
  relevant.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  for (const tx of relevant) {
    const sym = tx.symbol.toUpperCase();
    const amount = toNum(tx.totalAmount) || toNum(tx.quantity) * toNum(tx.price);
    const year = new Date(tx.date).getFullYear();
    const payer = sym; // Use symbol as payer
    const foreignTax = toNum(tx.fees); // Foreign tax often tracked in fees field

    switch (tx.type) {
      // ----------------------------------------------------------------
      // Dividends (ordinary and qualified)
      // ----------------------------------------------------------------
      case "DIVIDEND":
      case "DIVIDEND_REINVEST": {
        const divType = tx.dividendType || "QUALIFIED";

        const record: DividendRecord = {
          transactionId: tx.id,
          symbol: sym,
          payer,
          amount: round2(amount),
          dividendType: divType,
          foreignTaxPaid: round2(foreignTax),
          year,
        };
        dividends.push(record);

        // Accumulate Schedule B data
        if (divType === "QUALIFIED") {
          totalQualified += amount;
          if (!byPayer[payer]) byPayer[payer] = { ordinary: 0, qualified: 0 };
          byPayer[payer].qualified += amount;
        } else if (divType === "CAP_GAIN_DISTRIBUTION") {
          totalCapGainDistributions += amount;
        } else {
          // ORDINARY or any other type
          totalOrdinary += amount;
          if (!byPayer[payer]) byPayer[payer] = { ordinary: 0, qualified: 0 };
          byPayer[payer].ordinary += amount;
        }

        // Qualified dividends also count toward ordinary for Schedule B
        // (qualified is a subset of ordinary on actual 1099-DIV)
        if (divType === "QUALIFIED") {
          totalOrdinary += amount;
          if (!byPayer[payer]) byPayer[payer] = { ordinary: 0, qualified: 0 };
          byPayer[payer].ordinary += amount;
        }

        totalForeignTax += foreignTax;
        break;
      }

      // ----------------------------------------------------------------
      // Interest income
      // ----------------------------------------------------------------
      case "INTEREST": {
        const record: DividendRecord = {
          transactionId: tx.id,
          symbol: sym,
          payer,
          amount: round2(amount),
          dividendType: "INTEREST",
          foreignTaxPaid: round2(foreignTax),
          year,
        };
        dividends.push(record);

        totalInterest += amount;
        totalForeignTax += foreignTax;
        break;
      }

      // ----------------------------------------------------------------
      // Return of capital: reduce basis across open lots for the symbol
      // ----------------------------------------------------------------
      case "RETURN_OF_CAPITAL": {
        const symLots = lotsBySymbol.get(sym);
        if (!symLots || symLots.length === 0) break;

        const totalBasis = symLots.reduce((s, l) => s + l.basis, 0);
        if (totalBasis <= 0) break;

        // Track cumulative RoC
        const prevCumulative = cumulativeRoC.get(sym) || 0;
        const newCumulative = prevCumulative + amount;
        cumulativeRoC.set(sym, newCumulative);

        // If cumulative RoC exceeds total basis, the excess is a capital gain
        let effectiveReduction = amount;
        let excessGain = 0;

        if (newCumulative > totalBasis) {
          // Only reduce by whatever basis remains
          const basisRemaining = Math.max(0, totalBasis - prevCumulative);
          effectiveReduction = Math.min(amount, basisRemaining);
          excessGain = amount - effectiveReduction;
        }

        // Apply pro-rata reduction across lots
        if (effectiveReduction > 0) {
          for (const lot of symLots) {
            if (lot.basis <= 0) continue;
            const proportion = lot.basis / totalBasis;
            const reduction = round2(effectiveReduction * proportion);

            lot.basis = Math.max(0, lot.basis - reduction);
            lotAdjustments.push({
              lotId: lot.lotId,
              basisReduction: reduction,
            });
          }
        }

        // Record excess as a capital gain distribution dividend
        if (excessGain > 0.005) {
          dividends.push({
            transactionId: tx.id,
            symbol: sym,
            payer,
            amount: round2(excessGain),
            dividendType: "ROC_EXCESS_GAIN",
            foreignTaxPaid: 0,
            year,
          });
          totalCapGainDistributions += excessGain;
        }

        break;
      }
    }
  }

  // Determine if Schedule B is required (total ordinary dividends + interest > $1,500)
  const requiresScheduleB =
    round2(totalOrdinary) > SCHEDULE_B_THRESHOLD ||
    round2(totalInterest) > SCHEDULE_B_THRESHOLD;

  // Round payer totals
  for (const key of Object.keys(byPayer)) {
    byPayer[key].ordinary = round2(byPayer[key].ordinary);
    byPayer[key].qualified = round2(byPayer[key].qualified);
  }

  const scheduleBData: ScheduleBData = {
    totalOrdinary: round2(totalOrdinary),
    totalQualified: round2(totalQualified),
    totalCapGainDistributions: round2(totalCapGainDistributions),
    totalForeignTax: round2(totalForeignTax),
    totalInterest: round2(totalInterest),
    requiresScheduleB,
    byPayer,
  };

  return { dividends, lotAdjustments, scheduleBData };
}
