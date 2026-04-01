/**
 * Securities CSV Exports
 *
 * Generates various CSV reports from a SecuritiesTaxReport. Each function
 * returns a CSV string ready to be served as a file download.
 *
 * Uses the same csvEscape/csvRow helpers pattern as the crypto export route.
 */

import type { SecuritiesTaxReport } from "./securities-report-generator";

// ---------------------------------------------------------------------------
// CSV helpers
// ---------------------------------------------------------------------------

/**
 * Escape a CSV field: wrap in quotes if it contains commas, quotes, or newlines
 */
function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function csvRow(fields: string[]): string {
  return fields.map(csvEscape).join(",");
}

function fmtDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toISOString().split("T")[0];
}

function fmt2(n: number): string {
  return n.toFixed(2);
}

// ---------------------------------------------------------------------------
// 1. Realized Gains/Losses CSV
// ---------------------------------------------------------------------------

/**
 * All closed positions with lot detail (Form 8949 data).
 */
export function generateRealizedGainsCSV(report: SecuritiesTaxReport): string {
  const headers = [
    "Date Sold",
    "Date Acquired",
    "Symbol",
    "Asset Class",
    "Quantity",
    "Proceeds",
    "Cost Basis",
    "Gain/Loss",
    "Holding Period",
    "Gain Type",
    "Form 8949 Box",
    "Wash Sale Code",
    "Wash Sale Adjustment",
    "Form Destination",
  ];

  const rows = report.taxableEvents.map((evt: any) => [
    fmtDate(evt.dateSold),
    fmtDate(evt.dateAcquired),
    evt.symbol,
    evt.assetClass || "",
    fmt2(evt.quantity),
    fmt2(evt.proceeds),
    fmt2(evt.costBasis),
    fmt2(evt.gainLoss),
    evt.holdingPeriod || "",
    evt.gainType || "CAPITAL",
    evt.form8949Box || "",
    evt.washSaleCode || "",
    fmt2(evt.washSaleAdjustment || 0),
    evt.formDestination || "8949",
  ]);

  return [headers, ...rows].map(csvRow).join("\n");
}

// ---------------------------------------------------------------------------
// 2. Wash Sale Detail CSV
// ---------------------------------------------------------------------------

/**
 * Every wash sale with disallowed amounts and adjustments.
 */
export function generateWashSaleDetailCSV(report: SecuritiesTaxReport): string {
  const headers = [
    "Loss Transaction ID",
    "Replacement Transaction ID",
    "Loss Lot ID",
    "Replacement Lot ID",
    "Disallowed Amount",
    "Is Permanent",
    "Basis Adjustment",
    "Holding Period Tack Days",
    "Year",
    "Carry Forward",
  ];

  const rows = report.washSales.map((ws: any) => [
    String(ws.lossTransactionId),
    String(ws.replacementTransactionId),
    ws.lossLotId != null ? String(ws.lossLotId) : "",
    ws.replacementLotId != null ? String(ws.replacementLotId) : "",
    fmt2(ws.disallowedAmount),
    ws.isPermanent ? "Yes" : "No",
    fmt2(ws.basisAdjustment),
    String(ws.holdingPeriodTackDays || 0),
    String(ws.year),
    ws.carryForward ? "Yes" : "No",
  ]);

  return [headers, ...rows].map(csvRow).join("\n");
}

// ---------------------------------------------------------------------------
// 3. Wash Sale Carry-Forward CSV
// ---------------------------------------------------------------------------

/**
 * Cross-year wash sales carrying into next year.
 */
export function generateWashSaleCarryForwardCSV(report: SecuritiesTaxReport): string {
  const headers = [
    "Loss Transaction ID",
    "Replacement Transaction ID",
    "Loss Lot ID",
    "Replacement Lot ID",
    "Disallowed Amount",
    "Basis Adjustment",
    "Holding Period Tack Days",
    "Year",
  ];

  const carryForwards = report.washSales.filter((ws: any) => ws.carryForward);

  const rows = carryForwards.map((ws: any) => [
    String(ws.lossTransactionId),
    String(ws.replacementTransactionId),
    ws.lossLotId != null ? String(ws.lossLotId) : "",
    ws.replacementLotId != null ? String(ws.replacementLotId) : "",
    fmt2(ws.disallowedAmount),
    fmt2(ws.basisAdjustment),
    String(ws.holdingPeriodTackDays || 0),
    String(ws.year),
  ]);

  return [headers, ...rows].map(csvRow).join("\n");
}

// ---------------------------------------------------------------------------
// 4. Permanently Disallowed CSV
// ---------------------------------------------------------------------------

/**
 * IRA/retirement wash sale losses that cannot be recovered.
 */
export function generatePermanentlyDisallowedCSV(report: SecuritiesTaxReport): string {
  const headers = [
    "Loss Transaction ID",
    "Replacement Transaction ID",
    "Loss Lot ID",
    "Replacement Lot ID",
    "Disallowed Amount",
    "Basis Adjustment",
    "Year",
  ];

  const permanent = report.washSales.filter((ws: any) => ws.isPermanent);

  const rows = permanent.map((ws: any) => [
    String(ws.lossTransactionId),
    String(ws.replacementTransactionId),
    ws.lossLotId != null ? String(ws.lossLotId) : "",
    ws.replacementLotId != null ? String(ws.replacementLotId) : "",
    fmt2(ws.disallowedAmount),
    fmt2(ws.basisAdjustment),
    String(ws.year),
  ]);

  // Summary row
  const summaryLine = csvRow([
    "",
    "",
    "",
    "",
    fmt2(report.totalPermanentlyDisallowed),
    "",
    "",
  ]);

  const csv = [headers, ...rows].map(csvRow).join("\n");
  return csv + "\n\nTotal Permanently Disallowed," + fmt2(report.totalPermanentlyDisallowed);
}

