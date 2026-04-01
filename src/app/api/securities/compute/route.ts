import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { rateLimitAPI, createRateLimitResponse } from "@/lib/rate-limit";
import prisma from "@/lib/prisma";
import {
  computeSecuritiesLots,
  type SecuritiesTransaction,
} from "@/lib/securities-lot-engine";
import { Decimal } from "@prisma/client/runtime/library";

/**
 * POST /api/securities/compute
 * Full recompute of securities tax lots, taxable events, and dividends.
 *
 * Body (optional):
 *   { year?: number, method?: string }
 *
 * - Fetches all securities_transactions for the user (ordered by date)
 * - Fetches user's securities_tax_settings for the relevant year
 * - Calls computeSecuritiesLots
 * - Deletes existing lots + taxable events + dividends for user (full recompute)
 * - Inserts new lots, taxable events, and dividends
 * - Returns { status, lotsCreated, eventsCreated, dividendsCreated }
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

    // Delete existing computed data for full recompute
    await prisma.$transaction([
      prisma.securitiesDividend.deleteMany({ where: { userId: user.id } }),
      prisma.securitiesTaxableEvent.deleteMany({ where: { userId: user.id } }),
      prisma.securitiesLot.deleteMany({ where: { userId: user.id } }),
    ]);

    // Insert new lots
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

    // Insert new taxable events
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

    // Insert dividends
    let dividendsCreated = 0;
    if (dividends.length > 0) {
      const dividendRecords = dividends.map((d) => ({
        userId: user.id,
        transactionId: d.transactionId,
        symbol: d.symbol,
        amount: new Decimal(d.amount),
        dividendType: d.dividendType,
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
      dividendsCreated,
      costBasisMethod,
    });
  } catch (error) {
    console.error("[Securities Compute API] POST error:", error);
    return NextResponse.json(
      { error: "Failed to compute securities lots" },
      { status: 500 },
    );
  }
}
