import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { rateLimitAPI, createRateLimitResponse } from "@/lib/rate-limit";
import prisma from "@/lib/prisma";
import {
  computeSecuritiesLots,
  type SecuritiesTransaction,
} from "@/lib/securities-lot-engine";
import {
  detectWashSales,
  applyWashSaleAdjustments,
} from "@/lib/securities-wash-sale-engine";
import { processDividends } from "@/lib/securities-dividends";
import {
  computeSection1256,
  getQualifyingSymbols,
} from "@/lib/securities-section-1256";
import { computeSection475 } from "@/lib/securities-section-475";
import { computeSection988 } from "@/lib/securities-section-988";
import { Decimal } from "@prisma/client/runtime/library";

/**
 * POST /api/securities/compute
 * Full recompute of securities tax lots, taxable events, wash sales, and dividends.
 *
 * Body (optional):
 *   { year?: number, method?: string }
 *
 * - Fetches all securities_transactions for the user (ordered by date)
 * - Fetches user's securities_tax_settings for the relevant year
 * - Calls computeSecuritiesLots
 * - Detects wash sales and applies basis adjustments
 * - Processes dividends with return-of-capital lot adjustments
 * - Deletes existing computed data for user (full recompute)
 * - Inserts lots, taxable events, wash sales, and dividends
 * - Returns { status, lotsCreated, eventsCreated, washSalesCreated, dividendsCreated }
 */
