import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, PDFForm, PDFTextField, PDFCheckBox, PDFField } from "pdf-lib";
import * as fs from "fs";
import * as path from "path";
import prisma from "@/lib/prisma";
import { calculateTaxReport, TaxReport, TaxableEvent, IncomeEvent } from "@/lib/tax-calculator";
import { getCurrentUser } from "@/lib/auth-helpers";
import { rateLimitAPI, createRateLimitResponse, rateLimitByUser } from "@/lib/rate-limit";
import * as Sentry from "@sentry/nextjs";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Number of data rows per page on Form 8949 */
const ROWS_PER_PAGE = 11;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Format a Date as MM/DD/YYYY (IRS standard).
 */
function formatDate(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const y = date.getFullYear();
  return `${m}/${d}/${y}`;
}

/**
 * Format a number for IRS forms: no dollar sign, two decimals, negative in
 * parentheses. e.g. 1234.56 -> "1,234.56", -500 -> "(500.00)"
 */
function formatCurrency(amount: number): string {
  const abs = Math.abs(amount);
  const formatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(abs);
  return amount < 0 ? `(${formatted})` : formatted;
}

/**
 * Robustly look up a form field by its short name (e.g. "f1_03[0]").
 *
 * IRS fillable PDFs are XFA/AcroForm hybrids. pdf-lib strips XFA on load,
 * leaving AcroForm fields whose fully-qualified names may or may not contain
 * the XFA path prefix. We first try an exact lookup, then fall back to
 * iterating all fields to find one whose name *ends with* the target.
 */
function findField(form: PDFForm, shortName: string): PDFField | undefined {
  try {
    return form.getField(shortName);
  } catch {
    // Exact name not found -- search by suffix
  }

  const allFields = form.getFields();
  return allFields.find((f) => {
    const n = f.getName();
    return n === shortName || n.endsWith(`.${shortName}`) || n.includes(shortName);
  });
}

/**
 * Safely set a text field value. No-ops if the field is not found or is not
 * a text field.
 */
function setTextField(form: PDFForm, shortName: string, value: string): void {
  const field = findField(form, shortName);
  if (field && field instanceof PDFTextField) {
    field.setText(value);
  }
}

/**
 * Safely check a checkbox. No-ops if the field is not found or is not a
 * checkbox.
 */
function checkCheckbox(form: PDFForm, shortName: string): void {
  const field = findField(form, shortName);
  if (field && field instanceof PDFCheckBox) {
    field.check();
  }
}

// ---------------------------------------------------------------------------
// Form 8949 generation
// ---------------------------------------------------------------------------

/**
 * Build a single filled Form 8949 page-pair (Page 1 = short-term, Page 2 =
 * long-term) from the template. Returns a PDFDocument with exactly two pages.
 *
 * `shortTermRows` and `longTermRows` must each have <= ROWS_PER_PAGE entries.
 */
