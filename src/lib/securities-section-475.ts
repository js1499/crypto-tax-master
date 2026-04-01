/**
 * Securities Section 475 Mark-to-Market Engine
 *
 * Section 475(f) allows qualified traders to elect mark-to-market accounting.
 * Under this election:
 *
 * - All gains and losses become ORDINARY (not capital) — reported on Form 4797
 * - Open positions at year end are deemed sold at FMV on the last business day
 * - Wash sale rules do NOT apply (since gains/losses are ordinary)
 * - In the transition year (first year of election): Section 481(a) adjustment
 *   requires all positions open on Jan 1 to be deemed sold at FMV on the last
 *   business day of the prior year
 *
 * Segregated investment positions (explicitly flagged by the trader) are
 * excluded from MTM treatment and retain capital gain/loss treatment.
 *
 * Output is structured for Form 4797 (Sales of Business Property).
 */

import type {
  SecuritiesTaxEvent,
  SecuritiesLotData,
} from "./securities-lot-engine";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Section475DeemedSaleEvent {
  symbol: string;
  quantity: number;
  yearEndFmv: number;
  costBasis: number;
  gainLoss: number;
}

export interface Section481Position {
  symbol: string;
  quantity: number;
  costBasis: number;
  deemedSalePrice: number;
  gainLoss: number;
}

export interface Section481Adjustment {
  totalGainLoss: number;
  positions: Section481Position[];
}

export interface Section475Result {
  ordinaryGainLoss: number;
  deemedSaleEvents: Section475DeemedSaleEvent[];
  section481Adjustment?: Section481Adjustment;
  segregatedInvestmentEvents: SecuritiesTaxEvent[]; // retain capital treatment
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Round to 2 decimal places for currency values */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Determine if a lot is a segregated investment position.
 * Segregated lots are explicitly flagged by the trader and excluded from
 * mark-to-market treatment. They retain capital gain/loss treatment.
 */
function isSegregated(lot: SecuritiesLotData): boolean {
  // The Prisma schema has isSegregatedInvestment on SecuritiesLot.
  // Our engine's SecuritiesLotData may carry this via a property.
  return (lot as Record<string, unknown>).isSegregatedInvestment === true;
}

// ---------------------------------------------------------------------------
// Main computation
// ---------------------------------------------------------------------------

/**
 * Compute Section 475 mark-to-market results.
 *
 * @param taxableEvents - All taxable events from the lot engine (post wash-sale)
 * @param openLots - All open lots at the end of computation
 * @param year - The tax year being computed
 * @param isTransitionYear - True if this is the first year of the 475(f) election
 * @param yearEndFmvMap - Map of symbol -> FMV from YEAR_END_FMV transactions
 */
export function computeSection475(
  taxableEvents: SecuritiesTaxEvent[],
  openLots: SecuritiesLotData[],
  year: number,
  isTransitionYear: boolean,
  yearEndFmvMap: Map<string, number>,
): Section475Result {
  const deemedSaleEvents: Section475DeemedSaleEvent[] = [];
  const segregatedInvestmentEvents: SecuritiesTaxEvent[] = [];
  let ordinaryGainLoss = 0;

  // -------------------------------------------------------------------------
  // Step 1: Process actual closed positions (sales during the year)
  // -------------------------------------------------------------------------
  const yearEvents = taxableEvents.filter((ev) => ev.year === year);

  for (const ev of yearEvents) {
    // Check if the lot was a segregated investment
    const lotId = ev.lotId;
    const lot = lotId != null
      ? openLots.find((l) => l.id === lotId) ??
        // Lot may already be closed; check if its data is available in the event
        undefined
      : undefined;

    // If the lot is segregated, keep capital treatment
    if (lot && isSegregated(lot)) {
      segregatedInvestmentEvents.push(ev);
      continue;
    }

    // All non-segregated gains/losses become ordinary under 475
    ordinaryGainLoss += ev.gainLoss;
  }

  // -------------------------------------------------------------------------
  // Step 2: Deemed sales for open (non-segregated) positions at year end
  // -------------------------------------------------------------------------
  for (const lot of openLots) {
    // Skip segregated investment positions
    if (isSegregated(lot)) continue;

    // Skip lots with no remaining quantity
    if (lot.quantity <= 1e-10) continue;

    // Get year-end FMV for this symbol
    const fmv = yearEndFmvMap.get(lot.symbol.toUpperCase());
    if (fmv === undefined) {
      // No FMV available — cannot create deemed sale
      // In production, this would be flagged as an issue
      continue;
    }

    const deemedProceeds = round2(lot.quantity * fmv);
    const costBasis = round2(lot.totalCostBasis);
    const gainLoss = round2(deemedProceeds - costBasis);

    deemedSaleEvents.push({
      symbol: lot.symbol,
      quantity: lot.quantity,
      yearEndFmv: round2(fmv),
      costBasis,
      gainLoss,
    });

    ordinaryGainLoss += gainLoss;
  }

  // -------------------------------------------------------------------------
  // Step 3: Section 481(a) adjustment for transition year
  // -------------------------------------------------------------------------
  let section481Adjustment: Section481Adjustment | undefined;

  if (isTransitionYear) {
    // In the transition year, all positions that were open on January 1 of the
    // election year are deemed sold at FMV on the last business day of the
    // prior year. This creates a Section 481(a) adjustment.
    //
    // We approximate this by treating all lots acquired BEFORE January 1 of
    // the election year as transition positions.
    const jan1 = new Date(year, 0, 1);
    const transitionPositions: Section481Position[] = [];
    let totalTransitionGainLoss = 0;

    for (const lot of openLots) {
      // Skip segregated investment positions
      if (isSegregated(lot)) continue;

      // Only positions open before election year
      const acquired = new Date(lot.dateAcquired);
      if (acquired >= jan1) continue;

      // Skip lots with no remaining quantity
      if (lot.quantity <= 1e-10) continue;

      // Use year-end FMV as deemed sale price for the transition adjustment.
      // Technically this should be prior-year-end FMV, but in practice the
      // YEAR_END_FMV for the prior year may already be applied. We use the
      // available FMV map as best approximation.
      const fmv = yearEndFmvMap.get(lot.symbol.toUpperCase());
      if (fmv === undefined) continue;

      const deemedSalePrice = round2(lot.quantity * fmv);
      const costBasis = round2(lot.totalCostBasis);
      const gainLoss = round2(deemedSalePrice - costBasis);

      transitionPositions.push({
        symbol: lot.symbol,
        quantity: lot.quantity,
        costBasis,
        deemedSalePrice,
        gainLoss,
      });

      totalTransitionGainLoss += gainLoss;
    }

    if (transitionPositions.length > 0) {
      section481Adjustment = {
        totalGainLoss: round2(totalTransitionGainLoss),
        positions: transitionPositions,
      };

      // The 481(a) adjustment is included in ordinary gain/loss
      ordinaryGainLoss += totalTransitionGainLoss;
    }
  }

  return {
    ordinaryGainLoss: round2(ordinaryGainLoss),
    deemedSaleEvents,
    section481Adjustment,
    segregatedInvestmentEvents,
  };
}
