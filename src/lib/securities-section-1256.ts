/**
 * Securities Section 1256 Engine
 *
 * Section 1256 contracts receive special tax treatment: gains and losses are
 * split 60% long-term / 40% short-term regardless of actual holding period.
 * Contracts are marked-to-market at year end (deemed sold at FMV on the last
 * business day of the tax year).
 *
 * This module adds higher-level 1256 processing on top of the lot engine,
 * which already generates basic YEAR_END_FMV events with the 60/40 split.
 *
 * Qualifying contracts include:
 * - Regulated futures contracts
 * - Foreign currency contracts (on regulated exchanges)
 * - Non-equity options (broad-based index options)
 * - Dealer equity options
 * - Dealer securities futures contracts
 *
 * The user can add custom symbols to the qualifying list.
 *
 * Output is structured for Form 6781 (Gains and Losses From Section 1256
 * Contracts and Straddles).
 */

import prisma from "@/lib/prisma";
import type { SecuritiesTaxEvent, SecuritiesLotData } from "./securities-lot-engine";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Section1256MtmEvent {
  symbol: string;
  quantity: number;
  yearEndFmv: number;
  costBasis: number;
  gainLoss: number;
  shortTermPortion: number;
  longTermPortion: number;
}

export interface Section1256ClosedPosition {
  symbol: string;
  quantity: number;
  proceeds: number;
  costBasis: number;
  gainLoss: number;
  shortTermPortion: number;
  longTermPortion: number;
}

