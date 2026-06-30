import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { rateLimitAPI, createRateLimitResponse } from "@/lib/rate-limit";
import { invalidateTaxReportCache } from "@/lib/tax-report-cache";

export const runtime = "nodejs";

/**
 * GET /api/transactions/csv-sources
 * Lists the user's CSV imports as "accounts", derived from transactions with
 * source_type = "csv_import" grouped by source. No separate records are stored, so
 * deleting the transactions makes the account disappear (avoids stale sources).
 */
export async function GET(request: NextRequest) {
  const rl = rateLimitAPI(request, 60);
  if (!rl.success) return createRateLimitResponse(rl.remaining, rl.reset);

  let user;
  try {
    user = await getCurrentUser(request);
  } catch {
    /* fallthrough */
  }
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const groups = await prisma.transaction.groupBy({
    by: ["source"],
    where: { userId: user.id, source_type: "csv_import" },
    _count: { _all: true },
    _max: { tx_timestamp: true, createdAt: true },
  });

  const sources = groups
    .map((g) => ({
      source: g.source || "CSV",
      transactionCount: g._count._all,
      lastTransactionAt: g._max.tx_timestamp,
      importedAt: g._max.createdAt,
    }))
    .sort((a, b) => (b.importedAt?.getTime() ?? 0) - (a.importedAt?.getTime() ?? 0));

  return NextResponse.json({ status: "success", sources });
}

/**
 * DELETE /api/transactions/csv-sources?source=NAME
 * Removes all CSV-import transactions for one source (i.e. deletes that CSV "account").
 */
export async function DELETE(request: NextRequest) {
  const rl = rateLimitAPI(request, 20);
  if (!rl.success) return createRateLimitResponse(rl.remaining, rl.reset);

  let user;
  try {
    user = await getCurrentUser(request);
  } catch {
    /* fallthrough */
  }
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const source = request.nextUrl.searchParams.get("source");
  if (source == null) {
    return NextResponse.json({ error: "Missing source parameter" }, { status: 400 });
  }

  const res = await prisma.transaction.deleteMany({
    where: { userId: user.id, source_type: "csv_import", source },
  });
  await invalidateTaxReportCache(user.id);

  return NextResponse.json({ status: "success", deleted: res.count });
}
