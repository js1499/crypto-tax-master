import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { rateLimitAPI, createRateLimitResponse } from "@/lib/rate-limit";
import { parseCSV } from "@/lib/csv-parser";
import { suggestMapping, distinctTypeValues } from "@/lib/csv-field-mapper";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/transactions/import/preview
 * Body: FormData { file }
 * Returns the CSV headers, a few sample rows, an auto-suggested field mapping, and
 * the distinct values in the suggested `type` column — everything the interactive
 * field-mapper UI needs to render. Does NOT write anything.
 */
export async function POST(request: NextRequest) {
  const rl = rateLimitAPI(request, 30);
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
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const content = await file.text();
  const rows = parseCSV(content);
  if (rows.length < 2) {
    return NextResponse.json(
      { status: "error", error: "CSV file has no data rows" },
      { status: 400 },
    );
  }

  const headers = rows[0];
  const suggestedMapping = suggestMapping(headers);
  const typeValues =
    suggestedMapping.columns.type != null
      ? distinctTypeValues(rows, suggestedMapping)
      : [];

  return NextResponse.json({
    status: "success",
    headers,
    sampleRows: rows.slice(1, 11),
    rowCount: rows.length - 1,
    suggestedMapping,
    typeValues,
  });
}
