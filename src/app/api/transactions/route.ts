import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { rateLimitAPI, createRateLimitResponse } from "@/lib/rate-limit";
import * as Sentry from "@sentry/nextjs";

/**
 * GET /api/transactions
 * Fetch transactions with pagination, filtering, and sorting
 * Query params:
 *   - page: Page number (default: 1)
 *   - limit: Items per page (default: 50, max: 500)
 *   - search: Search term (asset, exchange, type)
 *   - filter: Transaction type filter (all, buy, sell, swap, etc.)
 *   - sort: Sort option (date-desc, date-asc, value-desc, value-asc, asset-asc, asset-desc, type-asc, type-desc)
 *   - showOnlyUnlabelled: Show only unlabelled transactions (true/false)
 *   - hideZeroTransactions: Hide zero value transactions (true/false)
 *   - hideSpamTransactions: Hide spam transactions (true/false)
 *   - wallet: Filter by wallet address
 *   - dateFrom: Start date filter (yyyy-MM-dd, inclusive)
 *   - dateTo: End date filter (yyyy-MM-dd, inclusive)
 */
export async function GET(request: NextRequest) {
  try {
    // Rate limiting
    const rateLimitResult = rateLimitAPI(request, 100); // 100 requests per minute
    if (!rateLimitResult.success) {
      return createRateLimitResponse(
        rateLimitResult.remaining,
        rateLimitResult.reset
      );
    }

    // Get user authentication - pass request for proper Vercel session handling
    let user;
    try {
      user = await getCurrentUser(request);
    } catch (authError) {
      // Check if it's a database connection error
      const errorMessage = authError instanceof Error ? authError.message : "Unknown error";
      if (errorMessage.includes("Can't reach database") || errorMessage.includes("P1001")) {
        return NextResponse.json(
          {
            error: "Database connection failed",
            details: "Please check your DATABASE_URL in .env file. The database server may not be running.",
          },
          { status: 503 }
        );
      }
      throw authError; // Re-throw if it's not a database error
    }

    if (!user) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    // Parse query parameters
    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get("page") || "1");
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 500); // Max 500 per page
    const search = searchParams.get("search") || "";
    const filter = searchParams.get("filter") || "all";
    const sortOption = searchParams.get("sort") || "date-desc";
    const showOnlyUnlabelled = searchParams.get("showOnlyUnlabelled") === "true";
    const hideZeroTransactions = searchParams.get("hideZeroTransactions") === "true";
    const hideSpamTransactions = searchParams.get("hideSpamTransactions") === "true";
    const walletFilter = searchParams.get("wallet") || "";
    const dateFrom = searchParams.get("dateFrom") || "";
    const dateTo = searchParams.get("dateTo") || "";

    // Calculate offset
    const skip = (page - 1) * limit;

    // Build where clause using array of conditions (simpler and more maintainable)
    const whereConditions: Prisma.TransactionWhereInput[] = [];

    // Filter by user's wallets OR CSV imports
    // Strategy: Include transactions with user's wallet addresses OR CSV imports
    // This matches the logic used in delete-all and tax-calculator endpoints
    const userWithWallets = await prisma.user.findUnique({
      where: { id: user.id },
      include: { wallets: true },
    });

    const walletAddresses = userWithWallets?.wallets.map((w) => w.address) || [];
    
    // Build OR conditions for wallet transactions, CSV imports, and exchange API imports
    const userTransactionConditions: Prisma.TransactionWhereInput[] = [];

    if (walletAddresses.length > 0) {
      userTransactionConditions.push({ wallet_address: { in: walletAddresses } });
    }

    // Include CSV imports (see LIMITATION note in tax-calculator.ts re: multi-user scoping)
    userTransactionConditions.push({
      AND: [
        { source_type: "csv_import" },
        { wallet_address: null },
      ],
    });

    // Include exchange API imports — scoped to user's connected exchanges
    const userExchanges = await prisma.exchange.findMany({
      where: { userId: user.id },
      select: { name: true },
    });
    const exchangeNames = userExchanges.map(e => e.name);
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

    // Apply search filter
    if (search) {
      whereConditions.push({
        OR: [
          { asset_symbol: { contains: search, mode: "insensitive" } },
          { source: { contains: search, mode: "insensitive" } },
          { type: { contains: search, mode: "insensitive" } },
        ],
      });
    }

    // Apply transaction type filter
    if (filter !== "all") {
      if (filter === "buy") {
        whereConditions.push({ type: { in: ["Buy", "Margin Buy", "DCA"] } });
      } else if (filter === "sell") {
        whereConditions.push({ type: { in: ["Sell", "Margin Sell", "Liquidation"] } });
      } else if (filter === "transfer") {
        whereConditions.push({ type: { in: ["Send", "Receive", "Transfer", "Bridge", "Self"] } });
      } else if (filter === "swap") {
        whereConditions.push({ type: { in: ["Swap", "Wrap", "Unwrap"] } });
      } else if (filter === "stake") {
        whereConditions.push({ type: { in: ["Stake", "Unstake"] } });
      } else if (filter === "defi") {
        whereConditions.push({ type: { in: ["Deposit", "Withdraw", "Borrow", "Repay", "Add Liquidity", "Remove Liquidity", "DeFi Setup"] } });
      } else if (filter === "nft") {
        whereConditions.push({
          OR: [
            { type: { contains: "NFT", mode: "insensitive" } },
            { type: "Mint" },
          ],
        });
      } else if (filter === "income") {
        whereConditions.push({ type: { in: ["Reward", "Airdrop", "Mining", "Yield", "Interest"] } });
      } else if (filter === "other") {
        whereConditions.push({
          OR: [
            { type: "Burn" },
            { type: "Approve" },
            { type: "Zero Transaction" },
            { type: { contains: "Spam", mode: "insensitive" } },
            { asset_symbol: { contains: "unknown", mode: "insensitive" } },
            { value_usd: 0 },
          ],
        });
      } else {
        whereConditions.push({ type: { contains: filter, mode: "insensitive" } });
      }
    }

    // Apply unlabelled filter
    if (showOnlyUnlabelled) {
      whereConditions.push({ identified: false });
    }

    // Apply zero transactions filter
    // BUG-019 fix: Use correct NOT with OR logic to filter out matching records
    if (hideZeroTransactions) {
      whereConditions.push({
        NOT: {
          OR: [
            { type: "Zero Transaction" },
            { value_usd: 0 },
          ],
        },
      });
    }

    // Apply spam transactions filter
    // BUG-019 fix: Use correct NOT with OR logic to filter out matching records
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

    // Apply wallet filter
    if (walletFilter) {
      whereConditions.push({ wallet_address: walletFilter });
    }

    // Apply date range filter
    if (dateFrom) {
      whereConditions.push({ tx_timestamp: { gte: new Date(dateFrom) } });
    }
    if (dateTo) {
      const endDate = new Date(dateTo);
      endDate.setDate(endDate.getDate() + 1); // include full end date
      whereConditions.push({ tx_timestamp: { lt: endDate } });
    }

    // Combine all conditions with AND
    const where: Prisma.TransactionWhereInput =
      whereConditions.length > 0 ? { AND: whereConditions } : {};

    // Build orderBy clause
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

    // Fetch transactions with pagination
    const [transactions, totalCount] = await Promise.all([
      prisma.transaction.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        select: {
          id: true,
          type: true,
          asset_symbol: true,
          amount_value: true,
          price_per_unit: true,
          value_usd: true,
          source: true,
          tx_timestamp: true,
          status: true,
          identified: true,
          chain: true,
          tx_hash: true,
          notes: true, // BUG-010/BUG-017 fix: Include notes in select
        },
      }),
      prisma.transaction.count({ where }),
    ]);

    // Known transaction types for identification
    const KNOWN_TYPES = new Set([
      "Buy", "Sell", "Swap", "Send", "Receive", "Transfer", "Bridge",
      "Stake", "DCA", "NFT Purchase", "NFT Sale",
      "Margin Buy", "Margin Sell", "Liquidation",
      "Add Liquidity", "Remove Liquidity",
      "Borrow", "Repay", "Unstake", "Zero Transaction", "Spam",
      "Airdrop", "Mining", "Yield", "Interest", "Reward",
      "Deposit", "Withdraw", "Burn", "Wrap", "Unwrap",
      "Self", "Approve", "Mint", "NFT Activity", "DeFi Setup",
    ]);

    // Format transactions for frontend
    const formattedTransactions = transactions.map((tx) => {
      const amountValue = Number(tx.amount_value);
      const valueUsd = Number(tx.value_usd);
      // BUG-018 fix: Prevent NaN/Infinity when amountValue is zero
      const pricePerUnit = tx.price_per_unit
        ? Number(tx.price_per_unit)
        : (amountValue > 0 ? valueUsd / amountValue : 0);

      // Format amount
      const amount = `${amountValue} ${tx.asset_symbol}`;

      // Format price
      const price = `$${pricePerUnit.toFixed(2)}`;

      // Format value with correct sign based on transaction type
      // OUTFLOWS (money/crypto leaving): Buy, DCA, Send, Withdraw - NEGATIVE
      // INFLOWS (money/crypto coming in): Sell, Receive - POSITIVE
      // NEUTRAL (no net flow): Swap, Transfer - show absolute value
      let value = `$${Math.abs(valueUsd).toFixed(2)}`;
      const outflowTypes = ["Buy", "DCA", "Send", "Withdraw", "Bridge"];
      const inflowTypes = ["Sell", "Receive"];

      if (outflowTypes.includes(tx.type)) {
        // Outflows are negative (spending money or sending crypto out)
        value = `-${value}`;
      } else if (inflowTypes.includes(tx.type)) {
        // Inflows stay positive (receiving money or crypto)
        // value is already positive
      } else if (tx.type === "Swap") {
        // Swaps: show the outgoing value as negative (you're disposing of assets)
        value = `-${value}`;
      }
      // For Transfer and other types, keep as positive (neutral display)

      return {
        id: tx.id,
        type: tx.type,
        asset: tx.asset_symbol,
        amount,
        price,
        value,
        date: tx.tx_timestamp.toISOString(),
        status: tx.status,
        exchange: tx.source || "Unknown",
        identified: KNOWN_TYPES.has(tx.type),
        valueIdentified: true, // Can be enhanced later
        chain: tx.chain,
        txHash: tx.tx_hash,
        notes: tx.notes || "",
      };
    });

    // Stats queries (run in parallel)
    // Outflow types match the sign logic used in the value column above
    const OUTFLOW_TYPES = ["Buy", "DCA", "Send", "Withdraw", "Bridge", "Swap"];
    const knownTypesArray = Array.from(KNOWN_TYPES);
    const [buyCount, sellCount, identifiedTypeCount, valueIdentifiedCount, outflowAgg, inflowAgg] = await Promise.all([
      prisma.transaction.count({ where: { ...where, type: "Buy" } }),
      prisma.transaction.count({ where: { ...where, type: "Sell" } }),
      prisma.transaction.count({ where: { ...where, type: { in: knownTypesArray } } }),
      prisma.transaction.count({ where: { ...where, NOT: { value_usd: 0 } } }),
      prisma.transaction.aggregate({ where: { ...where, type: { in: OUTFLOW_TYPES } }, _sum: { value_usd: true } }),
      prisma.transaction.aggregate({ where: { ...where, type: { notIn: OUTFLOW_TYPES }, NOT: { value_usd: 0 } }, _sum: { value_usd: true } }),
    ]);

    const otherCount = totalCount - buyCount - sellCount;
    const unlabelledCount = totalCount - identifiedTypeCount;
    const identifiedPercentage = totalCount > 0 ? Math.round((identifiedTypeCount / totalCount) * 100) : 0;
    const valueIdentifiedPercentage = totalCount > 0 ? Math.round((valueIdentifiedCount / totalCount) * 100) : 100;
    // C-7 fix: Renamed from totalGains/totalLosses to totalInflow/totalOutflow to
    // avoid confusion with the tax engine's realized capital gains/losses.
    // These are cash-flow sums, NOT capital gains — they include non-taxable transfers.
    const totalOutflow = Math.abs(Number(outflowAgg._sum.value_usd || 0));
    const totalInflow = Math.abs(Number(inflowAgg._sum.value_usd || 0));
    const netCashFlow = totalInflow - totalOutflow;

    // Calculate pagination metadata
    const totalPages = Math.ceil(totalCount / limit);
    const hasNextPage = page < totalPages;
    const hasPreviousPage = page > 1;

    return NextResponse.json({
      status: "success",
      transactions: formattedTransactions,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages,
        hasNextPage,
        hasPreviousPage,
      },
      stats: {
        buyCount,
        sellCount,
        otherCount,
        unlabelledCount,
        identifiedPercentage,
        valueIdentifiedPercentage,
        pnl: {
          totalInflow,
          totalOutflow,
          netCashFlow,
        },
      },
    });
  } catch (error) {
    // Log error only in development
    if (process.env.NODE_ENV === "development") {
      console.error("[Transactions API] Error:", error);
    }

    // Capture error in Sentry
    Sentry.captureException(error, {
      tags: {
        endpoint: "/api/transactions",
      },
    });

    // Check if it's a database connection error
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const isDatabaseError = errorMessage.includes("Can't reach database") || 
                           errorMessage.includes("P1001") ||
                           errorMessage.includes("connection");

    return NextResponse.json(
      {
        error: "Failed to fetch transactions",
        details: isDatabaseError 
          ? "Database connection failed. Please check your DATABASE_URL in .env file."
          : errorMessage,
      },
      { status: 500 }
    );
  }
}
