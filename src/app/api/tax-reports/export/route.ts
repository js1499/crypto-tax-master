import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { calculateTaxReport, TaxReport } from "@/lib/tax-calculator";
import { getCurrentUser } from "@/lib/auth-helpers";
import { rateLimitAPI, createRateLimitResponse } from "@/lib/rate-limit";

const prisma = new PrismaClient();

/**
 * GET /api/tax-reports/export?year=2023&type=capital-gains-csv
 * Export tax report data in various formats (CSV, etc.)
 * 
 * Supported types:
 * - capital-gains-csv: CSV of all capital gains/losses
 * - transaction-history: CSV of all transactions
 * - income-report: CSV of income-generating transactions
 * - capital-gains-by-asset: CSV with proceeds, basis, and gain/loss per asset
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

    // Get user authentication
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: "Not authenticated" },
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

    // Calculate tax report
    const report = await calculateTaxReport(
      prisma,
      walletAddresses,
      year,
      "FIFO",
      user.id
    );

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
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
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

  return [headers, ...rows].map((row) => row.join(",")).join("\n");
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

  // Build where clause (same logic as tax calculator)
  const orConditions: any[] = [];
  if (walletAddresses.length > 0) {
    orConditions.push({ wallet_address: { in: walletAddresses } });
  }
  orConditions.push({
    AND: [
      { source_type: "csv_import" },
      { wallet_address: null },
    ],
  });

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

  return [headers, ...rows].map((row) => row.join(",")).join("\n");
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

  return [headers, ...rows].map((row) => row.join(",")).join("\n");
}
