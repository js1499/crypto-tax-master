import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";

const prisma = new PrismaClient();

/**
 * GET /api/debug/import-status
 * Check the status of recently imported transactions and their notes
 */
export async function GET(request: NextRequest) {
  try {
    const sessionCookie = request.cookies.get("session_token")?.value;

    const user = await getCurrentUser(sessionCookie);
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Get recent CSV imports
    const recentTransactions = await prisma.transaction.findMany({
      where: {
        source_type: "csv_import",
        wallet_address: null,
      },
      orderBy: {
        tx_timestamp: "desc",
      },
      take: 50,
    });

    // Analyze notes
    const withNotes = recentTransactions.filter(tx => tx.notes && tx.notes.trim().length > 0);
    const withoutNotes = recentTransactions.filter(tx => !tx.notes || tx.notes.trim().length === 0);
    
    const withCostBasis = recentTransactions.filter(tx => 
      tx.notes && tx.notes.includes("Cost Basis:")
    );
    
    const withPurchasedDate = recentTransactions.filter(tx =>
      tx.notes && tx.notes.includes("Purchased:")
    );

    // Sample transactions
    const sellTransactions = recentTransactions.filter(tx => 
      tx.type === "Sell" || tx.type === "sell"
    ).slice(0, 10);

    const sampleWithNotes = withNotes.slice(0, 5).map(tx => ({
      id: tx.id,
      type: tx.type,
      asset: tx.asset_symbol,
      date: tx.tx_timestamp.toISOString().split('T')[0],
      notes: tx.notes?.substring(0, 300) || null,
      hasCostBasis: tx.notes?.includes("Cost Basis:") || false,
      hasPurchasedDate: tx.notes?.includes("Purchased:") || false,
    }));

    const sampleWithoutNotes = withoutNotes.slice(0, 5).map(tx => ({
      id: tx.id,
      type: tx.type,
      asset: tx.asset_symbol,
      date: tx.tx_timestamp.toISOString().split('T')[0],
      value_usd: Number(tx.value_usd),
      notes: tx.notes,
    }));

    return NextResponse.json({
      status: "success",
      summary: {
        totalRecent: recentTransactions.length,
        withNotes: withNotes.length,
        withoutNotes: withoutNotes.length,
        withCostBasis: withCostBasis.length,
        withPurchasedDate: withPurchasedDate.length,
        sellTransactions: sellTransactions.length,
      },
      analysis: {
        notesCoverage: recentTransactions.length > 0 
          ? `${((withNotes.length / recentTransactions.length) * 100).toFixed(1)}%`
          : "0%",
        costBasisCoverage: recentTransactions.length > 0
          ? `${((withCostBasis.length / recentTransactions.length) * 100).toFixed(1)}%`
          : "0%",
      },
      samples: {
        withNotes: sampleWithNotes,
        withoutNotes: sampleWithoutNotes,
      },
      message: withoutNotes.length > 0 
        ? `⚠️ ${withoutNotes.length} transactions are missing notes. Cost basis may not be saved correctly.`
        : "✅ All transactions have notes with cost basis.",
    });
  } catch (error) {
    console.error("[Debug Import Status] Error:", error);
    return NextResponse.json(
      {
        status: "error",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}