async function buildForm8949Sheet(
  templateBytes: Uint8Array,
  shortTermRows: TaxableEvent[],
  longTermRows: TaxableEvent[],
  taxpayerName?: string,
  ssn?: string,
  shortTermTotals?: { proceeds: number; costBasis: number; gainLoss: number },
  longTermTotals?: { proceeds: number; costBasis: number; gainLoss: number },
  shortCheckbox?: string,
  longCheckbox?: string,
): Promise<PDFDocument> {
  const doc = await PDFDocument.load(templateBytes, { ignoreEncryption: true });
  const form = doc.getForm();

  // ---- Page 1: Part I (Short-term) ----

  if (taxpayerName) setTextField(form, "f1_01[0]", taxpayerName);
  if (ssn) setTextField(form, "f1_02[0]", ssn);

  // Check the correct box based on source type (default: Box I = DeFi/blockchain)
  checkCheckbox(form, shortCheckbox || "c1_1[5]");

  // Fill short-term rows
  for (let i = 0; i < shortTermRows.length && i < ROWS_PER_PAGE; i++) {
    const evt = shortTermRows[i];
    const baseIdx = 3 + i * 8; // Row 1 starts at f1_03

    const pad = (n: number) => String(n).padStart(2, "0");

    // (a) Description of property
    const desc = `${evt.amount} ${evt.asset}`;
    setTextField(form, `f1_${pad(baseIdx)}[0]`, desc);

    // (b) Date acquired
    if (evt.dateAcquired) {
      setTextField(form, `f1_${pad(baseIdx + 1)}[0]`, formatDate(evt.dateAcquired));
    } else {
      setTextField(form, `f1_${pad(baseIdx + 1)}[0]`, "Various");
    }

    // (c) Date sold or disposed of
    setTextField(form, `f1_${pad(baseIdx + 2)}[0]`, formatDate(evt.date));

    // (d) Proceeds
    setTextField(form, `f1_${pad(baseIdx + 3)}[0]`, formatCurrency(evt.proceeds));

    // (e) Cost or other basis
    setTextField(form, `f1_${pad(baseIdx + 4)}[0]`, formatCurrency(evt.costBasis));

    // (f) Code – wash sale = "W", otherwise blank
    const code = evt.washSale ? "W" : "";
    setTextField(form, `f1_${pad(baseIdx + 5)}[0]`, code);

    // (g) Adjustment to gain or loss
    const adjustment = evt.washSale && evt.washSaleAdjustment
      ? formatCurrency(evt.washSaleAdjustment)
      : "";
    setTextField(form, `f1_${pad(baseIdx + 6)}[0]`, adjustment);

    // (h) Gain or (loss)
    setTextField(form, `f1_${pad(baseIdx + 7)}[0]`, formatCurrency(evt.gainLoss));
  }

  // Totals for Part I (fields f1_91 through f1_94)
  if (shortTermTotals) {
    setTextField(form, "f1_91[0]", formatCurrency(shortTermTotals.proceeds));
    setTextField(form, "f1_92[0]", formatCurrency(shortTermTotals.costBasis));
    // f1_93 = total adjustments (skip or zero)
    setTextField(form, "f1_94[0]", formatCurrency(shortTermTotals.gainLoss));
  }

  // ---- Page 2: Part II (Long-term) ----

  // Name and SSN on page 2
  if (taxpayerName) setTextField(form, "f2_01[0]", taxpayerName);
  if (ssn) setTextField(form, "f2_02[0]", ssn);

  // Check the correct box based on source type (default: Box L = DeFi/blockchain)
  checkCheckbox(form, longCheckbox || "c2_1[5]");

  // Fill long-term rows
  for (let i = 0; i < longTermRows.length && i < ROWS_PER_PAGE; i++) {
    const evt = longTermRows[i];
    const baseIdx = 3 + i * 8;

    const pad = (n: number) => String(n).padStart(2, "0");

    const desc = `${evt.amount} ${evt.asset}`;
    setTextField(form, `f2_${pad(baseIdx)}[0]`, desc);

    if (evt.dateAcquired) {
      setTextField(form, `f2_${pad(baseIdx + 1)}[0]`, formatDate(evt.dateAcquired));
    } else {
      setTextField(form, `f2_${pad(baseIdx + 1)}[0]`, "Various");
    }

    setTextField(form, `f2_${pad(baseIdx + 2)}[0]`, formatDate(evt.date));
    setTextField(form, `f2_${pad(baseIdx + 3)}[0]`, formatCurrency(evt.proceeds));
    setTextField(form, `f2_${pad(baseIdx + 4)}[0]`, formatCurrency(evt.costBasis));

    const code = evt.washSale ? "W" : "";
    setTextField(form, `f2_${pad(baseIdx + 5)}[0]`, code);

    const adjustment = evt.washSale && evt.washSaleAdjustment
      ? formatCurrency(evt.washSaleAdjustment)
      : "";
    setTextField(form, `f2_${pad(baseIdx + 6)}[0]`, adjustment);

    setTextField(form, `f2_${pad(baseIdx + 7)}[0]`, formatCurrency(evt.gainLoss));
  }

  // Totals for Part II (fields f2_91 through f2_94)
  if (longTermTotals) {
    setTextField(form, "f2_91[0]", formatCurrency(longTermTotals.proceeds));
    setTextField(form, "f2_92[0]", formatCurrency(longTermTotals.costBasis));
    setTextField(form, "f2_94[0]", formatCurrency(longTermTotals.gainLoss));
  }

  // Flatten so fields are no longer editable
  form.flatten();

  return doc;
}

/**
 * Generate a complete Form 8949 PDF (with continuation sheets when there are
 * more than 11 rows per holding period).
 */
/** Known centralized exchange sources */
const EXCHANGE_SOURCES = new Set([
  "coinbase", "binance", "kraken", "gemini", "kucoin", "bybit", "okx",
  "robinhood", "crypto.com", "ftx", "bitfinex", "bitstamp", "huobi",
]);

/** Determine if a taxable event is from a centralized exchange */
function isExchangeSource(source?: string): boolean {
  if (!source) return false;
  return EXCHANGE_SOURCES.has(source.toLowerCase());
}

