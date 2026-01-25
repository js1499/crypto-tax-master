import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";

/**
 * GET /api/tax-reports/diagnose?year=2024
 * Comprehensive diagnostic endpoint to identify why tax reports show $0.00
 */
export async function GET(request: NextRequest) {
  try {
    // Pass request for proper Vercel session handling
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const year = parseInt(searchParams.get("year") || new Date().getFullYear().toString());

    // Get user with wallets
    const userWithWallets = await prisma.user.findUnique({
      where: { id: user.id },
      include: { wallets: true },
    });

    if (!userWithWallets) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const walletAddresses = userWithWallets.wallets.map((w) => w.address);

    // Build the same where clause as calculateTaxReport
    const whereClause: any = {
      tx_timestamp: {
        lte: new Date(`${year}-12-31T23:59:59Z`),
      },
      OR: [
        ...(walletAddresses.length > 0 ? [{ wallet_address: { in: walletAddresses } }] : []),
        {
          AND: [
            { source_type: "csv_import" },
            { wallet_address: null },
          ],
        },
        // Also include exchange API imports
        { source_type: "exchange_api" },
      ],
      status: { in: ["confirmed", "completed", "pending"] },
    };

    // Get all transactions
    const allTransactions = await prisma.transaction.findMany({
      where: whereClause,
      orderBy: { tx_timestamp: "asc" },
      take: 10000, // Limit for performance
    });

    // Analyze transactions
    const csvImports = allTransactions.filter(tx => tx.source_type === "csv_import");
    const walletTransactions = allTransactions.filter(tx => tx.source_type !== "csv_import");
    
    // Group by year
    const byYear: Record<number, number> = {};
    allTransactions.forEach(tx => {
      const txYear = tx.tx_timestamp.getFullYear();
      byYear[txYear] = (byYear[txYear] || 0) + 1;
    });

    // Find sell transactions
    const sellTransactions = allTransactions.filter(tx => {
      const type = (tx.type || "").toLowerCase();
      return type === "sell" || tx.type === "Sell";
    });

    // Group sell transactions by year
    const sellByYear: Record<number, number> = {};
    sellTransactions.forEach(tx => {
      const txYear = tx.tx_timestamp.getFullYear();
      sellByYear[txYear] = (sellByYear[txYear] || 0) + 1;
    });

    // Check sell transactions in the requested year
    const sellInYear = sellTransactions.filter(tx => {
      const txYear = tx.tx_timestamp.getFullYear();
      return txYear === year;
    });

    // Analyze sell transactions for cost basis
    const sellAnalysis = sellInYear.slice(0, 20).map(tx => ({
      id: tx.id,
      type: tx.type,
      asset: tx.asset_symbol,
      date: tx.tx_timestamp.toISOString().split('T')[0],
      year: tx.tx_timestamp.getFullYear(),
      value_usd: Number(tx.value_usd),
      notes: tx.notes?.substring(0, 300) || null,
      hasCostBasisInNotes: tx.notes?.includes("Cost Basis:") || false,
      hasPurchasedDateInNotes: tx.notes?.includes("Purchased:") || false,
      source_type: tx.source_type,
      wallet_address: tx.wallet_address,
    }));

    // Check for buy transactions (needed for cost basis lots)
    const buyTransactions = allTransactions.filter(tx => {
      const type = (tx.type || "").toLowerCase();
      return type === "buy" || tx.type === "Buy";
    });

    const buyByYear: Record<number, number> = {};
    buyTransactions.forEach(tx => {
      const txYear = tx.tx_timestamp.getFullYear();
      buyByYear[txYear] = (buyByYear[txYear] || 0) + 1;
    });

    // Transaction type breakdown
    const typeBreakdown: Record<string, number> = {};
    allTransactions.forEach(tx => {
      const type = tx.type || "unknown";
      typeBreakdown[type] = (typeBreakdown[type] || 0) + 1;
    });

    return NextResponse.json({
      status: "success",
      year,
      summary: {
        totalTransactions: allTransactions.length,
        csvImports: csvImports.length,
        walletTransactions: walletTransactions.length,
        sellTransactions: sellTransactions.length,
        buyTransactions: buyTransactions.length,
      },
      byYear,
      sellByYear,
      buyByYear,
      typeBreakdown,
      sellInYearCount: sellInYear.length,
      sellAnalysis,
      sampleTransactions: allTransactions.slice(0, 5).map(tx => ({
        id: tx.id,
        type: tx.type,
        asset: tx.asset_symbol,
        date: tx.tx_timestamp.toISOString().split('T')[0],
        year: tx.tx_timestamp.getFullYear(),
        value_usd: Number(tx.value_usd),
        source_type: tx.source_type,
      })),
      diagnostics: {
        hasTransactions: allTransactions.length > 0,
        hasSellTransactions: sellTransactions.length > 0,
        hasSellInYear: sellInYear.length > 0,
        hasBuyTransactions: buyTransactions.length > 0,
        hasCsvImports: csvImports.length > 0,
        requestedYear: year,
        yearsWithData: Object.keys(byYear).map(Number).sort(),
        yearsWithSells: Object.keys(sellByYear).map(Number).sort(),
      },
    });
  } catch (error) {
    console.error("[Diagnose] Error:", error);
    return NextResponse.json(
      {
        status: "error",
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}
