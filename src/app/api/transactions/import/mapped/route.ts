import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { rateLimitAPI, createRateLimitResponse } from "@/lib/rate-limit";
import { parseCSV } from "@/lib/csv-parser";
import { applyMapping, type CsvFieldMapping } from "@/lib/csv-field-mapper";
import { getCategory } from "@/lib/transaction-categorizer";
import { recomputeCostBasis } from "@/lib/compute-cost-basis";
import { invalidateTaxReportCache } from "@/lib/tax-report-cache";
import { getUserPlan, countUserTransactions, LIMIT_TAX_YEAR } from "@/lib/plan-limits";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * POST /api/transactions/import/mapped
 * Body: FormData { file, mapping (JSON CsvFieldMapping), source? }
 * Applies a user-defined field mapping, cleans every value, inserts the
 * transactions (owned by the user, source_type "csv_import"), then recomputes
 * cost basis. The companion to /preview for the interactive field mapper.
 */
export async function POST(request: NextRequest) {
  const rl = rateLimitAPI(request, 20);
  if (!rl.success) return createRateLimitResponse(rl.remaining, rl.reset);

  let user;
  try {
    user = await getCurrentUser(request);
  } catch {
    /* fallthrough */
  }
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const form = await request.formData();
  const file = form.get("file");
  const mappingRaw = form.get("mapping");
  const sourceLabel = (form.get("source") as string) || "CSV";

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (typeof mappingRaw !== "string") {
    return NextResponse.json({ error: "No mapping provided" }, { status: 400 });
  }

  let mapping: CsvFieldMapping;
  try {
    mapping = JSON.parse(mappingRaw);
  } catch {
    return NextResponse.json({ error: "Invalid mapping JSON" }, { status: 400 });
  }

  const cols = mapping?.columns ?? {};
  const missing = (["timestamp", "symbol", "quantity"] as const).filter(
    (f) => cols[f] == null,
  );
  if (missing.length) {
    return NextResponse.json(
      { error: `Mapping is missing required field(s): ${missing.join(", ")}` },
      { status: 400 },
    );
  }

  const content = await file.text();
  const rows = parseCSV(content);
  const { transactions: parsed, skipped } = applyMapping(rows, mapping);

  if (parsed.length === 0) {
    return NextResponse.json(
      {
        status: "error",
        error: "No valid transactions after applying the mapping",
        skippedSamples: skipped.slice(0, 10),
      },
      { status: 400 },
    );
  }

  // Plan limit (mirror /import behaviour)
  const userPlan = await getUserPlan(user.id);
  const currentCount = await countUserTransactions(user.id);
  let toInsert = parsed;
  let truncated = 0;
  if (userPlan.transactionLimit !== Infinity) {
    const remaining = Math.max(0, userPlan.transactionLimit - currentCount);
    if (remaining <= 0) {
      return NextResponse.json(
        {
          status: "error",
          error: `${LIMIT_TAX_YEAR} transaction limit reached (${userPlan.transactionLimit.toLocaleString()} for ${userPlan.planName} plan). Upgrade to import more.`,
        },
        { status: 403 },
      );
    }
    if (parsed.length > remaining) {
      truncated = parsed.length - remaining;
      toInsert = parsed.slice(0, remaining);
    }
  }

  const data: Prisma.TransactionCreateManyInput[] = toInsert.map((tx) => ({
    type: tx.type,
    status: "confirmed",
    source: sourceLabel,
    source_type: "csv_import",
    asset_symbol: tx.asset_symbol,
    amount_value: tx.amount_value as unknown as Prisma.Decimal,
    price_per_unit: (tx.price_per_unit as unknown as Prisma.Decimal) ?? null,
    value_usd: tx.value_usd as unknown as Prisma.Decimal,
    fee_usd: (tx.fee_usd as unknown as Prisma.Decimal) ?? null,
    tx_timestamp: tx.tx_timestamp,
    identified: getCategory(tx.type) !== "other",
    notes: tx.notes ?? null,
    incoming_asset_symbol: tx.incoming_asset_symbol ?? null,
    incoming_amount_value: (tx.incoming_amount_value as unknown as Prisma.Decimal) ?? null,
    incoming_value_usd: (tx.incoming_value_usd as unknown as Prisma.Decimal) ?? null,
    userId: user.id,
  }));

  let added = 0;
  const batchSize = 1000;
  for (let i = 0; i < data.length; i += batchSize) {
    const res = await prisma.transaction.createMany({
      data: data.slice(i, i + batchSize),
      skipDuplicates: true,
    });
    added += res.count;
  }

  await invalidateTaxReportCache(user.id);
  // Cost basis can only be computed once values exist; run it now (rows with no USD
  // value will need price enrichment to produce gains — separate step).
  const recompute = await recomputeCostBasis(user.id);

  return NextResponse.json({
    status: "success",
    added,
    parsed: parsed.length,
    skippedRows: skipped.length,
    skippedSamples: skipped.slice(0, 10),
    truncated,
    needsCostBasisReview: recompute.needsReview,
  });
}