/**
 * Check the correct Form 8949 box based on holding period and source.
 * Page 1 (Short-term): A=c1_1[0], B=c1_1[1], C=c1_1[2], G=c1_1[3], H=c1_1[4], I=c1_1[5]
 * Page 2 (Long-term):  D=c2_1[0], E=c2_1[1], F=c2_1[2], J=c2_1[3], K=c2_1[4], L=c2_1[5]
 *
 * Short-term + exchange = Box H (c1_1[4])
 * Short-term + DeFi/blockchain = Box I (c1_1[5])
 * Long-term + exchange = Box K (c2_1[4])
 * Long-term + DeFi/blockchain = Box L (c2_1[5])
 */
function getCheckboxForEvents(events: TaxableEvent[]): { shortBox: string; longBox: string } {
  const hasExchangeST = events.some(e => e.holdingPeriod === "short" && isExchangeSource(e.source));
  const hasExchangeLT = events.some(e => e.holdingPeriod === "long" && isExchangeSource(e.source));

  return {
    shortBox: hasExchangeST ? "c1_1[4]" : "c1_1[5]", // H (exchange) or I (DeFi)
    longBox: hasExchangeLT ? "c2_1[4]" : "c2_1[5]",   // K (exchange) or L (DeFi)
  };
}

async function generateForm8949(
  report: TaxReport,
  taxpayerName?: string,
  ssn?: string,
): Promise<Uint8Array> {
  const templatePath = path.join(process.cwd(), "public", "forms", "f8949.pdf");
  const templateBytes = new Uint8Array(fs.readFileSync(templatePath));

  // Use detailed (non-aggregated) events sorted by date
  const allEvents = [...report.taxableEvents].sort((a, b) => a.date.getTime() - b.date.getTime());

  // Separate into short-term and long-term
  const shortTerm = allEvents.filter((e) => e.holdingPeriod === "short");
  const longTerm = allEvents.filter((e) => e.holdingPeriod === "long");

  // Compute totals per holding period
  const sumTotals = (events: TaxableEvent[]) => ({
    proceeds: events.reduce((s, e) => s + e.proceeds, 0),
    costBasis: events.reduce((s, e) => s + e.costBasis, 0),
    gainLoss: events.reduce((s, e) => s + e.gainLoss, 0),
  });

  const shortTermTotals = sumTotals(shortTerm);
  const longTermTotals = sumTotals(longTerm);

  // Determine correct checkboxes based on source
  const { shortBox, longBox } = getCheckboxForEvents(allEvents);

  // Split into pages of ROWS_PER_PAGE
  const shortTermPages: TaxableEvent[][] = [];
  for (let i = 0; i < shortTerm.length; i += ROWS_PER_PAGE) {
    shortTermPages.push(shortTerm.slice(i, i + ROWS_PER_PAGE));
  }
  if (shortTermPages.length === 0) shortTermPages.push([]);

  const longTermPages: TaxableEvent[][] = [];
  for (let i = 0; i < longTerm.length; i += ROWS_PER_PAGE) {
    longTermPages.push(longTerm.slice(i, i + ROWS_PER_PAGE));
  }
  if (longTermPages.length === 0) longTermPages.push([]);

  // Determine total number of sheets we need (max of the two)
  const sheetCount = Math.max(shortTermPages.length, longTermPages.length);

  // Build all sheets
  const sheets: PDFDocument[] = [];
  for (let s = 0; s < sheetCount; s++) {
    const stRows = shortTermPages[s] || [];
    const ltRows = longTermPages[s] || [];

    // Only put totals on the last sheet that has rows for that category
    const isLastST = s === shortTermPages.length - 1;
    const isLastLT = s === longTermPages.length - 1;

    const sheet = await buildForm8949Sheet(
      templateBytes,
      stRows,
      ltRows,
      taxpayerName,
      ssn,
      isLastST ? shortTermTotals : undefined,
      isLastLT ? longTermTotals : undefined,
      shortBox,
      longBox,
    );
    sheets.push(sheet);
  }

  // If only one sheet, return it directly
  if (sheets.length === 1) {
    return sheets[0].save();
  }

  // Merge all sheets into one PDF
  const merged = await PDFDocument.create();
  for (const sheet of sheets) {
    const sheetBytes = await sheet.save();
    const donor = await PDFDocument.load(sheetBytes);
    const pages = await merged.copyPages(donor, donor.getPageIndices());
    for (const page of pages) {
      merged.addPage(page);
    }
  }

  return merged.save();
}

// ---------------------------------------------------------------------------
// Schedule 1 generation
// ---------------------------------------------------------------------------

