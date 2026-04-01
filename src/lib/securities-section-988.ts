/**
 * Securities Section 988 Forex Engine
 *
 * Section 988 governs the tax treatment of foreign currency transactions.
 * By default, all forex gains and losses are treated as ORDINARY income/loss
 * (not capital gains/losses).
 *
 * Key rules:
 * - Default: all forex gains/losses are ordinary (Section 988)
 * - Opt-out election: trader can elect OUT of Section 988, converting forex
 *   gains/losses to capital gains/losses (reported on Form 8949 / Schedule D)
 * - Currency futures on regulated exchanges: always Section 1256 regardless
 *   of the 988 election (they are "regulated futures contracts")
 *
 * The opt-out election (Section 988(a)(1)(B)) must be made before the close
 * of the day the transaction is entered into. In practice, traders file a
 * contemporaneous election statement.
 *
 * Output: structured result for the appropriate tax form (Form 4797 for
 * ordinary treatment, or Form 8949/Schedule D if opted out).
 */

import type { SecuritiesTaxEvent } from "./securities-lot-engine";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Section988Event {
  symbol: string;
  date: Date;
  gainLoss: number;
  isOrdinary: boolean; // true unless opted out
}

export interface Section988Result {
  ordinaryGainLoss: number;
  events: Section988Event[];
  optedOut: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Round to 2 decimal places for currency values */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Determine if a taxable event is a forex transaction.
 * Checks the assetClass field for "FOREX" classification.
 */
function isForexEvent(event: SecuritiesTaxEvent): boolean {
  return event.assetClass === "FOREX";
}

/**
 * Determine if a forex event is a regulated futures contract on an exchange.
 * These are always Section 1256 regardless of the 988 election.
 *
 * We detect this by checking if the event was already tagged as Section 1256
 * by the lot engine (isSection1256 flag on the transaction, which flows
 * through to gainType "SECTION_1256").
 */
function isRegulatedFutures(event: SecuritiesTaxEvent): boolean {
  return event.gainType === "SECTION_1256" || event.formDestination === "6781";
}

// ---------------------------------------------------------------------------
// Main computation
// ---------------------------------------------------------------------------

/**
 * Compute Section 988 forex results.
 *
 * @param taxableEvents - All taxable events from the lot engine
 * @param section988Election - True if user has opted OUT of Section 988
 *                             (converting forex to capital gains treatment)
 */
export function computeSection988(
  taxableEvents: SecuritiesTaxEvent[],
  section988Election: boolean,
): Section988Result {
  const events: Section988Event[] = [];
  let ordinaryGainLoss = 0;

  // Filter to forex events only
  const forexEvents = taxableEvents.filter(isForexEvent);

  for (const ev of forexEvents) {
    // Currency futures on regulated exchanges: always Section 1256
    // These are excluded from Section 988 treatment entirely
    if (isRegulatedFutures(ev)) {
      // Already handled by the Section 1256 engine — skip here
      continue;
    }

    // Determine treatment based on election status
    const isOrdinary = !section988Election;

    events.push({
      symbol: ev.symbol,
      date: new Date(ev.dateSold),
      gainLoss: round2(ev.gainLoss),
      isOrdinary,
    });

    if (isOrdinary) {
      ordinaryGainLoss += ev.gainLoss;
    }
    // If opted out, the gains are capital — they stay in the normal
    // taxable events pipeline and go to Form 8949 / Schedule D
  }

  return {
    ordinaryGainLoss: round2(ordinaryGainLoss),
    events,
    optedOut: section988Election,
  };
}
