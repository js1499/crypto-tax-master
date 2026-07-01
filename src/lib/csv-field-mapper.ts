/**
 * Generic, mapping-driven CSV cleaner + parser.
 *
 * Instead of guessing columns by header name (brittle — silently drops rows for
 * any unrecognized format), the user maps THEIR columns onto our canonical fields
 * and we clean + normalize the values. This module is the pure core: cleaning
 * primitives, auto-suggestion, and `applyMapping`. The UI and API wrap it.
 */
import { Decimal } from "@prisma/client/runtime/library";
import { getCategory } from "./transaction-categorizer";
import type { ParsedTransaction } from "./csv-parser";

// ---------------------------------------------------------------------------
// Mapping spec
// ---------------------------------------------------------------------------

export type CanonicalField =
  | "timestamp"
  | "time" // optional separate time column (combined with `timestamp`'s date)
  | "symbol"
  | "quantity"
  | "type"
  | "value" // signed USD amount (net +/-); drives derived CSV gain/loss (see applyMapping)
  | "proceeds" // gross proceeds (USD); with costBasis -> gain = proceeds - costBasis
  | "costBasis" // cost basis (USD); pairs with proceeds/value for normal P&L
  | "fee"
  | "incomingSymbol"
  | "incomingQuantity"
  | "incomingValue";

export const REQUIRED_FIELDS: CanonicalField[] = ["timestamp", "symbol", "quantity"];

export type DateFormat = "auto" | "MDY" | "DMY" | "YMD" | "ISO" | "UNIX";

export interface CsvFieldMapping {
  /** Canonical field -> column index in the header row. Unmapped fields are omitted. */
  columns: Partial<Record<CanonicalField, number>>;
  options?: {
    dateFormat?: DateFormat;
    /** Strip any time component so the stored timestamp is date-only. Default true. */
    dateOnly?: boolean;
    /** Raw value from the `type` column -> canonical category (buy/sell/swap/income/...). */
    typeValueMap?: Record<string, string>;
    /** When `type` is unmapped, derive buy/sell from the sign of quantity (or value). */
    deriveTypeFromSign?: boolean;
  };
}

// Canonical category -> a raw type string the tax engine's getCategory() round-trips
// back to that category (so downstream classification is correct).
const CATEGORY_TO_TYPE: Record<string, string> = {
  buy: "buy",
  sell: "sell",
  swap: "token swap",
  transfer: "transfer",
  deposit: "deposit",
  withdrawal: "withdrawal",
  income: "reward",
  staking: "stake",
  nft: "mint",
  defi: "contract interaction",
  gambling: "PLACE_BET",
  other: "UNKNOWN",
};

// ---------------------------------------------------------------------------
// Cleaning primitives
// ---------------------------------------------------------------------------

/**
 * Parse a messy numeric cell: strips currency symbols / commas / spaces, treats
 * accounting parentheses "(123.45)" and a leading "-" as negative. Returns null
 * if there's no parseable number.
 */
export function cleanNumber(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;

  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.trim();
  if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1);
  } else if (s.startsWith("+")) {
    s = s.slice(1);
  }

  // Keep digits and dots only (drops $, commas, currency codes, spaces).
  s = s.replace(/[^0-9.]/g, "");
  if (s === "" || s === ".") return null;
  // Collapse accidental multiple dots (keep the first as the decimal point).
  const firstDot = s.indexOf(".");
  if (firstDot !== -1) {
    s = s.slice(0, firstDot + 1) + s.slice(firstDot + 1).replace(/\./g, "");
  }

  const n = parseFloat(s);
  if (!isFinite(n)) return null;
  return negative ? -n : n;
}

/** Normalize an asset symbol: uppercase, trimmed, no surrounding junk. */
export function cleanSymbol(raw: string | null | undefined): string {
  if (raw == null) return "";
  return String(raw).trim().toUpperCase().replace(/^\$/, "");
}

function dateOnlyUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function parseDateParts(
  s: string,
  fmt: DateFormat,
): { y: number; m: number; d: number } | null {
  s = s.trim();
  const valid = (y: number, m: number, d: number) =>
    m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 1970 && y <= 2100
      ? { y, m, d }
      : null;

  // Year-first: YYYY-MM-DD / YYYY/MM/DD / YYYY.MM.DD
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) return valid(+m[1], +m[2], +m[3]);

  // X/Y/ZZZZ (four-digit year last)
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (m) {
    const a = +m[1], b = +m[2], y = +m[3];
    if (fmt === "MDY") return valid(y, a, b);
    if (fmt === "DMY") return valid(y, b, a);
    if (a > 12 && b <= 12) return valid(y, b, a); // unambiguous DMY
    if (b > 12 && a <= 12) return valid(y, a, b); // unambiguous MDY
    return valid(y, a, b); // ambiguous -> default US (MDY)
  }

  // X/Y/ZZ (two-digit year last)
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2})$/);
  if (m) {
    const a = +m[1], b = +m[2], y = 2000 + +m[3];
    if (fmt === "MDY") return valid(y, a, b);
    if (fmt === "DMY") return valid(y, b, a);
    if (a > 12 && b <= 12) return valid(y, b, a);
    if (b > 12 && a <= 12) return valid(y, a, b);
    return valid(y, a, b);
  }

  return null;
}

function parseTimeParts(s: string): { hh: number; mm: number; ss: number } {
  if (!s) return { hh: 0, mm: 0, ss: 0 };
  const m = s.trim().match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!m) return { hh: 0, mm: 0, ss: 0 };
  let hh = +m[1];
  const mm = +m[2];
  const ss = m[3] ? +m[3] : 0;
  const ap = m[4]?.toLowerCase();
  if (ap === "pm" && hh < 12) hh += 12;
  if (ap === "am" && hh === 12) hh = 0;
  return { hh: hh % 24, mm: mm % 60, ss: ss % 60 };
}

/**
 * Clean a date (and optional separate time) cell into a Date. KEY behaviour: a
 * datetime placed in the date column ("2025-03-14 09:31:00") is cleaned to
 * date-only by default; pass dateOnly:false (and/or a separate time column) to
 * keep the time. Everything is constructed in UTC to avoid timezone roll-over.
 */
export function cleanTimestamp(
  dateRaw: string | null | undefined,
  timeRaw?: string | null,
  opts?: { dateFormat?: DateFormat; dateOnly?: boolean },
): Date | null {
  const dateOnly = opts?.dateOnly !== false; // default true
  const fmt = opts?.dateFormat ?? "auto";
  if (dateRaw == null) return null;
  const s = String(dateRaw).trim();
  if (!s) return null;

  // Unix epoch (seconds = 10 digits, millis = 13).
  if (fmt === "UNIX" || (fmt === "auto" && /^\d{10}$|^\d{13}$/.test(s))) {
    const num = Number(s);
    if (!isFinite(num)) return null;
    const ms = s.length === 13 ? num : num * 1000;
    const d = new Date(ms);
    if (isNaN(d.getTime())) return null;
    return dateOnly ? dateOnlyUTC(d) : d;
  }

  // Split an embedded time ("2025-03-14T09:31:00Z" / "2025-03-14 09:31") off the date.
  let datePart = s;
  let embeddedTime = "";
  const tMatch = s.match(/^(\S+?)[T\s]+(.+)$/);
  if (tMatch) {
    datePart = tMatch[1];
    embeddedTime = tMatch[2];
  }

  const parts = parseDateParts(datePart, fmt);
  if (!parts) {
    // Last resort: native parse (handles odd ISO variants).
    const d = new Date(s);
    if (isNaN(d.getTime())) return null;
    return dateOnly ? dateOnlyUTC(d) : d;
  }

  if (dateOnly) return new Date(Date.UTC(parts.y, parts.m - 1, parts.d));

  const t = parseTimeParts(timeRaw ? String(timeRaw) : embeddedTime);
  return new Date(Date.UTC(parts.y, parts.m - 1, parts.d, t.hh, t.mm, t.ss));
}

/**
 * Resolve a raw `type` cell to a canonical type string the engine understands.
 * Priority: explicit user value-mapping -> getCategory() default -> "other".
 */
