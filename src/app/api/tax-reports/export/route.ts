import { NextRequest, NextResponse } from "next/server";
import { Prisma, PrismaClient } from "@prisma/client";
import prisma from "@/lib/prisma";
import { TaxReport, TaxableEvent, IncomeEvent } from "@/lib/tax-calculator";
import { getCurrentUser } from "@/lib/auth-helpers";
import { rateLimitAPI, createRateLimitResponse } from "@/lib/rate-limit";

/**
 * GET /api/tax-reports/export?year=2023&type=capital-gains-csv
 * Export tax report data in various formats (CSV, etc.)
 * 
 * Supported types:
 * - capital-gains-csv: CSV of all capital gains/losses
 * - transaction-history: CSV of all transactions
 * - income-report: CSV of income-generating transactions
 * - capital-gains-by-asset: CSV with proceeds, basis, and gain/loss per asset
 * - turbotax-1099b: TurboTax-compatible 1099-B import CSV
 * - summary-report: Human-readable tax summary CSV
 * - uk-sa108-summary: UK SA108 Capital Gains Summary CSV
 * - uk-disposals-csv: UK detailed disposals CSV with HMRC matching rules
 * - de-anlage-so: German Anlage SO Summary CSV
 * - de-disposals-csv: German detailed disposals CSV with holding period
 */
