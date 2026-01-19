import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";

const prisma = new PrismaClient();

/**
 * GET /api/dev/check-notes
 * Check if transactions have notes with cost basis
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Get CSV-imported sell transactions
    const csvSellTransactions = await prisma.transaction.findMany({
      where: {
        source_type: "csv_import",
        wallet_address: null,
        type: "Sell",
      },
      take: 20,
      orderBy: { tx_timestamp: "desc" },
      select: {
        id: true,
        type: true,
        asset_symbol: true,
        value_usd: true,
        notes: true,
        tx_timestamp: true,
      },
    });

    const analysis = csvSellTransactions.map(tx => ({
      id: tx.id,
      asset: tx.asset_symbol,
      value_usd: Number(tx.value_usd),
      hasNotes: !!tx.notes,
      notesLength: tx.notes?.length || 0,
      notesPreview: tx.notes?.substring(0, 200) || null,
      hasCostBasis: tx.notes?.includes("Cost Basis:") || false,
      hasPurchasedDate: tx.notes?.includes("Purchased:") || false,
      date: tx.tx_timestamp.toISOString().split('T')[0],
    }));

    const stats = {
      total: csvSellTransactions.length,
      withNotes: csvSellTransactions.filter(tx => tx.notes).length,
      withCostBasis: csvSellTransactions.filter(tx => tx.notes?.includes("Cost Basis:")).length,
      withPurchasedDate: csvSellTransactions.filter(tx => tx.notes?.includes("Purchased:")).length,
    };

    return NextResponse.json({
      status: "success",
      stats,
      transactions: analysis,
    });
  } catch (error) {
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