export function cleanType(
  rawType: string | null | undefined,
  typeValueMap?: Record<string, string>,
): string {
  const raw = (rawType ?? "").trim();
  let category: string | undefined;
  if (typeValueMap) {
    category = typeValueMap[raw] ?? typeValueMap[raw.toLowerCase()];
  }
  if (!category) category = getCategory(raw);
  return CATEGORY_TO_TYPE[category] ?? "UNKNOWN";
}

// ---------------------------------------------------------------------------
// Auto-suggestion
// ---------------------------------------------------------------------------

const SYNONYMS: Record<CanonicalField, string[]> = {
  timestamp: ["date", "datetime", "timestamp", "time", "date sold", "executed at", "created at", "trade date"],
  time: ["time of day", "execution time"],
  symbol: ["asset", "symbol", "currency", "coin", "token", "ticker", "market", "pair"],
  quantity: ["quantity", "amount", "qty", "units", "size", "shares", "volume"],
  type: ["type", "transaction type", "action", "side", "operation", "activity"],
  // NOTE: suggestMapping also reverse-matches (ns.includes(header)), so multi-word
  // synonyms containing a bare column name ("amount usd" vs an "Amount" header,
  // "cost usd" vs a "USD" header) over-grab. Keep these specific.
  value: ["value", "total", "usd", "usd value", "subtotal", "net", "net gain", "gain/loss", "pnl", "p&l", "profit", "total value"],
  proceeds: ["proceeds", "gross proceeds", "sale proceeds", "sold for"],
  costBasis: ["cost basis", "costbasis", "basis", "cost", "acquisition cost", "purchase cost"],
  fee: ["fee", "fees", "commission", "transaction fee"],
  incomingSymbol: ["received currency", "buy currency", "to asset", "incoming asset"],
  incomingQuantity: ["received amount", "buy amount", "to amount", "incoming amount"],
  incomingValue: ["received value", "buy value", "to value"],
};

const norm = (s: string) =>
  (s || "").toLowerCase().trim().replace(/\s+/g, " ").replace(/[._()/-]/g, " ").replace(/\s+/g, " ").trim();

/** Best-effort initial mapping from headers, so common formats are 1-click. */
export function suggestMapping(headers: string[]): CsvFieldMapping {
  const normalized = headers.map(norm);
  const used = new Set<number>();
  const columns: Partial<Record<CanonicalField, number>> = {};

  // Most-specific fields first so e.g. "amount usd" goes to value, not quantity.
  const order: CanonicalField[] = [
    // costBasis/proceeds before value (more specific), and value before quantity so
    // "amount usd" / "net gain" is grabbed as the P&L-driving USD column, not quantity.
    "timestamp", "symbol", "type", "costBasis", "proceeds", "value", "fee", "quantity",
    "incomingSymbol", "incomingQuantity", "incomingValue", "time",
  ];
  for (const field of order) {
    for (const syn of SYNONYMS[field]) {
      const ns = norm(syn);
      let idx = normalized.findIndex((h, i) => !used.has(i) && h === ns);
      if (idx === -1) idx = normalized.findIndex((h, i) => !used.has(i) && (h.includes(ns) || ns.includes(h)));
      if (idx !== -1) {
        columns[field] = idx;
        used.add(idx);
        break;
      }
    }
  }
  return { columns, options: { dateFormat: "auto", dateOnly: true } };
}

/** Distinct non-empty values in the mapped `type` column — feeds the value-mapper UI. */
export function distinctTypeValues(csv: string[][], mapping: CsvFieldMapping): string[] {
  const idx = mapping.columns.type;
  if (idx == null) return [];
  const seen = new Set<string>();
  for (let r = 1; r < csv.length; r++) {
    const v = (csv[r][idx] ?? "").trim();
    if (v) seen.add(v);
  }
  return [...seen];
}

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------

export interface ApplyResult {
  transactions: ParsedTransaction[];
  skipped: { row: number; reason: string }[];
}

