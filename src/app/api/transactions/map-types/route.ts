import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { canonicalTypeForCategory } from "@/lib/transaction-categorizer";
import { recomputeCostBasis } from "@/lib/compute-cost-basis";
import { invalidateTaxReportCache } from "@/lib/tax-report-cache";

/**
 * POST /api/transactions/map-types
 * Body: { mappings: [{ rawType: string, category: string }] }
 *
 * Persists each mapping (so future syncs of the same raw type auto-apply — no re-prompt), then
 * recomputes cost basis. recomputeCostBasis → applyUserTypeMappings does the actual remap:
 * canonicalizes the type, preserves the original label in original_type, and sets is_income.
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

    const saved: Array<{ rawType: string; category: string }> = [];
    for (const m of mappings) {
      const rawType = (m.rawType || "").trim();
      const category = (m.category || "").trim().toLowerCase();
      if (!rawType || !canonicalTypeForCategory(category)) continue; // ignore invalid entries

      // Remember the mapping (idempotent per user+rawType).
      await prisma.userTypeMapping.upsert({
        where: { userId_rawType: { userId: user.id, rawType } },
        create: { userId: user.id, rawType, category },
        update: { category },
      });
      saved.push({ rawType, category });
    }

    if (saved.length > 0) {
      // Applies the remembered mappings (remap + preserve original + is_income) then recomputes.
      await recomputeCostBasis(user.id);
      await invalidateTaxReportCache(user.id);
    }

    return NextResponse.json({ status: "success", mapped: saved.length, saved });
  } catch (error) {
    console.error("[Map Types] Error:", error);
    return NextResponse.json(
      { status: "error", error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
