import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";

/**
 * GET /api/tax-reports/debug?year=2024
 * Debug endpoint to see what transactions exist and why they're not being calculated
 */
export async function GET(request: NextRequest) {
  try {
    // Pass request for proper Vercel session handling
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const year = parseInt(searchParams.get("year") || "2024");

    // Get user with wallets
    const userWithWallets = await prisma.user.findUnique({
      where: { id: user.id },
      include: { wallets: true },
    });

    const walletAddresses = userWithWallets?.wallets.map((w) => w.address) || [];

    // Build where clause (same as tax calculator)
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
    // Also include exchange API imports
    orConditions.push({
      source_type: "exchange_api",
    });

    // Get all transactions
    const allTransactions = await prisma.transaction.findMany({
      where: {
        OR: orConditions,
        tx_timestamp: {
          lte: new Date(`${year}-12-31T23:59:59Z`),
        },
        status: { in: ["confirmed", "completed", "pending"] },
      },
      orderBy: { tx_timestamp: "asc" },
      take: 1000, // Limit to first 1000 for debugging
    });

    // Analyze transactions
    const analysis = {
      totalTransactions: allTransactions.length,
      byType: {} as Record<string, number>,
      byYear: {} as Record<string, number>,
      bySource: {} as Record<string, number>,
      sampleTransactions: allTransactions.slice(0, 10).map(tx => ({
        id: tx.id,
        type: tx.type,
        asset: tx.asset_symbol,
        date: tx.tx_timestamp.toISOString().split('T')[0],
        year: tx.tx_timestamp.getFullYear(),
        valueUsd: Number(tx.value_usd),
        sourceType: tx.source_type,
        notes: tx.notes?.substring(0, 200),
        hasCostBasisInNotes: tx.notes?.includes("Cost Basis:") || false,
        hasPurchasedDateInNotes: tx.notes?.includes("Purchased:") || false,
      })),
      sellTransactions: allTransactions.filter(tx => {
        const type = (tx.type || "").toLowerCase();
        return type === "sell" || tx.type === "Sell";
      }).slice(0, 10).map(tx => ({
        id: tx.id,
        type: tx.type,
        asset: tx.asset_symbol,
        date: tx.tx_timestamp.toISOString().split('T')[0],
        year: tx.tx_timestamp.getFullYear(),
        valueUsd: Number(tx.value_usd),
        notes: tx.notes?.substring(0, 300),
        costBasisInNotes: tx.notes?.match(/Cost Basis:\s*\$?([\d,]+\.?\d*)/i)?.[1],
        purchasedDateInNotes: tx.notes?.match(/Purchased:\s*(\d{4}-\d{2}-\d{2})/i)?.[1],
      })),
      buyTransactions: allTransactions.filter(tx => {
        const type = (tx.type || "").toLowerCase();
        return type === "buy" || tx.type === "Buy";
      }).slice(0, 10).map(tx => ({
        id: tx.id,
        type: tx.type,
        asset: tx.asset_symbol,
        date: tx.tx_timestamp.toISOString().split('T')[0],
        year: tx.tx_timestamp.getFullYear(),
        valueUsd: Number(tx.value_usd),
      })),
    };

    // Count by type
    allTransactions.forEach(tx => {
      const type = tx.type || "unknown";
      analysis.byType[type] = (analysis.byType[type] || 0) + 1;
    });

    // Count by year
    allTransactions.forEach(tx => {
      const txYear = tx.tx_timestamp.getFullYear().toString();
      analysis.byYear[txYear] = (analysis.byYear[txYear] || 0) + 1;
    });

    // Count by source
    allTransactions.forEach(tx => {
      const source = tx.source_type || "unknown";
      analysis.bySource[source] = (analysis.bySource[source] || 0) + 1;
    });

    return NextResponse.json({
      status: "success",
      year,
      analysis,
    });
  } catch (error) {
    console.error("[Tax Reports Debug] Error:", error);
    return NextResponse.json(
      { error: "Failed to debug", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
