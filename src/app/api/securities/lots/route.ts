import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { rateLimitAPI, createRateLimitResponse } from "@/lib/rate-limit";
import prisma from "@/lib/prisma";

/**
 * GET /api/securities/lots
 * Returns securities tax lots for the authenticated user.
 *
 * Query params:
 *   status  - Filter by OPEN or CLOSED (default: all)
 *   symbol  - Filter by ticker symbol
 *   page    - Page number (default 1)
 *   limit   - Items per page (default 50, max 200)
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
    const status = searchParams.get("status")?.toUpperCase() || undefined;
    const symbol = searchParams.get("symbol")?.trim().toUpperCase() || undefined;
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") || "50")));

    // Build where clause
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = { userId: user.id };
    if (status === "OPEN" || status === "CLOSED") {
      where.status = status;
    }
    if (symbol) {
      where.symbol = { contains: symbol, mode: "insensitive" };
    }

    // Fetch lots and total count in parallel
    const [total, lots] = await Promise.all([
      prisma.securitiesLot.count({ where }),
      prisma.securitiesLot.findMany({
        where,
        orderBy: [{ dateAcquired: "desc" }, { id: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    // Compute summary stats for the filtered set
    const allFiltered = await prisma.securitiesLot.findMany({
      where,
      select: {
        status: true,
        quantity: true,
        totalCostBasis: true,
        costBasisPerShare: true,
      },
    });

    const openLots = allFiltered.filter((l) => l.status === "OPEN");
    const totalOpenLots = openLots.length;
    const totalCostBasis = openLots.reduce(
      (sum, l) => sum + Number(l.totalCostBasis),
      0,
    );

    // Format lots for frontend
    const formatted = lots.map((lot) => ({
      id: lot.id,
      symbol: lot.symbol,
      assetClass: lot.assetClass,
      quantity: Number(lot.quantity),
      originalQuantity: Number(lot.originalQuantity),
      costBasisPerShare: Number(lot.costBasisPerShare),
      totalCostBasis: Number(lot.totalCostBasis),
      dateAcquired: lot.dateAcquired.toISOString(),
      adjustedAcquisitionDate: lot.adjustedAcquisitionDate
        ? lot.adjustedAcquisitionDate.toISOString()
        : null,
      dateSold: lot.dateSold ? lot.dateSold.toISOString() : null,
      holdingPeriod: lot.holdingPeriod,
      washSaleAdjustment: Number(lot.washSaleAdjustment),
      isCovered: lot.isCovered,
      source: lot.source,
      isSection1256: lot.isSection1256,
      status: lot.status,
      brokerageId: lot.brokerageId,
      createdAt: lot.createdAt.toISOString(),
    }));

    return NextResponse.json({
      status: "success",
      lots: formatted,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      summary: {
        totalOpenLots,
        totalCostBasis: Math.round(totalCostBasis * 100) / 100,
      },
    });
  } catch (error) {
    console.error("[Securities Lots API] GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch securities lots" },
      { status: 500 },
    );
  }
}
