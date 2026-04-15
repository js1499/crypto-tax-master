import { NextRequest, NextResponse } from "next/server";
import { PDFDocument } from "pdf-lib";
import * as fs from "fs";
import * as path from "path";
import prisma from "@/lib/prisma";
import { TaxReport, TaxableEvent, IncomeEvent } from "@/lib/tax-calculator";
import { getCurrentUser } from "@/lib/auth-helpers";
import { rateLimitAPI, createRateLimitResponse, rateLimitByUser } from "@/lib/rate-limit";
import * as Sentry from "@sentry/nextjs";
import { findField, setTextField, checkCheckbox, formatDate, formatCurrency } from "@/lib/pdf-helpers";
import { getUserPlan } from "@/lib/plan-limits";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Number of data rows per page on Form 8949 */
const ROWS_PER_PAGE = 11;

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

/**
 * Generate Form 8949.
 *
 * For small datasets (≤ 11 ST + 11 LT rows): fills individual rows on the form.
 * For large datasets: fills ONE summary page with totals and "See attached statement"
 * in the first row — standard IRS practice. The per-row detail is available via
 * the CSV export endpoint (TurboTax 1099-B format or Form 8949 CSV).
 *
 * This avoids the O(N) PDF template loads that made large forms take minutes.
 */
async function generateForm8949(
  report: TaxReport,
  taxpayerName?: string,
  ssn?: string,
): Promise<Uint8Array> {
  const templatePath = path.join(process.cwd(), "public", "forms", "f8949.pdf");
  const templateBytes = new Uint8Array(fs.readFileSync(templatePath));

  const allEvents = [...report.taxableEvents].sort((a, b) => a.date.getTime() - b.date.getTime());

  const shortTerm = allEvents.filter((e) => e.holdingPeriod === "short");
  const longTerm = allEvents.filter((e) => e.holdingPeriod === "long");

  const sumTotals = (events: TaxableEvent[]) => ({
    proceeds: events.reduce((s, e) => s + e.proceeds, 0),
    costBasis: events.reduce((s, e) => s + e.costBasis, 0),
    gainLoss: events.reduce((s, e) => s + e.gainLoss, 0),
  });

  const shortTermTotals = sumTotals(shortTerm);
  const longTermTotals = sumTotals(longTerm);

  const { shortBox, longBox } = getCheckboxForEvents(allEvents);

  // For small datasets, fill individual rows on a single sheet
  if (shortTerm.length <= ROWS_PER_PAGE && longTerm.length <= ROWS_PER_PAGE) {
    const sheet = await buildForm8949Sheet(
      templateBytes,
      shortTerm,
      longTerm,
      taxpayerName,
      ssn,
      shortTermTotals,
      longTermTotals,
      shortBox,
      longBox,
    );
    return sheet.save();
  }

  // For large datasets: aggregate by symbol, one row per asset
  // Each row: "X.XX BTC (N txns) — See attached", with per-symbol totals
  // If symbols exceed 11 rows, use continuation sheets

  type SymbolAgg = { symbol: string; count: number; proceeds: number; costBasis: number; gainLoss: number };

  const aggregateBySymbol = (events: TaxableEvent[]): SymbolAgg[] => {
    const map = new Map<string, SymbolAgg>();
    for (const e of events) {
      const existing = map.get(e.asset);
      if (existing) {
        existing.count++;
        existing.proceeds += e.proceeds;
        existing.costBasis += e.costBasis;
        existing.gainLoss += e.gainLoss;
      } else {
        map.set(e.asset, { symbol: e.asset, count: 1, proceeds: e.proceeds, costBasis: e.costBasis, gainLoss: e.gainLoss });
      }
    }
    // Sort by absolute gain/loss descending (most significant first)
    return Array.from(map.values()).sort((a, b) => Math.abs(b.gainLoss) - Math.abs(a.gainLoss));
  };

  const stSymbols = aggregateBySymbol(shortTerm);
  const ltSymbols = aggregateBySymbol(longTerm);

  // If aggregated symbols fit on one sheet, use a single page
  if (stSymbols.length <= ROWS_PER_PAGE && ltSymbols.length <= ROWS_PER_PAGE) {
    // Build symbol-level TaxableEvents for the sheet filler
    const toEvents = (syms: SymbolAgg[]): TaxableEvent[] => syms.map(s => ({
      id: 0,
      date: new Date(),
      asset: `${s.symbol} (${s.count} txns)`,
      amount: 0,
      proceeds: s.proceeds,
      costBasis: s.costBasis,
      gainLoss: s.gainLoss,
      holdingPeriod: "short" as const,
      washSale: false,
      washSaleAdjustment: 0,
    }));

    const sheet = await buildForm8949Sheet(
      templateBytes,
      toEvents(stSymbols),
      toEvents(ltSymbols),
      taxpayerName, ssn,
      shortTermTotals, longTermTotals,
      shortBox, longBox,
    );
    return sheet.save();
  }

  // Too many symbols even aggregated — use "See attached" with top symbols
  const doc = await PDFDocument.load(templateBytes, { ignoreEncryption: true });
  const form = doc.getForm();

  const pad = (n: number) => String(n).padStart(2, "0");

  // Page 1: Short-term — fill up to ROWS_PER_PAGE symbol rows
  if (taxpayerName) setTextField(form, "f1_01[0]", taxpayerName);
  if (ssn) setTextField(form, "f1_02[0]", ssn);
  checkCheckbox(form, shortBox);

  const stToFill = stSymbols.slice(0, ROWS_PER_PAGE);
  for (let i = 0; i < stToFill.length; i++) {
    const s = stToFill[i];
    const baseIdx = 3 + i * 8;
    setTextField(form, `f1_${pad(baseIdx)}[0]`, `${s.symbol} (${s.count} txns) — See attached`);
    setTextField(form, `f1_${pad(baseIdx + 1)}[0]`, "Various");
    setTextField(form, `f1_${pad(baseIdx + 2)}[0]`, "Various");
    setTextField(form, `f1_${pad(baseIdx + 3)}[0]`, formatCurrency(s.proceeds));
    setTextField(form, `f1_${pad(baseIdx + 4)}[0]`, formatCurrency(s.costBasis));
    setTextField(form, `f1_${pad(baseIdx + 7)}[0]`, formatCurrency(s.gainLoss));
  }

  setTextField(form, "f1_91[0]", formatCurrency(shortTermTotals.proceeds));
  setTextField(form, "f1_92[0]", formatCurrency(shortTermTotals.costBasis));
  setTextField(form, "f1_94[0]", formatCurrency(shortTermTotals.gainLoss));

  // Page 2: Long-term
  if (taxpayerName) setTextField(form, "f2_01[0]", taxpayerName);
  if (ssn) setTextField(form, "f2_02[0]", ssn);
  checkCheckbox(form, longBox);

  const ltToFill = ltSymbols.slice(0, ROWS_PER_PAGE);
  for (let i = 0; i < ltToFill.length; i++) {
    const s = ltToFill[i];
    const baseIdx = 3 + i * 8;
    setTextField(form, `f2_${pad(baseIdx)}[0]`, `${s.symbol} (${s.count} txns) — See attached`);
    setTextField(form, `f2_${pad(baseIdx + 1)}[0]`, "Various");
    setTextField(form, `f2_${pad(baseIdx + 2)}[0]`, "Various");
    setTextField(form, `f2_${pad(baseIdx + 3)}[0]`, formatCurrency(s.proceeds));
    setTextField(form, `f2_${pad(baseIdx + 4)}[0]`, formatCurrency(s.costBasis));
    setTextField(form, `f2_${pad(baseIdx + 7)}[0]`, formatCurrency(s.gainLoss));
  }

  setTextField(form, "f2_91[0]", formatCurrency(longTermTotals.proceeds));
  setTextField(form, "f2_92[0]", formatCurrency(longTermTotals.costBasis));
  setTextField(form, "f2_94[0]", formatCurrency(longTermTotals.gainLoss));

  form.flatten();
  return doc.save();
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

/**
 * Generate Schedule D from pre-computed totals (same DB aggregation as transactions page).
 */
async function generateScheduleD(
  totals: {
    stProceeds: number; stCostBasis: number; stGainLoss: number;
    ltProceeds: number; ltCostBasis: number; ltGainLoss: number;
  },
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

  const { stProceeds, stCostBasis, stGainLoss, ltProceeds, ltCostBasis, ltGainLoss } = totals;

  // ---- Part I: Short-Term ----
  setTextField(form, "f1_3[0]", formatCurrency(stProceeds));
  setTextField(form, "f1_4[0]", formatCurrency(stCostBasis));
  setTextField(form, "f1_6[0]", formatCurrency(stGainLoss));
  setTextField(form, "f1_22[0]", formatCurrency(stGainLoss));

  // ---- Part II: Long-Term ----
  setTextField(form, "f1_23[0]", formatCurrency(ltProceeds));
  setTextField(form, "f1_24[0]", formatCurrency(ltCostBasis));
  setTextField(form, "f1_26[0]", formatCurrency(ltGainLoss));
  setTextField(form, "f1_43[0]", formatCurrency(ltGainLoss));

  // ---- Part III: Summary (Page 2) ----
  const combined = stGainLoss + ltGainLoss;
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

    // Check plan — PDF reports require a paid plan
    const { getUserPlan } = await import("@/lib/plan-limits");
    const plan = await getUserPlan(user.id);
    if (!plan.features.allReports) {
      return NextResponse.json(
        { error: "PDF reports require a paid plan. Upgrade to download Schedule D, Form 8949, and Schedule 1." },
        { status: 403 },
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

    // ---- Query ALL data from DB (single source of truth) ----
    console.log(`[Tax PDF API] Generating ${formParam} for year ${year}, user ${user.id}`);

    const taxpayerName = searchParams.get("name") || user.name || undefined;
    const ssn = searchParams.get("ssn") || undefined;

    const yearStart = new Date(`${year}-01-01T00:00:00Z`);
    const yearEnd = new Date(`${year}-12-31T23:59:59.999Z`);
    const orConditions: any[] = [];
    if (walletAddresses.length > 0) {
      orConditions.push({ wallet_address: { in: walletAddresses } });
    }
    orConditions.push({ AND: [{ source_type: "csv_import" }, { userId: user.id }] });
    const userExchanges = await prisma.exchange.findMany({
      where: { userId: user.id },
      select: { name: true },
    });
    if (userExchanges.length > 0) {
      orConditions.push({
        AND: [{ source_type: "exchange_api" }, { source: { in: userExchanges.map(e => e.name) } }],
      });
    }
    const yearFilter: any = {
      OR: orConditions,
      tx_timestamp: { gte: yearStart, lte: yearEnd },
    };

    // ---- Aggregate from DB: exact same logic as transactions page ----
    // Transactions page (route.ts line 475): SUM(cost_basis_usd), SUM(gain_loss_usd)
    //   where gain_loss_usd IS NOT NULL
    // Then: totalCostBasis = abs(SUM(cost_basis_usd))
    //       netGain = SUM(gain_loss_usd)
    //       totalProceeds = totalCostBasis + netGain

    // Split by holding_period for Schedule D
    // NULL holding_period = not yet recomputed with new schema — treat as short-term
    const [stAgg, ltAgg, nullAgg, dbIncomeAgg] = await Promise.all([
      prisma.transaction.aggregate({
        where: { ...yearFilter, gain_loss_usd: { not: null }, holding_period: "short" },
        _sum: { cost_basis_usd: true, gain_loss_usd: true },
      }),
      prisma.transaction.aggregate({
        where: { ...yearFilter, gain_loss_usd: { not: null }, holding_period: "long" },
        _sum: { cost_basis_usd: true, gain_loss_usd: true },
      }),
      prisma.transaction.aggregate({
        where: { ...yearFilter, gain_loss_usd: { not: null }, holding_period: null },
        _sum: { cost_basis_usd: true, gain_loss_usd: true },
      }),
      prisma.transaction.aggregate({
        where: { ...yearFilter, is_income: true },
        _sum: { value_usd: true },
      }),
    ]);

    // Exact same math as transactions page
    // Transactions with NULL holding_period default to short-term
    const stCostBasis = Math.abs(Number(stAgg._sum.cost_basis_usd || 0)) + Math.abs(Number(nullAgg._sum.cost_basis_usd || 0));
    const stNetGain = Number(stAgg._sum.gain_loss_usd || 0) + Number(nullAgg._sum.gain_loss_usd || 0);
    const stProceeds = stCostBasis + stNetGain;

    const ltCostBasis = Math.abs(Number(ltAgg._sum.cost_basis_usd || 0));
    const ltNetGain = Number(ltAgg._sum.gain_loss_usd || 0);
    const ltProceeds = ltCostBasis + ltNetGain;

    const totalIncome = Number(dbIncomeAgg._sum.value_usd || 0);

    // Enforce plan transaction limit on report rows
    const userPlan = await getUserPlan(user.id);
    const txLimit = userPlan.transactionLimit === Infinity ? undefined : userPlan.transactionLimit;

    // Also fetch individual disposal rows for Form 8949 detail lines
    const disposalTxns = await prisma.transaction.findMany({
      where: {
        ...yearFilter,
        gain_loss_usd: { not: null },
      },
      ...(txLimit ? { take: txLimit } : {}),
      select: {
        id: true,
        asset_symbol: true,
        amount_value: true,
        cost_basis_usd: true,
        gain_loss_usd: true,
        holding_period: true,
        date_acquired: true,
        tx_timestamp: true,
        source: true,
      },
      orderBy: { tx_timestamp: "asc" },
    });

    // Per-row events for Form 8949 (only non-zero gain/loss = actual disposals)
    const dbEvents: TaxableEvent[] = disposalTxns
      .filter(tx => Number(tx.gain_loss_usd) !== 0)
      .map(tx => {
        const gainLoss = Number(tx.gain_loss_usd);
        const costBasis = Math.abs(Number(tx.cost_basis_usd || 0));
        return {
          id: tx.id,
          date: tx.tx_timestamp,
          asset: tx.asset_symbol,
          amount: Math.abs(Number(tx.amount_value)),
          proceeds: costBasis + gainLoss,
          costBasis,
          gainLoss,
          holdingPeriod: (tx.holding_period === "long" ? "long" : "short") as "short" | "long",
          dateAcquired: tx.date_acquired || undefined,
          source: tx.source || undefined,
          washSale: false,
          washSaleAdjustment: 0,
        };
      });

    const report: TaxReport = {
      taxableEvents: dbEvents,
      incomeEvents: [],
      totalIncome,
      netShortTermGain: stNetGain,
      netLongTermGain: ltNetGain,
      summary: {
        shortTermGain: stNetGain > 0 ? stNetGain : 0,
        shortTermLoss: stNetGain < 0 ? stNetGain : 0,
        longTermGain: ltNetGain > 0 ? ltNetGain : 0,
        longTermLoss: ltNetGain < 0 ? ltNetGain : 0,
        netGain: stNetGain + ltNetGain,
        totalProceeds: stProceeds + ltProceeds,
        totalCostBasis: stCostBasis + ltCostBasis,
      },
    };

    // ---- Generate the PDF ----
    let pdfBytes: Uint8Array;
    let filename: string;

    if (formParam === "8949") {
      pdfBytes = await generateForm8949(report, taxpayerName, ssn);
      filename = `Form8949-${year}.pdf`;
    } else if (formParam === "scheduled") {
      pdfBytes = await generateScheduleD(
        { stProceeds, stCostBasis, stGainLoss: stNetGain, ltProceeds, ltCostBasis, ltGainLoss: ltNetGain },
        taxpayerName, ssn,
      );
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