async function generateSchedule1(
  report: TaxReport,
  taxpayerName?: string,
  ssn?: string,
): Promise<Uint8Array> {
  const templatePath = path.join(process.cwd(), "public", "forms", "f1040s1.pdf");
  const templateBytes = new Uint8Array(fs.readFileSync(templatePath));

  const doc = await PDFDocument.load(templateBytes, { ignoreEncryption: true });
  const form = doc.getForm();

  // Name and SSN (if the form has these fields)
  if (taxpayerName) setTextField(form, "f1_01[0]", taxpayerName);
  if (ssn) setTextField(form, "f1_02[0]", ssn);

  const totalIncome = report.totalIncome;

  // Line 8z description
  setTextField(form, "f1_35[0]", "Cryptocurrency income");

  // Line 8z amount
  setTextField(form, "f1_36[0]", formatCurrency(totalIncome));

  // Line 9 – Total other income (same value if crypto is the only other income)
  setTextField(form, "f1_37[0]", formatCurrency(totalIncome));

  // Line 10 – Total additional income
  setTextField(form, "f1_38[0]", formatCurrency(totalIncome));

  form.flatten();
  return doc.save();
}

// ---------------------------------------------------------------------------
// Schedule D generation
// ---------------------------------------------------------------------------

async function generateScheduleD(
  report: TaxReport,
  taxpayerName?: string,
  ssn?: string,
): Promise<Uint8Array> {
  const templatePath = path.join(process.cwd(), "public", "forms", "f1040sd.pdf");
  const templateBytes = new Uint8Array(fs.readFileSync(templatePath));

  const doc = await PDFDocument.load(templateBytes, { ignoreEncryption: true });
  const form = doc.getForm();

  // Header
  if (taxpayerName) setTextField(form, "f1_1[0]", taxpayerName);
  if (ssn) setTextField(form, "f1_2[0]", ssn);

  // Checkbox: "Did you dispose of any investments?" — Yes
  checkCheckbox(form, "c1_1[0]");

  // ---- Part I: Short-Term ----
  // Line 1a (Form 8949 Box A totals): proceeds, cost, adjustments, gain/loss
  const stEvents = report.taxableEvents.filter((e) => e.holdingPeriod === "short");
  const stProceeds = stEvents.reduce((s, e) => s + e.proceeds, 0);
  const stCostBasis = stEvents.reduce((s, e) => s + e.costBasis, 0);
  const stGainLoss = stEvents.reduce((s, e) => s + e.gainLoss, 0);

  setTextField(form, "f1_3[0]", formatCurrency(stProceeds));
  setTextField(form, "f1_4[0]", formatCurrency(stCostBasis));
  // f1_5 = adjustments (skip)
  setTextField(form, "f1_6[0]", formatCurrency(stGainLoss));

  // Line 7: Net short-term capital gain or loss
  setTextField(form, "f1_22[0]", formatCurrency(report.netShortTermGain));

  // ---- Part II: Long-Term ----
  // Line 8a (Form 8949 Box D totals)
  const ltEvents = report.taxableEvents.filter((e) => e.holdingPeriod === "long");
  const ltProceeds = ltEvents.reduce((s, e) => s + e.proceeds, 0);
  const ltCostBasis = ltEvents.reduce((s, e) => s + e.costBasis, 0);
  const ltGainLoss = ltEvents.reduce((s, e) => s + e.gainLoss, 0);

  setTextField(form, "f1_23[0]", formatCurrency(ltProceeds));
  setTextField(form, "f1_24[0]", formatCurrency(ltCostBasis));
  // f1_25 = adjustments (skip)
  setTextField(form, "f1_26[0]", formatCurrency(ltGainLoss));

  // Line 15: Net long-term capital gain or loss
  setTextField(form, "f1_43[0]", formatCurrency(report.netLongTermGain));

  // ---- Part III: Summary (Page 2) ----
  // Line 16: Combine lines 7 and 15
  const combined = report.netShortTermGain + report.netLongTermGain;
  setTextField(form, "f2_1[0]", formatCurrency(combined));

  // Line 21: If loss, capital loss deduction (max $3,000)
  if (combined < 0) {
    const deductible = Math.max(combined, -3000);
    setTextField(form, "f2_4[0]", formatCurrency(deductible));
  }

  form.flatten();
  return doc.save();
}

// ---------------------------------------------------------------------------
// API Route Handler
// ---------------------------------------------------------------------------

/**
 * GET /api/tax-reports/pdf?year=2024&form=8949
 * GET /api/tax-reports/pdf?year=2024&form=scheduled
 * GET /api/tax-reports/pdf?year=2024&form=schedule1
 *
 * Generates a fillable IRS PDF for Form 8949, Schedule D, or Schedule 1
 * using pdf-lib, populated with the user's tax data for the requested year.
 */