export async function GET(request: NextRequest) {
  try {
    // Rate limiting
    const rateLimitResult = rateLimitAPI(request, 30); // 30 exports per minute
    if (!rateLimitResult.success) {
      return createRateLimitResponse(
        rateLimitResult.remaining,
        rateLimitResult.reset
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const year = parseInt(searchParams.get("year") || new Date().getFullYear().toString());
    const exportType = searchParams.get("type") || "capital-gains-csv";

    if (isNaN(year) || year < 2000 || year > 2100) {
      return NextResponse.json(
        { error: "Invalid year parameter" },
        { status: 400 }
      );
    }

    // Get user authentication - pass request for proper Vercel session handling
    let user;
    try {
      user = await getCurrentUser(request);
    } catch (authError) {
      console.error("[Tax Reports Export API] Auth error:", authError);
      const errorMessage = authError instanceof Error ? authError.message : "Unknown error";
      if (errorMessage.includes("Can't reach database") || errorMessage.includes("P1001")) {
        return NextResponse.json(
          {
            error: "Database connection failed",
            details: "Please check your database connection.",
          },
          { status: 503 }
        );
      }
      return NextResponse.json(
        { error: "Authentication failed", details: errorMessage },
        { status: 401 }
      );
    }

    if (!user) {
      console.error("[Tax Reports Export API] No user found - session may be expired or invalid");
      return NextResponse.json(
        { 
          error: "Not authenticated",
          details: "Please log in to export tax reports."
        },
        { status: 401 }
      );
    }

    // Get user with wallets
    const userWithWallets = await prisma.user.findUnique({
      where: { id: user.id },
      include: { wallets: true },
    });

    if (!userWithWallets) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    const walletAddresses = userWithWallets.wallets.map((w) => w.address);

    // ── Build report from DB (single source of truth, same as transactions page) ──
    const yearStart = new Date(`${year}-01-01T00:00:00Z`);
    const yearEnd = new Date(`${year}-12-31T23:59:59.999Z`);

    const orConditions: Prisma.TransactionWhereInput[] = [];
    if (walletAddresses.length > 0) {
      orConditions.push({ wallet_address: { in: walletAddresses } });
    }
    orConditions.push({ AND: [{ source_type: "csv_import" }, { userId: user.id }] });
    const userExchanges = await prisma.exchange.findMany({
      where: { userId: user.id },
      select: { name: true },
    });
    if (userExchanges.length > 0) {
      orConditions.push({
        AND: [{ source_type: "exchange_api" }, { source: { in: userExchanges.map(e => e.name) } }],
      });
    }

    const yearFilter: Prisma.TransactionWhereInput = {
      OR: orConditions,
      tx_timestamp: { gte: yearStart, lte: yearEnd },
    };

    // Fetch disposal transactions (for capital gains reports)
    const disposalTxns = await prisma.transaction.findMany({
      where: { ...yearFilter, gain_loss_usd: { not: null } },
      select: {
        id: true, asset_symbol: true, amount_value: true, value_usd: true,
        cost_basis_usd: true, gain_loss_usd: true, holding_period: true,
        date_acquired: true, tx_timestamp: true, source: true, type: true,
      },
      orderBy: { tx_timestamp: "asc" },
    });

    // Fetch income transactions
    const incomeTxns = await prisma.transaction.findMany({
      where: { ...yearFilter, is_income: true },
      select: {
        id: true, asset_symbol: true, amount_value: true, value_usd: true,
        tx_timestamp: true, type: true, source: true, chain: true, tx_hash: true,
      },
      orderBy: { tx_timestamp: "asc" },
    });

    // Fetch ALL transactions (for transaction history export)
    const allTxns = await prisma.transaction.findMany({
      where: yearFilter,
      select: {
        id: true, type: true, asset_symbol: true, amount_value: true,
        value_usd: true, fee_usd: true, cost_basis_usd: true, gain_loss_usd: true,
        holding_period: true, date_acquired: true, tx_timestamp: true,
        source: true, wallet_address: true, tx_hash: true, is_income: true,
        incoming_asset_symbol: true, incoming_amount_value: true, incoming_value_usd: true,
      },
      orderBy: { tx_timestamp: "asc" },
    });

    // Build TaxableEvent objects from DB
    const taxableEvents: TaxableEvent[] = disposalTxns
      .filter(tx => Number(tx.gain_loss_usd) !== 0)
      .map(tx => {
        const gainLoss = Number(tx.gain_loss_usd);
        const costBasis = Math.abs(Number(tx.cost_basis_usd || 0));
        return {
          id: tx.id,
          date: tx.tx_timestamp,
          asset: tx.asset_symbol,
          amount: Math.abs(Number(tx.amount_value)),
          proceeds: costBasis + gainLoss,
          costBasis,
          gainLoss,
          holdingPeriod: (tx.holding_period === "long" ? "long" : "short") as "short" | "long",
          dateAcquired: tx.date_acquired || undefined,
          source: tx.source || undefined,
          washSale: false,
          washSaleAdjustment: 0,
        };
      });

    const incomeEvents: IncomeEvent[] = incomeTxns.map(tx => ({
      id: tx.id,
      date: tx.tx_timestamp,
      asset: tx.asset_symbol,
      amount: Math.abs(Number(tx.amount_value)),
      valueUsd: Math.abs(Number(tx.value_usd)),
      type: tx.type as any,
      chain: tx.chain || undefined,
      txHash: tx.tx_hash || undefined,
    }));

    const stEvents = taxableEvents.filter(e => e.holdingPeriod === "short");
    const ltEvents = taxableEvents.filter(e => e.holdingPeriod === "long");

    const report: TaxReport = {
      taxableEvents,
      incomeEvents,
      totalIncome: incomeEvents.reduce((s, e) => s + e.valueUsd, 0),
      netShortTermGain: stEvents.reduce((s, e) => s + e.gainLoss, 0),
      netLongTermGain: ltEvents.reduce((s, e) => s + e.gainLoss, 0),
      summary: {
        shortTermGain: stEvents.filter(e => e.gainLoss > 0).reduce((s, e) => s + e.gainLoss, 0),
        shortTermLoss: stEvents.filter(e => e.gainLoss < 0).reduce((s, e) => s + e.gainLoss, 0),
        longTermGain: ltEvents.filter(e => e.gainLoss > 0).reduce((s, e) => s + e.gainLoss, 0),
        longTermLoss: ltEvents.filter(e => e.gainLoss < 0).reduce((s, e) => s + e.gainLoss, 0),
        netGain: taxableEvents.reduce((s, e) => s + e.gainLoss, 0),
        totalProceeds: taxableEvents.reduce((s, e) => s + e.proceeds, 0),
        totalCostBasis: taxableEvents.reduce((s, e) => s + e.costBasis, 0),
      },
      // Pass raw transactions for history/income exports
      _allTransactions: allTxns as any,
    };

    // Generate CSV based on export type
    let csvContent = "";
    let filename = "";

    switch (exportType) {
      case "capital-gains-csv":
        csvContent = generateCapitalGainsCSV(report);
        filename = `Capital-Gains-${year}.csv`;
        break;
      case "transaction-history":
        csvContent = await generateTransactionHistoryCSV(prisma, walletAddresses, year, user.id);
        filename = `Transaction-History-${year}.csv`;
        break;
      case "income-report":
        csvContent = generateIncomeReportCSV(report);
        filename = `Income-Report-${year}.csv`;
        break;
      case "capital-gains-by-asset":
        csvContent = generateCapitalGainsByAssetCSV(report);
        filename = `Capital-Gains-by-Asset-${year}.csv`;
        break;
      case "turbotax-1099b":
        csvContent = generateTurboTax1099BCSV(report);
        filename = `TurboTax-1099B-${year}.csv`;
        break;
      case "summary-report":
        csvContent = generateSummaryReportCSV(report, year);
        filename = `Crypto-Tax-Summary-${year}.csv`;
        break;
      case "uk-sa108-summary":
        csvContent = generateUkSa108Summary(report, year);
        filename = `SA108-Summary-${year}-${year + 1}.csv`;
        break;
      case "uk-disposals-csv":
        csvContent = generateUkDisposalsCsv(report);
        filename = `UK-Disposals-${year}-${year + 1}.csv`;
        break;
      case "de-anlage-so":
        csvContent = generateDeAnlageSo(report, year);
        filename = `Anlage-SO-${year}.csv`;
        break;
      case "de-disposals-csv":
        csvContent = generateDeDisposalsCsv(report);
        filename = `DE-Veraeusserungen-${year}.csv`;
        break;
      default:
        return NextResponse.json(
          { error: `Unsupported export type: ${exportType}` },
          { status: 400 }
        );
    }

    // Return CSV file
    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("[Tax Reports Export API] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to generate export",
        details: process.env.NODE_ENV === "development" ? (error instanceof Error ? error.message : "Unknown error") : "An internal error occurred",
      },
      { status: 500 }
    );
  }
}

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

/**
 * Generate Capital Gains CSV
 */
function generateCapitalGainsCSV(report: TaxReport): string {
  const headers = [
    "Date",
    "Asset",
    "Amount",
    "Proceeds (USD)",
    "Cost Basis (USD)",
    "Gain/Loss (USD)",
    "Holding Period",
    "Chain",
    "Transaction Hash",
  ];

  const rows = report.taxableEvents.map((event: any) => [
    event.date.toISOString().split("T")[0],
    event.asset,
    event.amount.toString(),
    event.proceeds.toFixed(2),
    event.costBasis.toFixed(2),
    event.gainLoss.toFixed(2),
    event.holdingPeriod,
    event.chain || "",
    event.txHash || "",
  ]);

  return [headers, ...rows].map(csvRow).join("\n");
}

/**
 * Generate Transaction History CSV
 */
async function generateTransactionHistoryCSV(
  prisma: PrismaClient,
  walletAddresses: string[],
  year: number,
  userId: string
): Promise<string> {
  const startDate = new Date(`${year}-01-01T00:00:00Z`);
  const endDate = new Date(`${year}-12-31T23:59:59Z`);

  // Get user's connected exchange names for filtering
  const userExchanges = await prisma.exchange.findMany({
    where: { userId },
    select: { name: true },
  });
  const exchangeNames = userExchanges.map(e => e.name);

  // Build where clause (same logic as tax calculator)
  const orConditions: any[] = [];
  if (walletAddresses.length > 0) {
    orConditions.push({ wallet_address: { in: walletAddresses } });
  }
  orConditions.push({
    AND: [
      { source_type: "csv_import" },
      { userId },
    ],
  });
  // Also include exchange API imports (Coinbase, Binance, etc.) - filtered by user's exchanges
  if (exchangeNames.length > 0) {
    orConditions.push({
      AND: [{ source_type: "exchange_api" }, { source: { in: exchangeNames } }],
    });
  }

  const transactions = await prisma.transaction.findMany({
    where: {
      OR: orConditions,
      tx_timestamp: {
        gte: startDate,
        lte: endDate,
      },
      status: { in: ["confirmed", "completed"] },
    },
    orderBy: {
      tx_timestamp: "asc",
    },
  });

  const headers = [
    "Date",
    "Type",
    "Subtype",
    "Asset",
    "Amount",
    "Price per Unit (USD)",
    "Value (USD)",
    "Fee (USD)",
    "Incoming Asset",
    "Incoming Amount",
    "Incoming Value (USD)",
    "Wallet Address",
    "Counterparty",
    "Chain",
    "Transaction Hash",
    "Status",
    "Notes",
  ];

  const rows = transactions.map((tx) => [
    tx.tx_timestamp.toISOString(),
    tx.type,
    tx.subtype || "",
    tx.asset_symbol,
    tx.amount_value.toString(),
    tx.price_per_unit?.toString() || "",
    tx.value_usd.toString(),
    tx.fee_usd?.toString() || "",
    tx.incoming_asset_symbol || "",
    tx.incoming_amount_value?.toString() || "",
    tx.incoming_value_usd?.toString() || "",
    tx.wallet_address || "",
    tx.counterparty_address || "",
    tx.chain || "",
    tx.tx_hash || "",
    tx.status,
    tx.notes || "",
  ]);

  return [headers, ...rows].map((row) => 
    row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
  ).join("\n");
}

/**
 * Generate Income Report CSV
 */
function generateIncomeReportCSV(report: TaxReport): string {
  const headers = [
    "Date",
    "Asset",
    "Amount",
    "Value (USD)",
    "Type",
    "Chain",
    "Transaction Hash",
  ];

  const rows = report.incomeEvents.map((event: any) => [
    event.date.toISOString().split("T")[0],
    event.asset,
    event.amount.toString(),
    event.valueUsd.toFixed(2),
    event.type,
    event.chain || "",
    event.txHash || "",
  ]);

  return [headers, ...rows].map(csvRow).join("\n");
}

/**
 * Generate Capital Gains by Asset CSV
 */
function generateCapitalGainsByAssetCSV(report: TaxReport): string {
  // Group taxable events by asset
  const assetMap = new Map<string, {
    asset: string;
    totalProceeds: number;
    totalCostBasis: number;
    totalGainLoss: number;
    transactionCount: number;
  }>();

  report.taxableEvents.forEach((event: any) => {
    const existing = assetMap.get(event.asset) || {
      asset: event.asset,
      totalProceeds: 0,
      totalCostBasis: 0,
      totalGainLoss: 0,
      transactionCount: 0,
    };

    existing.totalProceeds += event.proceeds;
    existing.totalCostBasis += event.costBasis;
    existing.totalGainLoss += event.gainLoss;
    existing.transactionCount += 1;

    assetMap.set(event.asset, existing);
  });

  const headers = [
    "Asset",
    "Total Proceeds (USD)",
    "Total Cost Basis (USD)",
    "Total Gain/Loss (USD)",
    "Transaction Count",
  ];

  const rows = Array.from(assetMap.values())
    .sort((a, b) => Math.abs(b.totalGainLoss) - Math.abs(a.totalGainLoss))
    .map((asset) => [
      asset.asset,
      asset.totalProceeds.toFixed(2),
      asset.totalCostBasis.toFixed(2),
      asset.totalGainLoss.toFixed(2),
      asset.transactionCount.toString(),
    ]);

  return [headers, ...rows].map(csvRow).join("\n");
}

/**
 * Generate TurboTax 1099-B CSV
 * Formats capital gains data in TurboTax's expected import format
 */
function generateTurboTax1099BCSV(report: TaxReport): string {
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

  const formatDate = (date: Date): string => {
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const year = date.getFullYear();
    return `${month}/${day}/${year}`;
  };

  const rows = report.taxableEvents.map((event: any) => {
    const isWashSale = event.washSale === true;
    return [
      `${event.amount} ${event.asset}`,
      event.dateAcquired ? formatDate(new Date(event.dateAcquired)) : formatDate(new Date(event.date)),
      formatDate(new Date(event.date)),
      event.proceeds.toFixed(2),
      event.costBasis.toFixed(2),
      isWashSale ? "W" : "",
      isWashSale ? event.washSaleDisallowed?.toFixed(2) || "0.00" : "",
      event.gainLoss.toFixed(2),
    ];
  });

  return [headers, ...rows].map(csvRow).join("\n");
}

/**
 * Generate Summary Report CSV
 * Human-readable summary of tax data for the year
 */
function generateSummaryReportCSV(report: TaxReport, year: number): string {
  const fmt = (n: number): string => `$${n.toFixed(2)}`;

  const netST = Math.max(0, report.netShortTermGain);
  const netLT = Math.max(0, report.netLongTermGain);
  const estimatedLiability = netST * 0.24 + netLT * 0.15;

  const lines: string[] = [
    `Crypto Tax Summary Report - ${year}`,
    "",
    "Capital Gains Summary",
    csvRow(["Short-term Gains", fmt(report.shortTermGains)]),
    csvRow(["Short-term Losses", fmt(report.shortTermLosses)]),
    csvRow(["Long-term Gains", fmt(report.longTermGains)]),
    csvRow(["Long-term Losses", fmt(report.longTermLosses)]),
    csvRow(["Net Short-term", fmt(report.netShortTermGain)]),
    csvRow(["Net Long-term", fmt(report.netLongTermGain)]),
    csvRow(["Total Net Gain/Loss", fmt(report.totalTaxableGain)]),
    csvRow(["Deductible Losses", fmt(report.deductibleLosses)]),
    csvRow(["Loss Carryover", fmt(report.lossCarryover)]),
    "",
    "Income Summary",
    csvRow(["Total Income", fmt(report.totalIncome)]),
    csvRow(["Income Events", report.incomeEvents.length.toString()]),
    "",
    "Tax Estimate",
    csvRow(["Estimated Liability", fmt(estimatedLiability)]),
  ];

  return lines.join("\n");
}

/**
 * Generate UK SA108 Capital Gains Summary CSV
 */
function generateUkSa108Summary(report: TaxReport, year: number): string {
  const shortYear = (year + 1).toString().slice(-2);
  const fmtGbp = (n: number): string => `\u00a3${n.toFixed(2)}`;

  const totalProceeds = report.taxableEvents.reduce((s, e: any) => s + e.proceeds, 0);
  const totalCosts = report.taxableEvents.reduce((s, e: any) => s + e.costBasis, 0);
  const netGains = report.taxableEvents.reduce((s, e: any) => s + Math.max(0, e.gainLoss), 0);
  const netLosses = report.taxableEvents.reduce((s, e: any) => s + Math.min(0, e.gainLoss), 0);
  const netGainsBeforeLosses = netGains;
  const netGainsAfterLosses = Math.max(0, netGains + netLosses);
  const annualExempt = 3000;
  const taxableGains = Math.max(0, netGainsAfterLosses - annualExempt);

  const totalCryptoIncome = report.incomeEvents.reduce((s, e: any) => s + e.valueUsd, 0);

  const lines: string[] = [
    `Capital Gains Summary (SA108) - Tax Year ${year}/${shortYear}`,
    "",
    csvRow(["Section", "Field", "Value"]),
    csvRow(["Capital Gains", "Number of disposals", report.taxableEvents.length.toString()]),
    csvRow(["Capital Gains", "Total disposal proceeds (GBP)", fmtGbp(totalProceeds)]),
    csvRow(["Capital Gains", "Total allowable costs (GBP)", fmtGbp(totalCosts)]),
    csvRow(["Capital Gains", "Net gains before losses", fmtGbp(netGainsBeforeLosses)]),
    csvRow(["Capital Gains", "Losses brought forward", fmtGbp(0)]),
    csvRow(["Capital Gains", "Net gains after losses", fmtGbp(netGainsAfterLosses)]),
    csvRow(["Capital Gains", "Annual exempt amount", fmtGbp(annualExempt)]),
    csvRow(["Capital Gains", "Taxable gains", fmtGbp(taxableGains)]),
    "",
    csvRow(["Crypto Income", "Total crypto income (GBP)", fmtGbp(totalCryptoIncome)]),
    csvRow(["Crypto Income", "Number of income events", report.incomeEvents.length.toString()]),
    "",
    "Detailed Disposals",
    csvRow(["Date Disposed", "Asset", "Amount", "Proceeds (GBP)", "Allowable Cost (GBP)", "Gain/Loss (GBP)"]),
  ];

  report.taxableEvents.forEach((event: any) => {
    lines.push(csvRow([
      event.date.toISOString().split("T")[0],
      event.asset,
      event.amount.toString(),
      event.proceeds.toFixed(2),
      event.costBasis.toFixed(2),
      event.gainLoss.toFixed(2),
    ]));
  });

  return lines.join("\n");
}

/**
 * Generate UK Disposals CSV for SA108
 */
function generateUkDisposalsCsv(report: TaxReport): string {
  const headers = [
    "Date Disposed",
    "Asset",
    "Quantity",
    "Proceeds (GBP)",
    "Allowable Cost (GBP)",
    "Gain/Loss (GBP)",
    "Matching Rule",
  ];

  const rows = report.taxableEvents.map((event: any) => [
    event.date.toISOString().split("T")[0],
    event.asset,
    event.amount.toString(),
    event.proceeds.toFixed(2),
    event.costBasis.toFixed(2),
    event.gainLoss.toFixed(2),
    "Section 104", // Default rule; same-day and B&B matches are absorbed during calculation
  ]);

  return [headers, ...rows].map(csvRow).join("\n");
}

/**
 * Generate German Anlage SO Summary CSV
 */
function generateDeAnlageSo(report: TaxReport, year: number): string {
  const fmtEur = (n: number): string => `\u20ac${n.toFixed(2)}`;

  const totalProceeds = report.taxableEvents.reduce((s, e: any) => s + e.proceeds, 0);
  const totalCosts = report.taxableEvents.reduce((s, e: any) => s + e.costBasis, 0);
  const gainLoss = totalProceeds - totalCosts;
  const freigrenze = 1000;
  const taxableGain = gainLoss > freigrenze ? gainLoss : (gainLoss > 0 ? 0 : gainLoss);

  // Tax-free disposals: long-term holdings (> 1 year)
  const taxFreeAmount = report.taxableEvents
    .filter((e: any) => e.holdingPeriod === "long")
    .reduce((s, e: any) => s + e.gainLoss, 0);

  const totalCryptoIncome = report.incomeEvents.reduce((s, e: any) => s + e.valueUsd, 0);
  const incomeFreigrenze = 256;
  const taxableIncome = totalCryptoIncome >= incomeFreigrenze ? totalCryptoIncome : 0;

  const lines: string[] = [
    `Anlage SO - Steuerjahr ${year}`,
    "",
    csvRow(["Abschnitt", "Feld", "Wert"]),
    csvRow(["Private Veraeusserungsgeschaefte (§23)", "Gesamterloes (EUR)", fmtEur(totalProceeds)]),
    csvRow(["Private Veraeusserungsgeschaefte (§23)", "Anschaffungskosten (EUR)", fmtEur(totalCosts)]),
    csvRow(["Private Veraeusserungsgeschaefte (§23)", "Gewinn/Verlust (EUR)", fmtEur(gainLoss)]),
    csvRow(["Private Veraeusserungsgeschaefte (§23)", "Freigrenze (1000 EUR)", fmtEur(freigrenze)]),
    csvRow(["Private Veraeusserungsgeschaefte (§23)", "Steuerpflichtiger Gewinn", fmtEur(taxableGain)]),
    csvRow(["Private Veraeusserungsgeschaefte (§23)", "Steuerfreie Veraeusserungen (>1 Jahr)", fmtEur(taxFreeAmount)]),
    "",
    csvRow(["Sonstige Einkuenfte (§22 Nr.3)", "Einkuenfte aus Staking/Mining (EUR)", fmtEur(totalCryptoIncome)]),
    csvRow(["Sonstige Einkuenfte (§22 Nr.3)", "Freigrenze (256 EUR)", fmtEur(incomeFreigrenze)]),
    csvRow(["Sonstige Einkuenfte (§22 Nr.3)", "Steuerpflichtige Einkuenfte", fmtEur(taxableIncome)]),
    "",
    "Detaillierte Veraeusserungen",
    csvRow(["Datum", "Vermoegenswert", "Menge", "Erloes (EUR)", "Anschaffungskosten (EUR)", "Gewinn/Verlust (EUR)", "Haltedauer", "Steuerfrei"]),
  ];

  report.taxableEvents.forEach((event: any) => {
    const isLong = event.holdingPeriod === "long";
    let holdingDays = "";
    if (event.dateAcquired) {
      const acquired = new Date(event.dateAcquired);
      const disposed = new Date(event.date);
      holdingDays = Math.floor((disposed.getTime() - acquired.getTime()) / (1000 * 60 * 60 * 24)).toString();
    }
    lines.push(csvRow([
      event.date.toISOString().split("T")[0],
      event.asset,
      event.amount.toString(),
      event.proceeds.toFixed(2),
      event.costBasis.toFixed(2),
      event.gainLoss.toFixed(2),
      holdingDays ? `${holdingDays} Tage` : (isLong ? ">365 Tage" : "<=365 Tage"),
      isLong ? "Ja" : "Nein",
    ]));
  });

  return lines.join("\n");
}

/**
 * Generate German Detailed Disposals CSV
 */
function generateDeDisposalsCsv(report: TaxReport): string {
  const headers = [
    "Datum",
    "Vermoegenswert",
    "Menge",
    "Erloes (EUR)",
    "Anschaffungskosten (EUR)",
    "Gewinn/Verlust (EUR)",
    "Haltedauer (Tage)",
    "Steuerfrei (>1 Jahr)",
  ];

  const rows = report.taxableEvents.map((event: any) => {
    const isLong = event.holdingPeriod === "long";
    let holdingDays = "";
    if (event.dateAcquired) {
      const acquired = new Date(event.dateAcquired);
      const disposed = new Date(event.date);
      holdingDays = Math.floor((disposed.getTime() - acquired.getTime()) / (1000 * 60 * 60 * 24)).toString();
    } else {
      holdingDays = isLong ? ">365" : "<=365";
    }
    return [
      event.date.toISOString().split("T")[0],
      event.asset,
      event.amount.toString(),
      event.proceeds.toFixed(2),
      event.costBasis.toFixed(2),
      event.gainLoss.toFixed(2),
      holdingDays,
      isLong ? "Ja" : "Nein",
    ];
  });

  return [headers, ...rows].map(csvRow).join("\n");
}
