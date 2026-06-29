/**
 * Securities CSV Parser
 *
 * Parses the universal securities CSV template into structured transaction objects.
 * Uses the same parseDecimal / parseDate / findColumnIndex patterns as csv-parser.ts.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ParsedSecuritiesTransaction {
  date: Date;
  type: string;
  symbol: string;
  assetClass: string;
  quantity: number;
  price: number;
  fees: number;
  account?: string;
  accountType: string;
  totalAmount?: number;
  lotId?: string;
  /** Original acquisition date for TRANSFER_IN lots (preserves holding-period carryover). */
  originalAcquisitionDate?: Date;
  underlyingSymbol?: string;
  optionType?: string;
  strikePrice?: number;
  expirationDate?: Date;
  dividendType?: string;
  isCovered: boolean;
  isSection1256: boolean;
  notes?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_TYPES = new Set([
  "BUY",
  "SELL",
  "SELL_SHORT",
  "BUY_TO_COVER",
  "DIVIDEND",
  "DIVIDEND_REINVEST",
  "INTEREST",
  "SPLIT",
  "MERGER",
  "SPINOFF",
  "RETURN_OF_CAPITAL",
  "OPTION_EXERCISE",
  "OPTION_ASSIGNMENT",
  "OPTION_EXPIRATION",
  "RSU_VEST",
  "ESPP_PURCHASE",
  "TRANSFER_IN",
  "TRANSFER_OUT",
  "YEAR_END_FMV",
]);

const VALID_ASSET_CLASSES = new Set([
  "STOCK",
  "ETF",
  "MUTUAL_FUND",
  "OPTION",
  "FUTURE",
  "FOREX",
  "BOND",
  "WARRANT",
]);

const VALID_ACCOUNT_TYPES = new Set([
  "TAXABLE",
  "IRA_TRADITIONAL",
  "IRA_ROTH",
  "401K",
  "HSA",
  "529",
]);

const VALID_OPTION_TYPES = new Set(["CALL", "PUT"]);

const VALID_DIVIDEND_TYPES = new Set([
  "QUALIFIED",
  "ORDINARY",
  "RETURN_OF_CAPITAL",
  "CAP_GAIN_DISTRIBUTION",
]);

// ---------------------------------------------------------------------------
// Helpers – ported from csv-parser.ts ExchangeCSVParser
// ---------------------------------------------------------------------------

function findColumnIndex(headers: string[], possibleNames: string[]): number {
  const normalize = (str: string) => {
    if (!str) return "";
    return str
      .toLowerCase()
      .trim()
      .replace(/\s+/g, " ")
      .replace(/[.,()]/g, "")
      .replace(/\s*\([^)]*\)\s*/g, "")
      .trim();
  };

  const normalizedHeaders = headers.map((h) => normalize(h));
  for (const name of possibleNames) {
    const normalizedName = normalize(name);
    let index = normalizedHeaders.findIndex((h) => h === normalizedName);
    if (index !== -1) return index;

    index = normalizedHeaders.findIndex(
      (h) => h.includes(normalizedName) || normalizedName.includes(h),
    );
    if (index !== -1) return index;

    const nameParts = normalizedName.split(/\s+/);
    if (nameParts.length > 1) {
      index = normalizedHeaders.findIndex(
        (h) =>
          nameParts.every((part) => h.includes(part)) ||
          h.split(/\s+/).every((part) => normalizedName.includes(part)),
      );
      if (index !== -1) return index;
    }
  }
  return -1;
}

function parseDecimal(value: string): number | null {
  if (!value || !value.trim()) return null;
  let cleaned = value.trim().replace(/[$,\s]/g, "");
  if (cleaned.match(/^0+[1-9]/)) {
    cleaned = cleaned.replace(/^0+/, "");
  }
  const num = parseFloat(cleaned);
  if (isNaN(num)) {
    const fallback = cleaned.replace(/[^0-9.-]/g, "");
    const fallbackNum = parseFloat(fallback);
    return isNaN(fallbackNum) ? null : fallbackNum;
  }
  return num;
}

