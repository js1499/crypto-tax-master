import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { rateLimitAPI, createRateLimitResponse } from "@/lib/rate-limit";
import prisma from "@/lib/prisma";

/**
 * GET /api/securities/transactions
 * Returns securities transactions for the authenticated user.
 *
 * Query params:
 *   page     - Page number (default 1)
 *   limit    - Items per page (default 50, max 200)
 *   symbol   - Filter by ticker symbol
 *   type     - Filter by transaction type
 *   dateFrom - Filter from date (ISO string)
 *   dateTo   - Filter to date (ISO string)
 *   account  - Filter by brokerage id
 *   sort     - Sort order: date-asc, date-desc (default: date-desc)
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
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") || "50")));
    const symbol = searchParams.get("symbol")?.trim().toUpperCase() || undefined;
    const type = searchParams.get("type")?.trim().toUpperCase() || undefined;
    const dateFrom = searchParams.get("dateFrom") || undefined;
    const dateTo = searchParams.get("dateTo") || undefined;
    const account = searchParams.get("account") || undefined;
    const sort = searchParams.get("sort") || "date-desc";

    // Build where clause
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = { userId: user.id };

    if (symbol) {
      where.symbol = { contains: symbol, mode: "insensitive" };
    }
    if (type) {
      where.type = type;
    }
    if (dateFrom || dateTo) {
      const dateFilter: Record<string, Date> = {};
      if (dateFrom) {
        const from = new Date(dateFrom);
        if (!isNaN(from.getTime())) dateFilter.gte = from;
      }
      if (dateTo) {
        const to = new Date(dateTo);
        if (!isNaN(to.getTime())) dateFilter.lte = to;
      }
      if (Object.keys(dateFilter).length > 0) {
        where.date = dateFilter;
      }
    }
    if (account) {
      where.brokerageId = account;
    }

    // Build orderBy
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const orderBy: any[] =
      sort === "date-asc"
        ? [{ date: "asc" }, { id: "asc" }]
        : [{ date: "desc" }, { id: "desc" }];

    // Fetch total count and page of transactions in parallel
    const [total, transactions] = await Promise.all([
      prisma.securitiesTransaction.count({ where }),
      prisma.securitiesTransaction.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    // Format for frontend
    const formatted = transactions.map((tx) => ({
      id: tx.id,
      date: tx.date.toISOString(),
      type: tx.type,
      symbol: tx.symbol,
      assetClass: tx.assetClass,
      quantity: Number(tx.quantity),
      price: Number(tx.price),
      fees: Number(tx.fees),
      totalAmount: tx.totalAmount ? Number(tx.totalAmount) : null,
      proceeds: tx.totalAmount
        ? Number(tx.totalAmount)
        : Number(tx.quantity) * Number(tx.price) - Number(tx.fees),
      lotId: tx.lotId,
      brokerageId: tx.brokerageId,
      underlyingSymbol: tx.underlyingSymbol,
      optionType: tx.optionType,
      strikePrice: tx.strikePrice ? Number(tx.strikePrice) : null,
      expirationDate: tx.expirationDate
        ? tx.expirationDate.toISOString()
        : null,
      dividendType: tx.dividendType,
      isCovered: tx.isCovered,
      isSection1256: tx.isSection1256,
      notes: tx.notes,
      createdAt: tx.createdAt.toISOString(),
    }));

    return NextResponse.json({
      status: "success",
      transactions: formatted,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("[Securities Transactions API] GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch securities transactions" },
      { status: 500 },
    );
  }
}