// ---------------------------------------------------------------------------
// 5. Dividend Summary CSV
// ---------------------------------------------------------------------------

/**
 * Dividends by payer and type for Schedule B.
 */
export function generateDividendSummaryCSV(report: SecuritiesTaxReport): string {
  const lines: string[] = [];

  // Summary section
  lines.push(`Dividend Summary - ${report.year}`);
  lines.push("");
  lines.push(csvRow(["Category", "Amount"]));
  lines.push(csvRow(["Total Ordinary Dividends", fmt2(report.totalOrdinaryDividends)]));
  lines.push(csvRow(["Total Qualified Dividends", fmt2(report.totalQualifiedDividends)]));
  lines.push(csvRow(["Capital Gain Distributions", fmt2(report.totalCapGainDistributions)]));
  lines.push(csvRow(["Interest Income", fmt2(report.totalInterestIncome)]));
  lines.push(csvRow(["Foreign Tax Paid", fmt2(report.totalForeignTaxPaid)]));
  lines.push(csvRow(["Requires Schedule B", report.requiresScheduleB ? "Yes" : "No"]));
  lines.push("");

  // By-payer detail
  lines.push(csvRow(["Payer", "Ordinary Dividends", "Qualified Dividends"]));

  const payers = Object.entries(report.dividendsByPayer)
    .sort(([a], [b]) => a.localeCompare(b));

  for (const [payer, data] of payers) {
    lines.push(csvRow([payer, fmt2(data.ordinary), fmt2(data.qualified)]));
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// 6. Section 1256 Summary CSV
// ---------------------------------------------------------------------------

/**
 * Section 1256 contract gains with 60/40 breakdown.
 */
export function generateSection1256SummaryCSV(report: SecuritiesTaxReport): string {
  const lines: string[] = [];

  lines.push(`Section 1256 Summary (Form 6781) - ${report.year}`);
  lines.push("");
  lines.push(csvRow(["Category", "Amount"]));
  lines.push(csvRow(["Total Section 1256 Gain/Loss", fmt2(report.section1256Total)]));
  lines.push(csvRow(["40% Short-Term Portion", fmt2(report.section1256ShortTerm)]));
  lines.push(csvRow(["60% Long-Term Portion", fmt2(report.section1256LongTerm)]));
  lines.push("");

  // Detail rows
  lines.push(csvRow([
    "Symbol",
    "Quantity",
    "Proceeds",
    "Cost Basis",
    "Gain/Loss",
    "Short-Term (40%)",
    "Long-Term (60%)",
  ]));

  for (const evt of report.section1256Events) {
    lines.push(csvRow([
      evt.symbol,
      fmt2(evt.quantity),
      fmt2(evt.proceeds),
      fmt2(evt.costBasis),
      fmt2(evt.gainLoss),
      fmt2(evt.shortTermPortion),
      fmt2(evt.longTermPortion),
    ]));
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// 7. Section 475 Summary CSV
// ---------------------------------------------------------------------------

/**
 * Section 475 MTM ordinary gains/losses (Form 4797).
 */
export function generateSection475SummaryCSV(report: SecuritiesTaxReport): string {
  const lines: string[] = [];

  lines.push(`Section 475 Mark-to-Market Summary (Form 4797) - ${report.year}`);
  lines.push("");
  lines.push(csvRow(["Category", "Amount"]));
  lines.push(csvRow(["Total Ordinary Gain/Loss", fmt2(report.section475OrdinaryGainLoss)]));
  lines.push("");

  // Detail rows
  lines.push(csvRow([
    "Date Sold",
    "Date Acquired",
    "Symbol",
    "Asset Class",
    "Quantity",
    "Proceeds",
    "Cost Basis",
    "Gain/Loss",
  ]));

  for (const evt of report.section475Events) {
    lines.push(csvRow([
      fmtDate(evt.dateSold),
      fmtDate(evt.dateAcquired),
      evt.symbol,
      evt.assetClass || "",
      fmt2(evt.quantity),
      fmt2(evt.proceeds),
      fmt2(evt.costBasis),
      fmt2(evt.gainLoss),
    ]));
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// 8. TurboTax-Compatible CSV
// ---------------------------------------------------------------------------

/**
 * TurboTax-compatible securities import format.
 */
export function generateSecuritiesTurboTaxCSV(report: SecuritiesTaxReport): string {
  const headers = [
    "Description of property",
    "Date acquired",
    "Date sold",
    "Sales price",
    "Cost or other basis",
    "Adjustment code",
    "Adjustment amount",
    "Gain or loss",
  ];

  function fmtTTDate(d: Date | string): string {
    const date = typeof d === "string" ? new Date(d) : d;
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const year = date.getFullYear();
    return `${month}/${day}/${year}`;
  }

  const rows = report.taxableEvents.map((evt: any) => {
    const hasWashSale = !!evt.washSaleCode;
    return [
      `${fmt2(evt.quantity)} ${evt.symbol}`,
      fmtTTDate(evt.dateAcquired),
      fmtTTDate(evt.dateSold),
      fmt2(evt.proceeds),
      fmt2(evt.costBasis),
      hasWashSale ? "W" : "",
      hasWashSale ? fmt2(evt.washSaleAdjustment || 0) : "",
      fmt2(evt.gainLoss),
    ];
  });

  return [headers, ...rows].map(csvRow).join("\n");
}