/**
 * Parse a date to a TIMEZONE-STABLE calendar date at UTC midnight.
 *
 * All paths use Date.UTC so the stored @db.Date is identical regardless of the
 * server timezone (previously ISO strings parsed as UTC midnight while slash dates
 * parsed as LOCAL midnight, shifting the calendar day — and thus the tax year and
 * the long/short-term boundary — on non-UTC servers). Components are range-checked
 * and round-tripped, so out-of-range / day-first-invalid dates (e.g. 13/05/2023)
 * are REJECTED (returned null) instead of silently overflowing into another month.
 * Downstream consumers must read the year with getUTCFullYear().
 *
 * Slash/dash dates are interpreted as US MM/DD/YYYY.
 */
function parseDate(dateStr: string): Date | null {
  if (!dateStr || !dateStr.trim()) return null;
  const cleaned = dateStr.trim().replace(/\s*\([^)]*\)\s*$/i, "");

  // Build a UTC-midnight date, validating ranges and rejecting overflow.
  const mkUTC = (y: number, m: number, d: number): Date | null => {
    if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    const dt = new Date(Date.UTC(y, m - 1, d));
    // Reject overflow (e.g. Feb 30 -> Mar 2, or month/day out of range for the month).
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
      return null;
    }
    return dt;
  };

  // ISO 8601 (optionally with a time component) — take the date part only.
  let m = cleaned.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return mkUTC(+m[1], +m[2], +m[3]);

  // US slash/dash: MM/DD/YYYY or MM-DD-YYYY.
  m = cleaned.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (m) return mkUTC(+m[3], +m[1], +m[2]);

  return null;
}

const TRUE_TOKENS = ["true", "t", "yes", "y", "1", "x", "checked"];
const FALSE_TOKENS = ["false", "f", "no", "n", "0"];

function parseBool(value: string, defaultValue: boolean): boolean {
  if (!value || !value.trim()) return defaultValue;
  const v = value.trim().toLowerCase();
  if (TRUE_TOKENS.includes(v)) return true;
  if (FALSE_TOKENS.includes(v)) return false;
  return defaultValue;
}

/** Whether a non-empty string is a recognized boolean token (for warning on the rest). */
function isRecognizedBool(value: string): boolean {
  const v = value.trim().toLowerCase();
  return TRUE_TOKENS.includes(v) || FALSE_TOKENS.includes(v);
}

// ---------------------------------------------------------------------------
// CSV line-level parser (same algorithm as csv-parser.ts parseCSV)
// ---------------------------------------------------------------------------

function parseCSVLines(content: string): string[][] {
  const lines: string[] = [];
  let currentLine = "";
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const nextChar = content[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentLine += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "\n" && !inQuotes) {
      lines.push(currentLine);
      currentLine = "";
    } else if (char === "\r" && nextChar === "\n" && !inQuotes) {
      lines.push(currentLine);
      currentLine = "";
      i++;
    } else {
      currentLine += char;
    }
  }
  if (currentLine) lines.push(currentLine);

  return lines.map((line) => {
    const columns: string[] = [];
    let currentColumn = "";
    let inQ = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];

      if (char === '"') {
        if (inQ && nextChar === '"') {
          currentColumn += '"';
          i++;
        } else {
          inQ = !inQ;
        }
      } else if (char === "," && !inQ) {
        columns.push(currentColumn.trim());
        currentColumn = "";
      } else {
        currentColumn += char;
      }
    }
    columns.push(currentColumn.trim());
    return columns;
  });
}

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------

