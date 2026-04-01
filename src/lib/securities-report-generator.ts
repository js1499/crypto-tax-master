/**
 * Securities Report Generator
 *
 * Aggregates all securities tax data for a given user and year into a
 * structured report suitable for PDF generation, CSV exports, and the
 * combined tax reports page.
 *
 * Queries: securities_taxable_events, securities_wash_sales,
 * securities_dividends, securities_lots.
 */

import prisma from "@/lib/prisma";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SecuritiesTaxReport {
  year: number;
  // Capital gains
  shortTermGains: number;
  shortTermLosses: number;
  longTermGains: number;
  longTermLosses: number;
  netShortTermGain: number;
  netLongTermGain: number;
  totalCapitalGainLoss: number;
  // Section 1256
  section1256ShortTerm: number;
  section1256LongTerm: number;
  section1256Total: number;
  // Section 475 MTM (ordinary)
  section475OrdinaryGainLoss: number;
  // Section 988 (ordinary)
  section988OrdinaryGainLoss: number;
  // Dividends
  totalQualifiedDividends: number;
  totalOrdinaryDividends: number;
  totalCapGainDistributions: number;
  totalForeignTaxPaid: number;
  totalInterestIncome: number;
  requiresScheduleB: boolean;
  // Wash sales
  totalWashSaleDisallowed: number;
  totalPermanentlyDisallowed: number;
  // Events for forms
  taxableEvents: any[];
  section1256Events: any[];
  section475Events: any[];
  washSales: any[];
  dividendsByPayer: Record<string, { ordinary: number; qualified: number }>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toNum(v: any): number {
  if (v === null || v === undefined) return 0;
  return typeof v === "number" ? v : Number(v);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// Main generator
// ---------------------------------------------------------------------------

/**
 * Generate a comprehensive securities tax report for the given user and year.
 *
 * Fetches taxable events, wash sales, dividends, and lots from the database,
 * then aggregates all numbers into the SecuritiesTaxReport structure.
 */
export async function generateSecuritiesTaxReport(
  userId: string,
  year: number,
): Promise<SecuritiesTaxReport> {
  // Fetch all data sources in parallel
  const [taxableEvents, washSales, dividends, lots, settings] = await Promise.all([
    prisma.securitiesTaxableEvent.findMany({
      where: { userId, year },
      orderBy: { dateSold: "asc" },
    }),
    prisma.securitiesWashSale.findMany({
      where: { userId, year },
    }),
    prisma.securitiesDividend.findMany({
      where: { userId, year },
    }),
    prisma.securitiesLot.findMany({
      where: { userId },
    }),
    prisma.securitiesTaxSettings.findUnique({
      where: { userId_year: { userId, year } },
    }),
  ]);

  const isTraderMTM = settings?.taxStatus === "TRADER_MTM";
  const section988Election = settings?.section988Election ?? false;

  // ---- Capital gains aggregation ----------------------------------------

  let shortTermGains = 0;
  let shortTermLosses = 0;
  let longTermGains = 0;
  let longTermLosses = 0;

  // Section 1256 aggregation
  let section1256ShortTerm = 0;
  let section1256LongTerm = 0;

  // Section 475 MTM aggregation
  let section475OrdinaryGainLoss = 0;

  // Section 988 aggregation
  let section988OrdinaryGainLoss = 0;

  // Classify events into regular capital, 1256, 475, or 988
  const regularEvents: any[] = [];
  const section1256Events: any[] = [];
  const section475Events: any[] = [];

  for (const evt of taxableEvents) {
    const gainLoss = toNum(evt.gainLoss);
    const formDest = evt.formDestination;
    const gainType = evt.gainType;

    // Section 1256 events (Form 6781)
    if (gainType === "SECTION_1256" || formDest === "6781") {
      // 60/40 split: 60% long-term, 40% short-term
      const longPortion = round2(gainLoss * 0.6);
      const shortPortion = round2(gainLoss - longPortion);

      section1256LongTerm += longPortion;
      section1256ShortTerm += shortPortion;

      section1256Events.push({
        ...evt,
        quantity: toNum(evt.quantity),
        proceeds: toNum(evt.proceeds),
        costBasis: toNum(evt.costBasis),
        gainLoss,
        shortTermPortion: shortPortion,
        longTermPortion: longPortion,
      });
      continue;
    }

    // Section 475 MTM events (ordinary income — trader election)
    if (isTraderMTM && gainType === "ORDINARY") {
      section475OrdinaryGainLoss += gainLoss;

      section475Events.push({
        ...evt,
        quantity: toNum(evt.quantity),
        proceeds: toNum(evt.proceeds),
        costBasis: toNum(evt.costBasis),
        gainLoss,
      });
      continue;
    }

    // Section 988 forex events (ordinary unless opted out)
    if (evt.assetClass === "FOREX" && !section988Election) {
      section988OrdinaryGainLoss += gainLoss;
      continue;
    }

    // Regular capital gains/losses (Form 8949 / Schedule D)
    const hp = evt.holdingPeriod;
    if (hp === "SHORT_TERM") {
      if (gainLoss >= 0) {
        shortTermGains += gainLoss;
      } else {
        shortTermLosses += gainLoss;
      }
    } else {
      if (gainLoss >= 0) {
        longTermGains += gainLoss;
      } else {
        longTermLosses += gainLoss;
      }
    }

    regularEvents.push({
      ...evt,
      quantity: toNum(evt.quantity),
      proceeds: toNum(evt.proceeds),
      costBasis: toNum(evt.costBasis),
      gainLoss,
      washSaleAdjustment: toNum(evt.washSaleAdjustment),
    });
  }

  // Round aggregates
  shortTermGains = round2(shortTermGains);
  shortTermLosses = round2(shortTermLosses);
  longTermGains = round2(longTermGains);
  longTermLosses = round2(longTermLosses);
  section1256ShortTerm = round2(section1256ShortTerm);
  section1256LongTerm = round2(section1256LongTerm);
  section475OrdinaryGainLoss = round2(section475OrdinaryGainLoss);
  section988OrdinaryGainLoss = round2(section988OrdinaryGainLoss);

  const netShortTermGain = round2(shortTermGains + shortTermLosses);
  const netLongTermGain = round2(longTermGains + longTermLosses);
  const section1256Total = round2(section1256ShortTerm + section1256LongTerm);
  const totalCapitalGainLoss = round2(netShortTermGain + netLongTermGain + section1256Total);

  // ---- Wash sales aggregation -------------------------------------------

  let totalWashSaleDisallowed = 0;
  let totalPermanentlyDisallowed = 0;

  const washSaleRecords: any[] = [];

  for (const ws of washSales) {
    const disallowed = toNum(ws.disallowedAmount);
    totalWashSaleDisallowed += disallowed;

    if (ws.isPermanent) {
      totalPermanentlyDisallowed += disallowed;
    }

    washSaleRecords.push({
      ...ws,
      disallowedAmount: disallowed,
      basisAdjustment: toNum(ws.basisAdjustment),
    });
  }

  totalWashSaleDisallowed = round2(totalWashSaleDisallowed);
  totalPermanentlyDisallowed = round2(totalPermanentlyDisallowed);

  // ---- Dividends aggregation --------------------------------------------

  let totalQualifiedDividends = 0;
  let totalOrdinaryDividends = 0;
  let totalCapGainDistributions = 0;
  let totalForeignTaxPaid = 0;
  let totalInterestIncome = 0;

  const dividendsByPayer: Record<string, { ordinary: number; qualified: number }> = {};

  for (const div of dividends) {
    const amount = toNum(div.amount);
    const foreignTax = toNum(div.foreignTaxPaid);
    const divType = div.dividendType;
    const payer = div.payer || div.symbol;

    totalForeignTaxPaid += foreignTax;

    if (!dividendsByPayer[payer]) {
      dividendsByPayer[payer] = { ordinary: 0, qualified: 0 };
    }

    switch (divType) {
      case "QUALIFIED":
        totalQualifiedDividends += amount;
        dividendsByPayer[payer].qualified += amount;
        // Qualified dividends are also included in ordinary for Form 1099-DIV
        totalOrdinaryDividends += amount;
        dividendsByPayer[payer].ordinary += amount;
        break;
      case "ORDINARY":
        totalOrdinaryDividends += amount;
        dividendsByPayer[payer].ordinary += amount;
        break;
      case "CAPITAL_GAIN":
        totalCapGainDistributions += amount;
        break;
      case "INTEREST":
        totalInterestIncome += amount;
        break;
      case "RETURN_OF_CAPITAL":
        // RoC reduces basis, not taxable income — skip here
        break;
      default:
        // Treat unknown types as ordinary
        totalOrdinaryDividends += amount;
        dividendsByPayer[payer].ordinary += amount;
        break;
    }
  }

  totalQualifiedDividends = round2(totalQualifiedDividends);
  totalOrdinaryDividends = round2(totalOrdinaryDividends);
  totalCapGainDistributions = round2(totalCapGainDistributions);
  totalForeignTaxPaid = round2(totalForeignTaxPaid);
  totalInterestIncome = round2(totalInterestIncome);

  // Schedule B is required if ordinary dividends or interest exceed $1,500
  const requiresScheduleB =
    totalOrdinaryDividends > 1500 || totalInterestIncome > 1500;

  // Round payer-level data
  for (const payer of Object.keys(dividendsByPayer)) {
    dividendsByPayer[payer].ordinary = round2(dividendsByPayer[payer].ordinary);
    dividendsByPayer[payer].qualified = round2(dividendsByPayer[payer].qualified);
  }

  return {
    year,
    // Capital gains
    shortTermGains,
    shortTermLosses,
    longTermGains,
    longTermLosses,
    netShortTermGain,
    netLongTermGain,
    totalCapitalGainLoss,
    // Section 1256
    section1256ShortTerm,
    section1256LongTerm,
    section1256Total,
    // Section 475 MTM
    section475OrdinaryGainLoss,
    // Section 988
    section988OrdinaryGainLoss,
    // Dividends
    totalQualifiedDividends,
    totalOrdinaryDividends,
    totalCapGainDistributions,
    totalForeignTaxPaid,
    totalInterestIncome,
    requiresScheduleB,
    // Wash sales
    totalWashSaleDisallowed,
    totalPermanentlyDisallowed,
    // Events for forms
    taxableEvents: regularEvents,
    section1256Events,
    section475Events,
    washSales: washSaleRecords,
    dividendsByPayer,
  };
}
