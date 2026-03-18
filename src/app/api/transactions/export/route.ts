import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { rateLimitAPI, createRateLimitResponse } from "@/lib/rate-limit";
import * as Sentry from "@sentry/nextjs";
import { getTypesForCategory } from "@/lib/transaction-categorizer";

/**
 * GET /api/transactions/export
 * Export transactions as CSV with the same filters as GET /api/transactions.
 * Returns all matching rows (no pagination cap).
 */
export async function GET(request: NextRequest) {
  try {
    const rateLimitResult = rateLimitAPI(request, 10); // stricter limit for exports
    if (!rateLimitResult.success) {
      return createRateLimitResponse(
        rateLimitResult.remaining,
        rateLimitResult.reset
      );
    }

    let user;
    try {
      user = await getCurrentUser(request);
    } catch (authError) {
      const errorMessage =
        authError instanceof Error ? authError.message : "Unknown error";
      if (
        errorMessage.includes("Can't reach database") ||
        errorMessage.includes("P1001")
      ) {
        return NextResponse.json(
          {
            error: "Database connection failed",
            details:
              "Please check your DATABASE_URL in .env file. The database server may not be running.",
          },
          { status: 503 }
        );
      }
      throw authError;
    }

    if (!user) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    // Parse query parameters (same as GET /api/transactions, minus pagination)
    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get("search") || "";
    const filter = searchParams.get("filter") || "all";
    const sortOption = searchParams.get("sort") || "date-desc";
    const showOnlyUnlabelled =
      searchParams.get("showOnlyUnlabelled") === "true";
    const hideZeroTransactions =
      searchParams.get("hideZeroTransactions") === "true";
    const hideSpamTransactions =
      searchParams.get("hideSpamTransactions") === "true";
    const walletFilter = searchParams.get("wallet") || "";
    const dateFrom = searchParams.get("dateFrom") || "";
    const dateTo = searchParams.get("dateTo") || "";

    // Build where clause — mirrors /api/transactions logic
    const whereConditions: Prisma.TransactionWhereInput[] = [];

    const userWithWallets = await prisma.user.findUnique({
      where: { id: user.id },
      include: { wallets: true },
    });

    const walletAddresses =
      userWithWallets?.wallets.map((w) => w.address) || [];

    const userTransactionConditions: Prisma.TransactionWhereInput[] = [];

    if (walletAddresses.length > 0) {
      userTransactionConditions.push({
        wallet_address: { in: walletAddresses },
      });
    }

    userTransactionConditions.push({
      AND: [{ source_type: "csv_import" }, { userId: user.id }],
    });

    const userExchanges = await prisma.exchange.findMany({
      where: { userId: user.id },
      select: { name: true },
    });
    const exchangeNames = userExchanges.map((e) => e.name);
    if (exchangeNames.length > 0) {
      userTransactionConditions.push({
        AND: [
          { source_type: "exchange_api" },
          { source: { in: exchangeNames } },
        ],
      });
    }

    if (userTransactionConditions.length > 0) {
      whereConditions.push({ OR: userTransactionConditions });
    }

    if (search) {
      whereConditions.push({
        OR: [
          { asset_symbol: { contains: search, mode: "insensitive" } },
          { source: { contains: search, mode: "insensitive" } },
          { type: { contains: search, mode: "insensitive" } },
        ],
      });
    }

    if (filter !== "all") {
      if (filter === "buy") {
        whereConditions.push({ type: { in: getTypesForCategory("buy") } });
      } else if (filter === "sell") {
        whereConditions.push({ type: { in: getTypesForCategory("sell") } });
      } else if (filter === "transfer") {
        whereConditions.push({ type: { in: getTypesForCategory("transfer") } });
      } else if (filter === "swap") {
        whereConditions.push({ type: { in: getTypesForCategory("swap") } });
      } else if (filter === "stake") {
        whereConditions.push({ type: { in: getTypesForCategory("staking") } });
      } else if (filter === "defi") {
        whereConditions.push({ type: { in: getTypesForCategory("defi") } });
      } else if (filter === "nft") {
        whereConditions.push({ type: { in: getTypesForCategory("nft") } });
      } else if (filter === "income") {
        whereConditions.push({ type: { in: getTypesForCategory("income") } });
      } else if (filter === "other") {
        whereConditions.push({ type: { in: getTypesForCategory("other") } });
      } else {
        whereConditions.push({
          type: { contains: filter, mode: "insensitive" },
        });
      }
    }

    if (showOnlyUnlabelled) {
      whereConditions.push({ identified: false });
    }

    if (hideZeroTransactions) {
      whereConditions.push({
        NOT: {
          OR: [{ type: "Zero Transaction" }, { value_usd: 0 }],
        },
      });
    }

    if (hideSpamTransactions) {
      whereConditions.push({
        NOT: {
          OR: [
            { type: { contains: "Spam", mode: "insensitive" } },
            { asset_symbol: { contains: "unknown", mode: "insensitive" } },
          ],
        },
      });
    }

    if (walletFilter) {
      whereConditions.push({ wallet_address: walletFilter });
    }

    if (dateFrom) {
      whereConditions.push({ tx_timestamp: { gte: new Date(dateFrom) } });
    }
    if (dateTo) {
      const endDate = new Date(dateTo);
      endDate.setDate(endDate.getDate() + 1);
      whereConditions.push({ tx_timestamp: { lt: endDate } });
    }

    const where: Prisma.TransactionWhereInput =
      whereConditions.length > 0 ? { AND: whereConditions } : {};

    // Build orderBy
    let orderBy: Prisma.TransactionOrderByWithRelationInput = {};
    switch (sortOption) {
      case "date-asc":
        orderBy = { tx_timestamp: "asc" };
        break;
      case "date-desc":
        orderBy = { tx_timestamp: "desc" };
        break;
      case "value-asc":
        orderBy = { value_usd: "asc" };
        break;
      case "value-desc":
        orderBy = { value_usd: "desc" };
        break;
      case "asset-asc":
        orderBy = { asset_symbol: "asc" };
        break;
      case "asset-desc":
        orderBy = { asset_symbol: "desc" };
        break;
      case "type-asc":
        orderBy = { type: "asc" };
        break;
      case "type-desc":
        orderBy = { type: "desc" };
        break;
      default:
        orderBy = { tx_timestamp: "desc" };
    }

    // Fetch ALL matching transactions (no pagination)
    const transactions = await prisma.transaction.findMany({
      where,
      orderBy,
      select: {
        type: true,
        asset_symbol: true,
        amount_value: true,
        price_per_unit: true,
        value_usd: true,
        source: true,
        tx_timestamp: true,
        status: true,
        chain: true,
        tx_hash: true,
        notes: true,
      },
    });

    // Build CSV
    const csvHeader =
      "Date,Type,Asset,Amount,Price (USD),Value (USD),Exchange,Chain,TX Hash,Status,Notes";

    const csvRows = transactions.map((tx) => {
      const amountValue = Number(tx.amount_value);
      const valueUsd = Number(tx.value_usd);
      const pricePerUnit = tx.price_per_unit
        ? Number(tx.price_per_unit)
        : amountValue > 0
          ? valueUsd / amountValue
          : 0;

      const date = tx.tx_timestamp.toISOString();
      const escapeCsv = (val: string) => {
        if (val.includes(",") || val.includes('"') || val.includes("\n")) {
          return `"${val.replace(/"/g, '""')}"`;
        }
        return val;
      };

      return [
        escapeCsv(date),
        escapeCsv(tx.type),
        escapeCsv(tx.asset_symbol),
        amountValue,
        pricePerUnit.toFixed(6),
        valueUsd.toFixed(2),
        escapeCsv(tx.source || ""),
        escapeCsv(tx.chain || ""),
        escapeCsv(tx.tx_hash || ""),
        escapeCsv(tx.status || ""),
        escapeCsv(tx.notes || ""),
      ].join(",");
    });

    const csv = [csvHeader, ...csvRows].join("\n");

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": 'attachment; filename="transactions.csv"',
      },
    });
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("[Transactions Export API] Error:", error);
    }

    Sentry.captureException(error, {
      tags: { endpoint: "/api/transactions/export" },
    });

    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    const isDatabaseError =
      errorMessage.includes("Can't reach database") ||
      errorMessage.includes("P1001") ||
      errorMessage.includes("connection");

    return NextResponse.json(
      {
        error: "Failed to export transactions",
        details: isDatabaseError
          ? "Database connection failed. Please check your DATABASE_URL in .env file."
          : errorMessage,
      },
      { status: 500 }
    );
  }
}
