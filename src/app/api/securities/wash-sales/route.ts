import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { rateLimitAPI, createRateLimitResponse } from "@/lib/rate-limit";
import prisma from "@/lib/prisma";

/**
 * GET /api/securities/wash-sales
 * Returns wash sale records for the authenticated user.
 *
 * Query params:
 *   symbol      - Filter by symbol (joins to transaction)
 *   year        - Filter by tax year
 *   isPermanent - Filter by permanent status ("true"/"false")
 *   carryForward - Filter by carry-forward status ("true"/"false")
 *   page        - Page number (default 1)
 *   limit       - Items per page (default 50, max 200)
 */
export async function GET(request: NextRequest) {
  try {
    const rateLimitResult = rateLimitAPI(request, 100);
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

    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get("symbol")?.trim().toUpperCase() || undefined;
    const yearParam = searchParams.get("year");
    const isPermanentParam = searchParams.get("isPermanent");
    const carryForwardParam = searchParams.get("carryForward");
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") || "50")));

    // Build where clause
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = { userId: user.id };

    if (yearParam) {
      const year = parseInt(yearParam);
      if (!isNaN(year)) where.year = year;
    }

    if (isPermanentParam === "true") where.isPermanent = true;
    else if (isPermanentParam === "false") where.isPermanent = false;

    if (carryForwardParam === "true") where.carryForward = true;
    else if (carryForwardParam === "false") where.carryForward = false;

    // Fetch wash sales and total count
    const [total, washSales] = await Promise.all([
      prisma.securitiesWashSale.count({ where }),
      prisma.securitiesWashSale.findMany({
        where,
        orderBy: [{ year: "desc" }, { id: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    // Collect unique transaction IDs for joining symbol data
    const txIds = new Set<number>();
    for (const ws of washSales) {
      txIds.add(ws.lossTransactionId);
      txIds.add(ws.replacementTransactionId);
    }

    // Fetch associated transactions for display info
    const transactions = await prisma.securitiesTransaction.findMany({
      where: {
        id: { in: Array.from(txIds) },
        userId: user.id,
      },
      select: {
        id: true,
        symbol: true,
        date: true,
        type: true,
        quantity: true,
        price: true,
      },
    });

    const txMap = new Map(transactions.map((tx) => [tx.id, tx]));

    // Apply symbol filter (post-query since it requires join)
    let filtered = washSales;
    if (symbol) {
      filtered = washSales.filter((ws) => {
        const lossTx = txMap.get(ws.lossTransactionId);
        return lossTx && lossTx.symbol.toUpperCase().includes(symbol);
      });
    }

    // Format wash sales for frontend
    const formatted = filtered.map((ws) => {
      const lossTx = txMap.get(ws.lossTransactionId);
      const replacementTx = txMap.get(ws.replacementTransactionId);

      return {
        id: ws.id,
        lossTransactionId: ws.lossTransactionId,
        replacementTransactionId: ws.replacementTransactionId,
        lossLotId: ws.lossLotId,
        replacementLotId: ws.replacementLotId,
        disallowedAmount: Number(ws.disallowedAmount),
        isPermanent: ws.isPermanent,
        basisAdjustment: Number(ws.basisAdjustment),
        holdingPeriodTackDays: ws.holdingPeriodTackDays,
        year: ws.year,
        carryForward: ws.carryForward,
        symbol: lossTx?.symbol || "N/A",
        lossDate: lossTx?.date ? lossTx.date.toISOString() : null,
        lossAmount: lossTx ? Number(lossTx.quantity) * Number(lossTx.price) : 0,
        replacementDate: replacementTx?.date
          ? replacementTx.date.toISOString()
          : null,
        createdAt: ws.createdAt.toISOString(),
      };
    });

    // Compute summary stats across all user wash sales (unfiltered)
    const allWashSales = await prisma.securitiesWashSale.findMany({
      where: { userId: user.id },
      select: {
        disallowedAmount: true,
        isPermanent: true,
        carryForward: true,
      },
    });

    let totalDisallowed = 0;
    let totalPermanent = 0;
    let carryForwardCount = 0;

    for (const ws of allWashSales) {
      const amt = Number(ws.disallowedAmount);
      totalDisallowed += amt;
      if (ws.isPermanent) totalPermanent += amt;
      if (ws.carryForward) carryForwardCount++;
    }

    return NextResponse.json({
      status: "success",
      washSales: formatted,
      total: symbol ? filtered.length : total,
      page,
      limit,
      totalPages: Math.ceil((symbol ? filtered.length : total) / limit),
      summary: {
        totalDisallowed: Math.round(totalDisallowed * 100) / 100,
        totalPermanent: Math.round(totalPermanent * 100) / 100,
        carryForwardCount,
      },
    });
  } catch (error) {
    console.error("[Securities Wash Sales API] GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch wash sales" },
      { status: 500 },
    );
  }
}
