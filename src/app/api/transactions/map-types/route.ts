import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { getCategory } from "@/lib/transaction-categorizer";
import { recomputeCostBasis } from "@/lib/compute-cost-basis";
import { invalidateTaxReportCache } from "@/lib/tax-report-cache";

// The categories a user can assign to an unmapped type → a canonical internal type that the
// categorizer + tax engine already understand. "ignore" → a known non-taxable type.
const CANONICAL_TYPE: Record<string, string> = {
  buy: "Buy",
  sell: "Sell",
  income: "Reward",
  transfer: "Transfer",
  deposit: "Deposit",
  withdrawal: "Withdraw",
  swap: "Swap",
  ignore: "Ignored",
};

/**
 * POST /api/transactions/map-types
 * Body: { mappings: [{ rawType: string, category: string }] }
 *
 * Remaps the user's transactions of each unmapped `rawType` to the canonical type for the chosen
 * category (so the tax engine gives it proper treatment), sets is_income when the category is
 * income, then recomputes cost basis. Returns how many rows changed.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json().catch(() => null);
    const mappings: Array<{ rawType?: string; category?: string }> = Array.isArray(body?.mappings) ? body.mappings : [];
    if (mappings.length === 0) {
      return NextResponse.json({ error: "No mappings provided" }, { status: 400 });
    }

    const withWallets = await prisma.user.findUnique({
      where: { id: user.id },
      include: { wallets: true },
    });
    const walletAddresses = withWallets?.wallets.map((w) => w.address) || [];
    const ownership = [{ wallet_address: { in: walletAddresses } }, { userId: user.id }];

    let updated = 0;
    const applied: Array<{ rawType: string; type: string; count: number }> = [];
    for (const m of mappings) {
      const rawType = (m.rawType || "").trim();
      const canonical = CANONICAL_TYPE[(m.category || "").trim().toLowerCase()];
      if (!rawType || !canonical) continue;

      const res = await prisma.transaction.updateMany({
        where: { OR: ownership, type: rawType },
        data: {
          type: canonical,
          is_income: getCategory(canonical) === "income",
          identified: true,
        },
      });
      updated += res.count;
      if (res.count > 0) applied.push({ rawType, type: canonical, count: res.count });
    }

    // Recompute cost basis / gain-loss now that the types have proper tax treatment.
    if (updated > 0) {
      await recomputeCostBasis(user.id);
      await invalidateTaxReportCache(user.id);
    }

    return NextResponse.json({ status: "success", updated, applied });
  } catch (error) {
    console.error("[Map Types] Error:", error);
    return NextResponse.json(
      { status: "error", error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
