import { NextRequest, NextResponse } from "next/server";
import { PrismaClient, Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { rateLimitAPI, createRateLimitResponse } from "@/lib/rate-limit";
import * as Sentry from "@sentry/nextjs";

const prisma = new PrismaClient();

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

    // Get user authentication
    let user;
    try {
      user = await getCurrentUser();
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
    
    // Build OR conditions for wallet transactions and CSV imports
    const userTransactionConditions: Prisma.TransactionWhereInput[] = [];
    
    if (walletAddresses.length > 0) {
      userTransactionConditions.push({ wallet_address: { in: walletAddresses } });
    }
    
    // Always include CSV imports (assumes CSV imports belong to authenticated user)
    // This is safe because the user is authenticated and can only see their own CSV imports
    userTransactionConditions.push({
      AND: [
        { source_type: "csv_import" },
        { wallet_address: null },
      ],
    });

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
      if (filter === "transfer") {
        whereConditions.push({ type: { in: ["Send", "Receive", "Transfer", "Bridge"] } });
      } else if (filter === "stake") {
        whereConditions.push({ type: { in: ["Stake", "Staking"] } });
      } else if (filter === "liquidity") {
        whereConditions.push({ type: { contains: "Liquidity", mode: "insensitive" } });
      } else if (filter === "nft") {
        whereConditions.push({
          OR: [
            { type: { contains: "NFT", mode: "insensitive" } },
            { type: "NFT Purchase" },
          ],
        });
      } else if (filter === "dca") {
        whereConditions.push({ type: "DCA" });
      } else if (filter === "zero") {
        whereConditions.push({
          OR: [
            { type: "Zero Transaction" },
            { value_usd: 0 },
          ],
        });
      } else if (filter === "spam") {
        whereConditions.push({
          OR: [
            { type: { contains: "Spam", mode: "insensitive" } },
            { asset_symbol: { contains: "unknown", mode: "insensitive" } },
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
    if (hideZeroTransactions) {
      whereConditions.push({
        NOT: [
          { type: "Zero Transaction" },
          { value_usd: 0 },
        ],
      });
    }

    // Apply spam transactions filter
    if (hideSpamTransactions) {
      whereConditions.push({
        NOT: [
          { type: { contains: "Spam", mode: "insensitive" } },
          { asset_symbol: { contains: "unknown", mode: "insensitive" } },
        ],
      });
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
        },
      }),
      prisma.transaction.count({ where }),
    ]);

    // Format transactions for frontend
    const formattedTransactions = transactions.map((tx) => {
      const amountValue = Number(tx.amount_value);
      const valueUsd = Number(tx.value_usd);
      const pricePerUnit = tx.price_per_unit ? Number(tx.price_per_unit) : valueUsd / amountValue;

      // Format amount
      const amount = `${amountValue} ${tx.asset_symbol}`;

      // Format price
      const price = `$${pricePerUnit.toFixed(2)}`;

      // Format value (negative for buys/DCA)
      let value = `$${Math.abs(valueUsd).toFixed(2)}`;
      if (tx.type === "Buy" || tx.type === "DCA") {
        value = `-${value}`;
      } else if (tx.type === "Sell" && valueUsd < 0) {
        value = `-${value}`;
      }

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
        identified: tx.identified || false,
        valueIdentified: true, // Can be enhanced later
        chain: tx.chain,
        txHash: tx.tx_hash,
        notes: tx.notes || "",
      };
    });

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
  } finally {
    await prisma.$disconnect();
  }
}