export async function GET(request: NextRequest) {
  try {
    // Rate limiting
    const rateLimitResult = rateLimitAPI(request, 10); // 10 PDFs per minute
    if (!rateLimitResult.success) {
      return createRateLimitResponse(
        rateLimitResult.remaining,
        rateLimitResult.reset,
      );
    }

    const searchParams = request.nextUrl.searchParams;

    // ---- Validate params ----
    const yearStr = searchParams.get("year") || new Date().getFullYear().toString();
    const year = parseInt(yearStr, 10);
    if (isNaN(year) || year < 2000 || year > 2100) {
      return NextResponse.json(
        { error: "Invalid year parameter" },
        { status: 400 },
      );
    }

    const formParam = (searchParams.get("form") || "").toLowerCase();
    if (formParam !== "8949" && formParam !== "schedule1" && formParam !== "scheduled") {
      return NextResponse.json(
        { error: "Invalid form parameter. Must be '8949', 'schedule1', or 'scheduled'." },
        { status: 400 },
      );
    }

    // ---- Authenticate ----
    let user;
    try {
      user = await getCurrentUser(request);
    } catch (authError) {
      console.error("[Tax PDF API] Auth error:", authError);
      const errorMessage = authError instanceof Error ? authError.message : "Unknown error";
      if (errorMessage.includes("Can't reach database") || errorMessage.includes("P1001")) {
        return NextResponse.json(
          { error: "Database connection failed", details: "Please check your database connection." },
          { status: 503 },
        );
      }
      return NextResponse.json(
        { error: "Authentication failed", details: errorMessage },
        { status: 401 },
      );
    }

    if (!user) {
      return NextResponse.json(
        { error: "Not authenticated", details: "Please log in to generate tax reports." },
        { status: 401 },
      );
    }

    // Per-user rate limiting
    const userRateLimit = rateLimitByUser(user.id, 5); // 5 PDF downloads per minute per user
    if (!userRateLimit.success) {
      return createRateLimitResponse(
        userRateLimit.remaining,
        userRateLimit.reset,
      );
    }

    // ---- Fetch user + wallets ----
    const userWithWallets = await prisma.user.findUnique({
      where: { id: user.id },
      include: { wallets: true },
    });

    if (!userWithWallets) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const walletAddresses = userWithWallets.wallets.map((w) => w.address);

    const filingStatus = (searchParams.get("filingStatus") || "single") as
      | "single"
      | "married_joint"
      | "married_separate"
      | "head_of_household";

    const costBasisMethod = (userWithWallets.costBasisMethod || "FIFO") as
      | "FIFO"
      | "LIFO"
      | "HIFO";

    const userTimezone = userWithWallets.timezone || "America/New_York";

    // ---- Calculate tax report ----
    console.log(`[Tax PDF API] Generating ${formParam} for year ${year}, user ${user.id}`);

    const userCountry = userWithWallets.country || "US";

    const report = await calculateTaxReport(
      prisma,
      walletAddresses,
      year,
      costBasisMethod,
      user.id,
      filingStatus,
      userTimezone,
      userCountry,
    );

    // Optional taxpayer identity fields (name from user profile, SSN from query)
    const taxpayerName = searchParams.get("name") || user.name || undefined;
    const ssn = searchParams.get("ssn") || undefined;

    // ---- Generate the PDF ----
    let pdfBytes: Uint8Array;
    let filename: string;

    if (formParam === "8949") {
      pdfBytes = await generateForm8949(report, taxpayerName, ssn);
      filename = `Form8949-${year}.pdf`;
    } else if (formParam === "scheduled") {
      pdfBytes = await generateScheduleD(report, taxpayerName, ssn);
      filename = `ScheduleD-${year}.pdf`;
    } else {
      pdfBytes = await generateSchedule1(report, taxpayerName, ssn);
      filename = `Schedule1-${year}.pdf`;
    }

    console.log(`[Tax PDF API] Generated ${filename} (${pdfBytes.length} bytes)`);

    return new NextResponse(pdfBytes, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": pdfBytes.length.toString(),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[Tax PDF API] Error:", error);

    Sentry.captureException(error, {
      tags: { endpoint: "/api/tax-reports/pdf" },
    });

    return NextResponse.json(
      {
        error: "Failed to generate PDF",
        details: process.env.NODE_ENV === "development" ? (error instanceof Error ? error.message : "Unknown error") : "An internal error occurred",
      },
      { status: 500 },
    );
  }
}