export async function POST(request: NextRequest) {
  try {
    // Rate limit: 3 per minute per user
    const rateLimitResult = rateLimitAPI(request, 3);
    if (!rateLimitResult.success) {
      return createRateLimitResponse(
        rateLimitResult.remaining,
        rateLimitResult.reset,
      );
    }

    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 },
      );
    }

    // Parse optional body
    let year: number | undefined;
    let methodOverride: string | undefined;
    try {
      const body = await request.json();
      if (body.year) year = parseInt(body.year);
      if (body.method) methodOverride = body.method;
    } catch {
      // Body is optional
    }

    // Fetch user for cost basis method
    const userRecord = await prisma.user.findUnique({
      where: { id: user.id },
      select: { costBasisMethod: true },
    });
    const costBasisMethod = methodOverride || userRecord?.costBasisMethod || "FIFO";

    // Fetch securities tax settings for the year (if specified)
    const taxYear = year || new Date().getFullYear();
    const taxSettings = await prisma.securitiesTaxSettings.findUnique({
      where: {
        userId_year: { userId: user.id, year: taxYear },
      },
    });

    // Default account type to TAXABLE — in the future, this could be
    // per-brokerage. For now, use the broadest setting.
    const accountType = "TAXABLE";

    // Fetch all securities transactions for the user, ordered by date
    const rawTransactions = await prisma.securitiesTransaction.findMany({
      where: { userId: user.id },
      orderBy: [{ date: "asc" }, { id: "asc" }],
    });

    if (rawTransactions.length === 0) {
      return NextResponse.json({
        status: "success",
        lotsCreated: 0,
        eventsCreated: 0,
        washSalesCreated: 0,
        dividendsCreated: 0,
        message: "No transactions to compute.",
      });
    }

    // Convert Prisma Decimal fields to numbers for the engine
    const transactions: SecuritiesTransaction[] = rawTransactions.map((tx) => ({
      id: tx.id,
      userId: tx.userId,
      brokerageId: tx.brokerageId,
      date: new Date(tx.date),
      type: tx.type,
      symbol: tx.symbol,
      assetClass: tx.assetClass,
      quantity: Number(tx.quantity),
      price: Number(tx.price),
      fees: Number(tx.fees),
      totalAmount: tx.totalAmount ? Number(tx.totalAmount) : null,
      lotId: tx.lotId,
      underlyingSymbol: tx.underlyingSymbol,
      optionType: tx.optionType,
      strikePrice: tx.strikePrice ? Number(tx.strikePrice) : null,
      expirationDate: tx.expirationDate ? new Date(tx.expirationDate) : null,
      dividendType: tx.dividendType,
      isCovered: tx.isCovered,
      isSection1256: tx.isSection1256,
      notes: tx.notes,
    }));

    // Run the lot engine
    const { lots, taxableEvents, dividends } = computeSecuritiesLots(
      transactions,
      costBasisMethod,
      accountType,
    );

    // -----------------------------------------------------------------------
    // Wash sale detection
    // -----------------------------------------------------------------------
    const taxStatus = taxSettings?.taxStatus || "INVESTOR";
    const substantiallyIdenticalMethod =
      taxSettings?.substantiallyIdenticalMethod || "METHOD_1";

    // Fetch user's equivalence groups
    const equivalenceGroups = await prisma.securitiesEquivalenceGroup.findMany({
      where: { userId: user.id },
      select: { symbols: true },
    });

    const washSales = detectWashSales(
      taxableEvents,
      lots,
      transactions,
      { substantiallyIdenticalMethod },
      equivalenceGroups,
      taxStatus,
    );

    // Apply wash sale basis adjustments to lots and taxable events
    applyWashSaleAdjustments(washSales, lots, taxableEvents);

    // -----------------------------------------------------------------------
    // Advanced dividends processing (return-of-capital lot adjustments)
    // -----------------------------------------------------------------------
    const openLots = lots.filter((l) => l.status === "OPEN");
    const {
      dividends: advancedDividends,
      lotAdjustments,
    } = processDividends(transactions, openLots);

    // Apply return-of-capital basis adjustments to lots
    if (lotAdjustments.length > 0) {
      const lotById = new Map(lots.map((l) => [l.id, l]));
      for (const adj of lotAdjustments) {
        const lot = lotById.get(adj.lotId);
        if (lot) {
          lot.totalCostBasis = Math.max(0, lot.totalCostBasis - adj.basisReduction);
          lot.costBasisPerShare =
            lot.quantity > 0 ? lot.totalCostBasis / lot.quantity : 0;
        }
      }
    }

    // -----------------------------------------------------------------------
    // Section 1256: tag qualifying events and compute summary
    // -----------------------------------------------------------------------
    const qualifyingSymbols = new Set(
      (await getQualifyingSymbols()).map((s) => s.toUpperCase()),
    );

    // Tag taxable events whose symbols qualify as Section 1256
    for (const ev of taxableEvents) {
      if (
        qualifyingSymbols.has(ev.symbol.toUpperCase()) &&
        ev.gainType !== "SECTION_1256"
      ) {
        ev.gainType = "SECTION_1256";
        ev.formDestination = "6781";
      }
    }

    const section1256Result = await computeSection1256(
      user.id,
      taxYear,
      taxableEvents,
    );

    // -----------------------------------------------------------------------
    // Section 475 MTM: for TRADER_MTM status only
    // -----------------------------------------------------------------------
    let section475Result = null;
    if (taxStatus === "TRADER_MTM") {
      // Build year-end FMV map from YEAR_END_FMV transactions
      const yearEndFmvMap = new Map<string, number>();
      for (const tx of transactions) {
        if (
          tx.type === "YEAR_END_FMV" &&
          new Date(tx.date).getFullYear() === taxYear
        ) {
          yearEndFmvMap.set(
            tx.symbol.toUpperCase(),
            Number(tx.price),
          );
        }
      }

      // Detect transition year: check if prior year had a different tax status
      // by looking at prior year settings. If no prior settings exist, treat
      // this as a transition year.
      let isTransitionYear = false;
      try {
        const priorSettings = await prisma.securitiesTaxSettings.findUnique({
          where: {
            userId_year: { userId: user.id, year: taxYear - 1 },
          },
        });
        isTransitionYear =
          !priorSettings || priorSettings.taxStatus !== "TRADER_MTM";
      } catch {
        isTransitionYear = true;
      }

      section475Result = computeSection475(
        taxableEvents,
        openLots,
        taxYear,
        isTransitionYear,
        yearEndFmvMap,
      );

      // Convert non-segregated events to ordinary gain type and Form 4797
      for (const ev of taxableEvents) {
        if (ev.year !== taxYear) continue;
        // Skip segregated investment events (they retain capital treatment)
        const isSegregated = section475Result.segregatedInvestmentEvents.some(
          (se) =>
            se.transactionId === ev.transactionId && se.lotId === ev.lotId,
        );
        if (isSegregated) continue;
        // Skip Section 1256 events — they have their own treatment
        if (ev.gainType === "SECTION_1256") continue;

        ev.gainType = "ORDINARY";
        ev.formDestination = "4797";
      }
    }

    // -----------------------------------------------------------------------
    // Section 988 Forex: check for forex transactions
    // -----------------------------------------------------------------------
    const section988Election = taxSettings?.section988Election ?? false;
    const hasForex = taxableEvents.some((ev) => ev.assetClass === "FOREX");

    let section988Result = null;
    if (hasForex) {
      section988Result = computeSection988(taxableEvents, section988Election);

      // If NOT opted out (default 988 treatment), mark forex events as ordinary
      if (!section988Election) {
        for (const ev of taxableEvents) {
          if (ev.assetClass !== "FOREX") continue;
          // Skip regulated futures (already Section 1256)
          if (ev.gainType === "SECTION_1256") continue;
          ev.gainType = "ORDINARY";
          ev.formDestination = "4797";
        }
      }
    }

    // -----------------------------------------------------------------------
    // Delete existing computed data for full recompute
    // -----------------------------------------------------------------------
    await prisma.$transaction([
      prisma.securitiesWashSale.deleteMany({ where: { userId: user.id } }),
      prisma.securitiesDividend.deleteMany({ where: { userId: user.id } }),
      prisma.securitiesTaxableEvent.deleteMany({ where: { userId: user.id } }),
      prisma.securitiesLot.deleteMany({ where: { userId: user.id } }),
    ]);

    // -----------------------------------------------------------------------
    // Insert new lots (with wash sale adjustments applied)
    // -----------------------------------------------------------------------
    let lotsCreated = 0;
    if (lots.length > 0) {
      const lotRecords = lots.map((lot) => ({
        userId: user.id,
        brokerageId: lot.brokerageId ?? null,
        symbol: lot.symbol,
        assetClass: lot.assetClass,
        quantity: new Decimal(lot.quantity),
        originalQuantity: new Decimal(lot.originalQuantity),
        costBasisPerShare: new Decimal(lot.costBasisPerShare),
        totalCostBasis: new Decimal(lot.totalCostBasis),
        dateAcquired: lot.dateAcquired,
        adjustedAcquisitionDate: lot.adjustedAcquisitionDate ?? null,
        dateSold: lot.dateSold ?? null,
        holdingPeriod: lot.holdingPeriod ?? null,
        washSaleAdjustment: new Decimal(lot.washSaleAdjustment),
        isCovered: lot.isCovered,
        source: lot.source,
        isSection1256: lot.isSection1256,
        status: lot.status,
      }));

      const result = await prisma.securitiesLot.createMany({
        data: lotRecords,
      });
      lotsCreated = result.count;
    }

    // -----------------------------------------------------------------------
    // Insert new taxable events (with wash sale codes applied)
    // -----------------------------------------------------------------------
    let eventsCreated = 0;
    if (taxableEvents.length > 0) {
      const eventRecords = taxableEvents.map((ev) => ({
        userId: user.id,
        transactionId: ev.transactionId,
        lotId: ev.lotId ?? null,
        year: ev.year,
        symbol: ev.symbol,
        assetClass: ev.assetClass,
        quantity: new Decimal(ev.quantity),
        dateAcquired: ev.dateAcquired,
        dateSold: ev.dateSold,
        proceeds: new Decimal(ev.proceeds),
        costBasis: new Decimal(ev.costBasis),
        gainLoss: new Decimal(ev.gainLoss),
        holdingPeriod: ev.holdingPeriod,
        gainType: ev.gainType,
        form8949Box: ev.form8949Box ?? null,
        formDestination: ev.formDestination,
        washSaleCode: ev.washSaleCode ?? null,
        washSaleAdjustment: new Decimal(ev.washSaleAdjustment),
      }));

      const result = await prisma.securitiesTaxableEvent.createMany({
        data: eventRecords,
      });
      eventsCreated = result.count;
    }

    // -----------------------------------------------------------------------
    // Insert wash sales
    // -----------------------------------------------------------------------
    let washSalesCreated = 0;
    if (washSales.length > 0) {
      const washSaleRecords = washSales.map((ws) => ({
        userId: user.id,
        lossTransactionId: ws.lossTransactionId,
        replacementTransactionId: ws.replacementTransactionId,
        lossLotId: ws.lossLotId ?? null,
        replacementLotId: ws.replacementLotId ?? null,
        disallowedAmount: new Decimal(ws.disallowedAmount),
        isPermanent: ws.isPermanent,
        basisAdjustment: new Decimal(ws.basisAdjustment),
        holdingPeriodTackDays: ws.holdingPeriodTackDays,
        year: ws.year,
        carryForward: ws.carryForward,
      }));

      const result = await prisma.securitiesWashSale.createMany({
        data: washSaleRecords,
      });
      washSalesCreated = result.count;
    }

    // -----------------------------------------------------------------------
    // Insert dividends (merge basic engine dividends + advanced dividends)
    // -----------------------------------------------------------------------
    let dividendsCreated = 0;

    // Use advanced dividends if available (they include payer and foreign tax)
    const dividendSource = advancedDividends.length > 0 ? advancedDividends : dividends;

    if (dividendSource.length > 0) {
      const dividendRecords = dividendSource.map((d) => ({
        userId: user.id,
        transactionId: d.transactionId,
        symbol: d.symbol,
        payer: "payer" in d ? (d as { payer: string }).payer : null,
        amount: new Decimal(d.amount),
        dividendType: d.dividendType,
        foreignTaxPaid: "foreignTaxPaid" in d
          ? new Decimal((d as { foreignTaxPaid: number }).foreignTaxPaid)
          : new Decimal(0),
        year: d.year,
      }));

      const result = await prisma.securitiesDividend.createMany({
        data: dividendRecords,
      });
      dividendsCreated = result.count;
    }

    return NextResponse.json({
      status: "success",
      lotsCreated,
      eventsCreated,
      washSalesCreated,
      dividendsCreated,
      costBasisMethod,
      section1256: {
        shortTermGain: section1256Result.shortTermGain,
        longTermGain: section1256Result.longTermGain,
        totalGain: section1256Result.totalGain,
        mtmEventsCount: section1256Result.mtmEvents.length,
        closedPositionsCount: section1256Result.closedPositions.length,
      },
      ...(section475Result
        ? {
            section475: {
              ordinaryGainLoss: section475Result.ordinaryGainLoss,
              deemedSaleEventsCount: section475Result.deemedSaleEvents.length,
              hasSection481Adjustment: !!section475Result.section481Adjustment,
              segregatedEventsCount:
                section475Result.segregatedInvestmentEvents.length,
            },
          }
        : {}),
      ...(section988Result
        ? {
            section988: {
              ordinaryGainLoss: section988Result.ordinaryGainLoss,
              eventsCount: section988Result.events.length,
              optedOut: section988Result.optedOut,
            },
          }
        : {}),
    });
  } catch (error) {
    console.error("[Securities Compute API] POST error:", error);
    return NextResponse.json(
      { error: "Failed to compute securities lots" },
      { status: 500 },
    );
  }
}