export function parseSecuritiesCSV(csvText: string): {
  transactions: ParsedSecuritiesTransaction[];
  errors: string[];
  warnings: string[];
} {
  const transactions: ParsedSecuritiesTransaction[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  const rows = parseCSVLines(csvText);
  if (rows.length < 2) {
    errors.push("CSV must contain a header row and at least one data row.");
    return { transactions, errors, warnings };
  }

  const headers = rows[0];

  // Locate required columns
  const dateIdx = findColumnIndex(headers, ["date", "trade_date", "trade date"]);
  const typeIdx = findColumnIndex(headers, ["type", "transaction_type", "transaction type", "action"]);
  const symbolIdx = findColumnIndex(headers, ["symbol", "ticker", "asset"]);
  const assetClassIdx = findColumnIndex(headers, ["asset_class", "asset class", "security_type", "security type"]);
  // NOTE: "amount" is intentionally NOT a quantity synonym — a dollar "Amount"
  // column must never bind to share quantity (it would corrupt qty*price basis/proceeds).
  const quantityIdx = findColumnIndex(headers, ["quantity", "qty", "shares"]);
  const priceIdx = findColumnIndex(headers, ["price", "price_per_share", "price per share", "unit_price"]);

  if (dateIdx === -1) errors.push("Missing required column: date");
  if (typeIdx === -1) errors.push("Missing required column: type");
  if (symbolIdx === -1) errors.push("Missing required column: symbol");
  if (assetClassIdx === -1) errors.push("Missing required column: asset_class");
  if (quantityIdx === -1) errors.push("Missing required column: quantity");
  if (priceIdx === -1) errors.push("Missing required column: price");

  if (errors.length > 0) return { transactions, errors, warnings };

  // Locate optional columns
  const feesIdx = findColumnIndex(headers, ["fees", "fee", "commission", "commissions"]);
  const accountIdx = findColumnIndex(headers, ["account", "brokerage", "account_name"]);
  const accountTypeIdx = findColumnIndex(headers, ["account_type", "account type", "acct_type"]);
  const totalAmountIdx = findColumnIndex(headers, ["total_amount", "total amount", "total", "proceeds"]);
  const lotIdIdx = findColumnIndex(headers, ["lot_id", "lot id", "specific_lot"]);
  const acqDateIdx = findColumnIndex(headers, ["acquisition_date", "original_acquisition_date", "date_acquired", "acquired"]);
  const underlyingIdx = findColumnIndex(headers, ["underlying_symbol", "underlying symbol", "underlying"]);
  const optionTypeIdx = findColumnIndex(headers, ["option_type", "option type", "put_call"]);
  const strikePriceIdx = findColumnIndex(headers, ["strike_price", "strike price", "strike"]);
  const expirationIdx = findColumnIndex(headers, ["expiration_date", "expiration date", "expiration", "exp_date"]);
  const dividendTypeIdx = findColumnIndex(headers, ["dividend_type", "dividend type", "div_type"]);
  const isCoveredIdx = findColumnIndex(headers, ["is_covered", "covered"]);
  const isSection1256Idx = findColumnIndex(headers, ["is_section_1256", "section_1256", "section 1256"]);
  const notesIdx = findColumnIndex(headers, ["notes", "memo", "description"]);

  for (let rowIdx = 1; rowIdx < rows.length; rowIdx++) {
    const row = rows[rowIdx];
    // Skip blank rows
    if (row.every((cell) => !cell.trim())) continue;

    const rowNum = rowIdx + 1; // 1-based for user-facing messages
    const get = (idx: number) => (idx >= 0 && idx < row.length ? row[idx] : "");

    // --- Required fields ---
    const dateVal = parseDate(get(dateIdx));
    if (!dateVal) {
      errors.push(`Row ${rowNum}: Invalid or missing date.`);
      continue;
    }

    const typeVal = get(typeIdx).trim().toUpperCase();
    if (!VALID_TYPES.has(typeVal)) {
      errors.push(`Row ${rowNum}: Invalid type "${get(typeIdx)}". Must be one of: ${[...VALID_TYPES].join(", ")}`);
      continue;
    }

    const symbolVal = get(symbolIdx).trim().toUpperCase();
    if (!symbolVal) {
      errors.push(`Row ${rowNum}: Missing symbol.`);
      continue;
    }

    const assetClassVal = get(assetClassIdx).trim().toUpperCase();
    if (!VALID_ASSET_CLASSES.has(assetClassVal)) {
      errors.push(`Row ${rowNum}: Invalid asset_class "${get(assetClassIdx)}". Must be one of: ${[...VALID_ASSET_CLASSES].join(", ")}`);
      continue;
    }

    const quantityVal = parseDecimal(get(quantityIdx));
    if (quantityVal === null || quantityVal < 0) {
      errors.push(`Row ${rowNum}: Invalid or missing quantity.`);
      continue;
    }

    const priceVal = parseDecimal(get(priceIdx));
    if (priceVal === null || priceVal < 0) {
      errors.push(`Row ${rowNum}: Invalid or missing price.`);
      continue;
    }

    // --- Optional fields ---
    const feesVal = feesIdx >= 0 ? parseDecimal(get(feesIdx)) ?? 0 : 0;

    const accountVal = accountIdx >= 0 ? get(accountIdx).trim() || undefined : undefined;

    const accountTypeVal = accountTypeIdx >= 0 ? get(accountTypeIdx).trim().toUpperCase() : "TAXABLE";
    if (accountTypeVal && !VALID_ACCOUNT_TYPES.has(accountTypeVal)) {
      warnings.push(`Row ${rowNum}: Unknown account_type "${get(accountTypeIdx)}", defaulting to TAXABLE.`);
    }

    const totalAmountVal = totalAmountIdx >= 0 ? parseDecimal(get(totalAmountIdx)) ?? undefined : undefined;

    const lotIdVal = lotIdIdx >= 0 ? get(lotIdIdx).trim() || undefined : undefined;

    const originalAcquisitionDateVal = acqDateIdx >= 0 ? parseDate(get(acqDateIdx)) ?? undefined : undefined;

    const underlyingVal = underlyingIdx >= 0 ? get(underlyingIdx).trim().toUpperCase() || undefined : undefined;

    const optionTypeRaw = optionTypeIdx >= 0 ? get(optionTypeIdx).trim().toUpperCase() : "";
    let optionTypeVal: string | undefined;
    if (optionTypeRaw) {
      if (VALID_OPTION_TYPES.has(optionTypeRaw)) {
        optionTypeVal = optionTypeRaw;
      } else {
        warnings.push(`Row ${rowNum}: Unknown option_type "${get(optionTypeIdx)}".`);
      }
    }

    const strikePriceVal = strikePriceIdx >= 0 ? parseDecimal(get(strikePriceIdx)) ?? undefined : undefined;

    const expirationVal = expirationIdx >= 0 ? parseDate(get(expirationIdx)) ?? undefined : undefined;

    const dividendTypeRaw = dividendTypeIdx >= 0 ? get(dividendTypeIdx).trim().toUpperCase() : "";
    let dividendTypeVal: string | undefined;
    if (dividendTypeRaw) {
      if (VALID_DIVIDEND_TYPES.has(dividendTypeRaw)) {
        dividendTypeVal = dividendTypeRaw;
      } else {
        warnings.push(`Row ${rowNum}: Unknown dividend_type "${get(dividendTypeIdx)}".`);
      }
    }

    const isCoveredVal = isCoveredIdx >= 0 ? parseBool(get(isCoveredIdx), true) : true;
    const section1256Raw = isSection1256Idx >= 0 ? get(isSection1256Idx).trim() : "";
    const isSection1256Val = parseBool(section1256Raw, false);
    if (section1256Raw && !isRecognizedBool(section1256Raw)) {
      warnings.push(`Row ${rowNum}: Unrecognized is_section_1256 value "${section1256Raw}", treating as false (no 60/40 treatment).`);
    }
    const notesVal = notesIdx >= 0 ? get(notesIdx).trim() || undefined : undefined;

    transactions.push({
      date: dateVal,
      type: typeVal,
      symbol: symbolVal,
      assetClass: assetClassVal,
      quantity: quantityVal,
      price: priceVal,
      fees: feesVal,
      account: accountVal,
      accountType: VALID_ACCOUNT_TYPES.has(accountTypeVal) ? accountTypeVal : "TAXABLE",
      totalAmount: totalAmountVal,
      lotId: lotIdVal,
      originalAcquisitionDate: originalAcquisitionDateVal,
      underlyingSymbol: underlyingVal,
      optionType: optionTypeVal,
      strikePrice: strikePriceVal,
      expirationDate: expirationVal,
      dividendType: dividendTypeVal,
      isCovered: isCoveredVal,
      isSection1256: isSection1256Val,
      notes: notesVal,
    });
  }

  if (transactions.length === 0 && errors.length === 0) {
    warnings.push("No valid transactions found in the CSV file.");
  }

  return { transactions, errors, warnings };
}
