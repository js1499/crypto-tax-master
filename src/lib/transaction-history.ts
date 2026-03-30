import prisma from "@/lib/prisma";

function serializeValue(value: any): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && value.toFixed) return value.toString(); // Decimal
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

const TRACKED_FIELDS = [
  "type", "subtype", "status", "source", "asset_symbol", "identified",
  "notes", "amount_value", "price_per_unit", "value_usd", "fee_usd",
  "incoming_asset_symbol", "incoming_amount_value", "incoming_value_usd",
  "tx_timestamp",
];

export function diffChanges(
  existing: Record<string, any>,
  updatePayload: Record<string, any>,
): Array<{ fieldName: string; oldValue: string | null; newValue: string | null }> {
  const changes: Array<{ fieldName: string; oldValue: string | null; newValue: string | null }> = [];

  for (const field of TRACKED_FIELDS) {
    if (!(field in updatePayload)) continue;
    const oldVal = serializeValue(existing[field]);
    const newVal = serializeValue(updatePayload[field]);
    if (oldVal !== newVal) {
      changes.push({ fieldName: field, oldValue: oldVal, newValue: newVal });
    }
  }

  return changes;
}

export async function recordEditHistory(
  transactionId: number,
  version: number,
  changes: Array<{ fieldName: string; oldValue: string | null; newValue: string | null }>,
  userId: string,
  isRevert = false,
): Promise<void> {
  if (changes.length === 0) return;

  await prisma.transactionEditHistory.createMany({
    data: changes.map(c => ({
      transactionId,
      version,
      fieldName: c.fieldName,
      oldValue: c.oldValue,
      newValue: c.newValue,
      editedBy: userId,
      isRevert,
    })),
  });
}

export async function getEditHistory(transactionId: number) {
  const entries = await prisma.transactionEditHistory.findMany({
    where: { transactionId },
    orderBy: [{ version: "desc" }, { id: "asc" }],
  });

  // Group by version
  const grouped = new Map<number, {
    version: number;
    editedAt: Date;
    editedBy: string | null;
    isRevert: boolean;
    changes: Array<{ fieldName: string; oldValue: string | null; newValue: string | null }>;
  }>();

  for (const entry of entries) {
    if (!grouped.has(entry.version)) {
      grouped.set(entry.version, {
        version: entry.version,
        editedAt: entry.editedAt,
        editedBy: entry.editedBy,
        isRevert: entry.isRevert,
        changes: [],
      });
    }
    grouped.get(entry.version)!.changes.push({
      fieldName: entry.fieldName,
      oldValue: entry.oldValue,
      newValue: entry.newValue,
    });
  }

  return Array.from(grouped.values());
}

export async function buildRevertPayload(
  transactionId: number,
  targetVersion: number,
): Promise<Record<string, any>> {
  // Get all history entries from version 1 up to (but not including) current,
  // then reconstruct the state at targetVersion by replaying changes
  const entries = await prisma.transactionEditHistory.findMany({
    where: {
      transactionId,
      version: { gt: targetVersion },
    },
    orderBy: [{ version: "desc" }, { id: "desc" }],
  });

  // For each field changed after targetVersion, the oldValue of the earliest
  // change after targetVersion is what we need to revert to
  const revertValues = new Map<string, string | null>();

  // Process in reverse order (newest first) — we want the oldValue from
  // the first change after targetVersion for each field
  for (const entry of entries) {
    // Always overwrite — since we're going newest→oldest, the last one
    // we see for each field will be the earliest change (closest to target)
    revertValues.set(entry.fieldName, entry.oldValue);
  }

  // Convert string values back to appropriate types
  const payload: Record<string, any> = {};
  for (const [field, value] of revertValues) {
    if (value === null) {
      payload[field] = null;
    } else if (field === "identified" || field === "is_income") {
      payload[field] = value === "true";
    } else if (["amount_value", "price_per_unit", "value_usd", "fee_usd", "incoming_amount_value", "incoming_value_usd"].includes(field)) {
      payload[field] = parseFloat(value);
    } else if (field === "tx_timestamp") {
      payload[field] = new Date(value);
    } else {
      payload[field] = value;
    }
  }

  return payload;
}