/** Apply a mapping to parsed CSV rows, cleaning every field. Row 0 is the header. */
export function applyMapping(csv: string[][], mapping: CsvFieldMapping): ApplyResult {
  const transactions: ParsedTransaction[] = [];
  const skipped: { row: number; reason: string }[] = [];
  if (csv.length < 2) return { transactions, skipped };

  const c = mapping.columns;
  const opts = mapping.options ?? {};
  const cell = (row: string[], field: CanonicalField): string | undefined => {
    const i = c[field];
    return i == null ? undefined : row[i];
  };

  for (let r = 1; r < csv.length; r++) {
    const row = csv[r];
    if (!row || row.length === 0 || row.every((x) => !x || !x.trim())) continue; // blank line

    const symbol = cleanSymbol(cell(row, "symbol"));
    if (!symbol) {
      skipped.push({ row: r + 1, reason: "missing symbol" });
      continue;
    }
    const qtyRaw = cleanNumber(cell(row, "quantity"));
    if (qtyRaw == null) {
      skipped.push({ row: r + 1, reason: "missing/invalid quantity" });
      continue;
    }
    const ts = cleanTimestamp(cell(row, "timestamp"), cell(row, "time"), {
      dateFormat: opts.dateFormat,
      dateOnly: opts.dateOnly,
    });
    if (!ts) {
      skipped.push({ row: r + 1, reason: "missing/invalid date" });
      continue;
    }

    const valueRaw = cleanNumber(cell(row, "value"));
    const proceedsRaw = cleanNumber(cell(row, "proceeds"));
    const costRaw = cleanNumber(cell(row, "costBasis"));
    const feeRaw = cleanNumber(cell(row, "fee"));

    // Type: explicit column, else derive from the sign of the net quantity/value.
    let type: string;
    if (c.type != null) {
      type = cleanType(cell(row, "type"), opts.typeValueMap);
    } else if (opts.deriveTypeFromSign) {
      const signSource = qtyRaw !== 0 ? qtyRaw : valueRaw ?? 0;
      type = signSource < 0 ? "sell" : "buy";
    } else {
      type = "UNKNOWN";
    }

    // CSV imports are "bring your own P&L". The primary USD figure (Proceeds, else the
    // net Amount) becomes value_usd; how it converts to gain/loss depends on category:
    //   • deposit / withdrawal   -> $0 (internal money movement)
    //   • income / staking       -> ordinary income (is_income), $0 capital gain
    //   • proceeds + cost basis   -> normal P&L (proceeds - cost basis), like the engine
    //   • otherwise (net mode)   -> the signed Amount USD IS the realized gain/loss
    // Uses the SIGNED figures, never the abs'd value_usd. The engine does not recompute
    // CSV imports.
    const rowCategory = getCategory(type);
    const isMovement = rowCategory === "deposit" || rowCategory === "withdrawal";
    const isIncome = rowCategory === "income" || rowCategory === "staking";
    const proceedsNum = proceedsRaw ?? valueRaw; // primary signed USD figure
    let gainLoss: number;
    if (isMovement || isIncome) {
      gainLoss = 0;
    } else if (costRaw != null) {
      gainLoss = (proceedsNum ?? 0) - costRaw; // proceeds + cost basis -> normal P&L
    } else {
      gainLoss = proceedsNum ?? 0; // net-P&L mode: signed amount is the gain/loss
    }

    // (source_type "csv_import" is set by the API layer on DB insert, not here —
    // it isn't part of ParsedTransaction.)
    const tx: ParsedTransaction = {
      type,
      asset_symbol: symbol,
      amount_value: new Decimal(Math.abs(qtyRaw)),
      value_usd: new Decimal(Math.abs(proceedsNum ?? 0)),
      gain_loss_usd: new Decimal(gainLoss),
      is_income: isIncome,
      tx_timestamp: ts,
    };
    if (feeRaw != null) tx.fee_usd = new Decimal(Math.abs(feeRaw));
    if (costRaw != null && !isMovement && !isIncome) {
      tx.cost_basis_usd = new Decimal(Math.abs(costRaw));
    }

    // Optional incoming (two-sided trade) leg.
    const inSym = cleanSymbol(cell(row, "incomingSymbol"));
    const inQty = cleanNumber(cell(row, "incomingQuantity"));
    const inVal = cleanNumber(cell(row, "incomingValue"));
    if (inSym) tx.incoming_asset_symbol = inSym;
    if (inQty != null) tx.incoming_amount_value = new Decimal(Math.abs(inQty));
    if (inVal != null) tx.incoming_value_usd = new Decimal(Math.abs(inVal));

    transactions.push(tx);
  }

  return { transactions, skipped };
}