export interface Section1256Result {
  shortTermGain: number; // 40% portion
  longTermGain: number;  // 60% portion
  totalGain: number;
  mtmEvents: Section1256MtmEvent[];
  closedPositions: Section1256ClosedPosition[];
  priorYearGains: number[]; // last 3 years for carryback
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Round to 2 decimal places for currency values */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Determine whether a taxable event qualifies for Section 1256 treatment.
 * An event qualifies if:
 *   1. It was already tagged isSection1256 by the lot engine, OR
 *   2. Its symbol appears in the qualifying symbols set
 */
function isQualifying1256(
  event: SecuritiesTaxEvent,
  qualifyingSymbols: Set<string>,
): boolean {
  if (event.gainType === "SECTION_1256") return true;
  if (event.formDestination === "6781") return true;
  return qualifyingSymbols.has(event.symbol.toUpperCase());
}

// ---------------------------------------------------------------------------
// Main computation
// ---------------------------------------------------------------------------

/**
 * Compute Section 1256 summary from taxable events for a given year.
 *
 * The lot engine already produces YEAR_END_FMV events with the 60/40 split
 * (gainType = "SECTION_1256", formDestination = "6781"). This function:
 *
 * 1. Filters all qualifying events for the year
 * 2. Separates MTM (deemed sale) events from actual closed positions
 * 3. For events not already split by the lot engine, applies the 60/40 split
 * 4. Aggregates totals for Form 6781
 * 5. Queries prior 3 years' gains for carryback election
 */
export async function computeSection1256(
  userId: string,
  year: number,
  taxableEvents: SecuritiesTaxEvent[],
): Promise<Section1256Result> {
  // Fetch qualifying symbols from the database
  const qualifyingSymbols = new Set(
    (await getQualifyingSymbols()).map((s) => s.toUpperCase()),
  );

  // Filter events for this year that qualify for 1256 treatment
  const qualifying = taxableEvents.filter(
    (ev) => ev.year === year && isQualifying1256(ev, qualifyingSymbols),
  );

  // Separate into MTM (deemed sale via YEAR_END_FMV) and actual closed positions.
  // The lot engine tags YEAR_END_FMV events with formDestination "6781" and
  // gainType "SECTION_1256". They come in pairs (short + long) for the same lot.
  // We detect MTM events by checking if dateSold falls on the last few days of
  // December (year-end mark-to-market).
  const mtmEvents: Section1256MtmEvent[] = [];
  const closedPositions: Section1256ClosedPosition[] = [];

  // Group qualifying events by transactionId + lotId to consolidate 60/40 pairs
  const groupedMtm = new Map<string, SecuritiesTaxEvent[]>();
  const closedRaw: SecuritiesTaxEvent[] = [];

  for (const ev of qualifying) {
    const soldDate = new Date(ev.dateSold);
    const isYearEnd =
      soldDate.getMonth() === 11 && soldDate.getDate() >= 28;

    if (isYearEnd && ev.gainType === "SECTION_1256") {
      // This is a MTM deemed sale from YEAR_END_FMV
      const key = `${ev.transactionId}-${ev.lotId ?? 0}`;
      const group = groupedMtm.get(key) || [];
      group.push(ev);
      groupedMtm.set(key, group);
    } else {
      closedRaw.push(ev);
    }
  }

  // Process MTM events (consolidate paired short/long into single entries)
  for (const [, events] of groupedMtm) {
    const totalProceeds = events.reduce((s, e) => s + e.proceeds, 0);
    const totalCostBasis = events.reduce((s, e) => s + e.costBasis, 0);
    const totalGainLoss = events.reduce((s, e) => s + e.gainLoss, 0);
    const qty = events[0].quantity; // same lot, same quantity in each pair

    const longTermPortion = round2(totalGainLoss * 0.6);
    const shortTermPortion = round2(totalGainLoss * 0.4);

    mtmEvents.push({
      symbol: events[0].symbol,
      quantity: qty,
      yearEndFmv: round2(totalProceeds),
      costBasis: round2(totalCostBasis),
      gainLoss: round2(totalGainLoss),
      shortTermPortion,
      longTermPortion,
    });
  }

  // Process closed positions (actual sales during the year)
  for (const ev of closedRaw) {
    const gainLoss = ev.gainLoss;

    // If the lot engine already split this (SECTION_1256 gain type), respect
    // the holding period it assigned. Otherwise, apply the 60/40 split.
    let longTermPortion: number;
    let shortTermPortion: number;

    if (ev.gainType === "SECTION_1256") {
      // Already handled by lot engine — this event is one half of a pair.
      // But for closed positions the lot engine doesn't always split,
      // so we apply the standard 60/40.
      longTermPortion = round2(gainLoss * 0.6);
      shortTermPortion = round2(gainLoss * 0.4);
    } else {
      // Symbol-based qualification — apply 60/40 split
      longTermPortion = round2(gainLoss * 0.6);
      shortTermPortion = round2(gainLoss * 0.4);
    }

    closedPositions.push({
      symbol: ev.symbol,
      quantity: ev.quantity,
      proceeds: round2(ev.proceeds),
      costBasis: round2(ev.costBasis),
      gainLoss: round2(gainLoss),
      shortTermPortion,
      longTermPortion,
    });
  }

  // Aggregate totals
  const mtmShortTerm = mtmEvents.reduce((s, e) => s + e.shortTermPortion, 0);
  const mtmLongTerm = mtmEvents.reduce((s, e) => s + e.longTermPortion, 0);
  const closedShortTerm = closedPositions.reduce(
    (s, e) => s + e.shortTermPortion,
    0,
  );
  const closedLongTerm = closedPositions.reduce(
    (s, e) => s + e.longTermPortion,
    0,
  );

  const shortTermGain = round2(mtmShortTerm + closedShortTerm);
  const longTermGain = round2(mtmLongTerm + closedLongTerm);
  const totalGain = round2(shortTermGain + longTermGain);

  // Query prior 3 years' Section 1256 gains for carryback election
  // (Section 1256 net losses can be carried back 3 years against 1256 gains)
  const priorYearGains = await fetchPriorYearGains(userId, year);

  return {
    shortTermGain,
    longTermGain,
    totalGain,
    mtmEvents,
    closedPositions,
    priorYearGains,
  };
}

// ---------------------------------------------------------------------------
// Prior year gains for carryback
// ---------------------------------------------------------------------------

/**
 * Fetch prior 3 years' Section 1256 net gains from stored taxable events.
 * Returns an array of 3 numbers: [year-3, year-2, year-1].
 */
async function fetchPriorYearGains(
  userId: string,
  currentYear: number,
): Promise<number[]> {
  const gains: number[] = [];

  for (let y = currentYear - 3; y < currentYear; y++) {
    try {
      const result = await prisma.securitiesTaxableEvent.aggregate({
        where: {
          userId,
          year: y,
          gainType: "SECTION_1256",
        },
        _sum: {
          gainLoss: true,
        },
      });
      gains.push(Number(result._sum.gainLoss ?? 0));
    } catch {
      gains.push(0);
    }
  }

  return gains;
}

// ---------------------------------------------------------------------------
// Qualifying symbols
// ---------------------------------------------------------------------------

/**
 * Fetch all Section 1256 qualifying symbols from the database.
 * Returns both default and user-added symbols.
 */
export async function getQualifyingSymbols(): Promise<string[]> {
  const rows = await prisma.securitiesSection1256Symbol.findMany({
    select: { symbol: true },
    orderBy: { symbol: "asc" },
  });
  return rows.map((r) => r.symbol);
}
