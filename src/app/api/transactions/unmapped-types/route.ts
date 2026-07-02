import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { isMappedType } from "@/lib/transaction-categorizer";

/**
 * GET /api/transactions/unmapped-types
 *
 * Returns the distinct transaction `type` values among the user's transactions that our
 * categorizer does NOT recognize (they fall back to "other" only because we have no mapping —
 * as opposed to types deliberately mapped to "other" like burn/spam/fee). These get no tax
 * treatment until mapped, so the UI surfaces them for the user to classify. Sorted by count.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const withWallets = await prisma.user.findUnique({
      where: { id: user.id },
      include: { wallets: true },
    });
    const walletAddresses = withWallets?.wallets.map((w) => w.address) || [];

    // Tenant isolation: rows from the user's wallets OR explicitly owned (exchange/CSV).
    const grouped = await prisma.transaction.groupBy({
      by: ["type"],
      where: {
        OR: [{ wallet_address: { in: walletAddresses } }, { userId: user.id }],
        status: { in: ["confirmed", "completed", "pending"] },
      },
      _count: { _all: true },
    });

    const unmapped = grouped
      .filter((g) => g.type && !isMappedType(g.type))
      .map((g) => ({ type: g.type, count: g._count._all }))
      .sort((a, b) => b.count - a.count);

    return NextResponse.json({ status: "success", unmapped });
  } catch (error) {
    console.error("[Unmapped Types] Error:", error);
    return NextResponse.json(
      { status: "error", error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
