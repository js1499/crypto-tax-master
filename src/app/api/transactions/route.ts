import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { rateLimitAPI, createRateLimitResponse } from "@/lib/rate-limit";
import * as Sentry from "@sentry/nextjs";
import { getCategory, getTypesForCategory, isOutflow, formatTypeForDisplay, getPnlOutflowTypes, getPnlInflowTypes, getPrimaryAssetDirection, getPositiveValueTypes } from "@/lib/transaction-categorizer";

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

    // Apply search filter (search both outgoing and incoming asset symbols)
    if (search) {
      whereConditions.push({
        OR: [
          { asset_symbol: { contains: search, mode: "insensitive" } },
          { incoming_asset_symbol: { contains: search, mode: "insensitive" } },
          { source: { contains: search, mode: "insensitive" } },
          { type: { contains: search, mode: "insensitive" } },
        ],
      });
    }

    // Apply transaction type filter
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
        whereConditions.push({ type: { contains: filter, mode: "insensitive" } });
      }
    }

    // Apply unlabelled filter
    if (showOnlyUnlabelled) {
      whereConditions.push({ identified: false });
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

    // Build stats-only where (before cosmetic filters like hideZero/hideSpam)
    const statsWhereConditions = [...whereConditions];
    const statsWhere: Prisma.TransactionWhereInput =
      statsWhereConditions.length > 0 ? { AND: statsWhereConditions } : {};

    // Apply zero transactions filter (cosmetic — only affects displayed list, not stats)
    if (hideZeroTransactions) {
      whereConditions.push({
        NOT: {
          OR: [
            { type: "Zero Transaction" },
            { value_usd: { lt: 0.005 } },
          ],
        },
      });
    }

    // Apply spam transactions filter (cosmetic — only affects displayed list, not stats)
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
      case "amount-asc":
        orderBy = { amount_value: "asc" };
        break;
      case "amount-desc":
        orderBy = { amount_value: "desc" };
        break;
      case "gainloss-asc":
        orderBy = { gain_loss_usd: "asc" };
        break;
      case "gainloss-desc":
        orderBy = { gain_loss_usd: "desc" };
        break;
      case "source-asc":
        orderBy = { source: "asc" };
        break;
      case "source-desc":
        orderBy = { source: "desc" };
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
          cost_basis_usd: true,
          gain_loss_usd: true,
          incoming_asset_symbol: true,
          incoming_amount_value: true,
          incoming_value_usd: true,
        },
      }),
      prisma.transaction.count({ where }),
    ]);

    // Format transactions for frontend with structured out/in fields
    const formattedTransactions = transactions.map((tx) => {
      const amountValue = Number(tx.amount_value);
      const valueUsd = Number(tx.value_usd);
      // BUG-018 fix: Prevent NaN/Infinity when amountValue is zero
      const pricePerUnit = tx.price_per_unit
        ? Number(tx.price_per_unit)
        : (amountValue > 0 ? valueUsd / amountValue : 0);

      const incomingAmount = tx.incoming_amount_value ? Number(tx.incoming_amount_value) : null;
      const incomingValueUsd = tx.incoming_value_usd ? Number(tx.incoming_value_usd) : null;
      const incomingPricePerUnit = (incomingAmount && incomingAmount > 0 && incomingValueUsd)
        ? incomingValueUsd / incomingAmount
        : null;

      // Determine out/in field mapping based on transaction type
      const hasTwoSides = !!tx.incoming_asset_symbol;
      const direction = getPrimaryAssetDirection(tx.type);

      let outAsset: string | null = null;
      let outAmount: number | null = null;
      let outPricePerUnit: number | null = null;
      let inAsset: string | null = null;
      let inAmount: number | null = null;
      let inPricePerUnit: number | null = null;

      if (hasTwoSides) {
        // Two-sided: primary = out, incoming = in
        outAsset = tx.asset_symbol;
        outAmount = amountValue;
        outPricePerUnit = pricePerUnit;
        inAsset = tx.incoming_asset_symbol;
        inAmount = incomingAmount;
        inPricePerUnit = incomingPricePerUnit;
      } else if (direction === "in") {
        // Single-sided incoming (BUY, TRANSFER_IN, income, etc.)
        inAsset = tx.asset_symbol;
        inAmount = amountValue;
        inPricePerUnit = pricePerUnit;
      } else {
        // Single-sided outgoing (TRANSFER_OUT, SELL, STAKE, etc.)
        outAsset = tx.asset_symbol;
        outAmount = amountValue;
        outPricePerUnit = pricePerUnit;
      }

      // Use persisted cost basis/gain-loss when available (fixes swap value display)
      const costBasisUsdVal = tx.cost_basis_usd ? Number(tx.cost_basis_usd) : null;
      const gainLossUsdVal = tx.gain_loss_usd ? Number(tx.gain_loss_usd) : null;

      let signedValueUsd: number;
      if (gainLossUsdVal !== null) {
        // Disposal (sell, swap, burn, etc.): show realized gain/loss
        signedValueUsd = gainLossUsdVal;
      } else if (costBasisUsdVal !== null && costBasisUsdVal > 0) {
        // Acquisition with cost basis — sign depends on type:
        // Buys = negative (you spent money), receives/transfers-in/income = positive (you gained value)
        const txType = (tx.type || "").toLowerCase();
        const isInboundTransfer = txType === "receive" || txType === "transfer_in"
          || txType === "token receive" || txType === "nft receive";
        const isIncome = getCategory(tx.type) === "income";
        signedValueUsd = (isInboundTransfer || isIncome) ? costBasisUsdVal : -costBasisUsdVal;
      } else {
        // Fallback when cost basis not yet computed
        signedValueUsd = direction === "in" && !hasTwoSides
          ? Math.abs(valueUsd)
          : -Math.abs(valueUsd);
      }

      // Legacy formatted fields (for detail sheet / edit compatibility)
      const amount = `${amountValue} ${tx.asset_symbol}`;
      const price = `$${pricePerUnit.toFixed(2)}`;
      let value = `$${Math.abs(valueUsd).toFixed(2)}`;
      if (isOutflow(tx.type)) {
        value = `-${value}`;
      }

      return {
        id: tx.id,
        type: tx.type,
        displayType: formatTypeForDisplay(tx.type),
        // Structured out/in fields
        outAsset,
        outAmount,
        outPricePerUnit,
        inAsset,
        inAmount,
        inPricePerUnit,
        valueUsd: signedValueUsd,
        costBasisUsd: costBasisUsdVal,
        gainLossUsd: gainLossUsdVal,
        costBasisComputed: costBasisUsdVal !== null || gainLossUsdVal !== null,
        // Legacy fields (detail sheet compatibility)
        asset: tx.asset_symbol,
        amount,
        price,
        value,
        date: tx.tx_timestamp.toISOString(),
        status: tx.status,
        exchange: tx.source || "Unknown",
        identified: getCategory(tx.type) !== "other",
        valueIdentified: true,
        chain: tx.chain,
        txHash: tx.tx_hash,
        notes: tx.notes || "",
        incomingAsset: tx.incoming_asset_symbol || null,
        incomingAmount,
        incomingValueUsd,
      };
    });

    // Stats queries (run in parallel)
    const allKnownTypes = [
      ...getTypesForCategory("buy"), ...getTypesForCategory("sell"),
      ...getTypesForCategory("transfer"), ...getTypesForCategory("swap"),
      ...getTypesForCategory("staking"), ...getTypesForCategory("defi"),
      ...getTypesForCategory("nft"), ...getTypesForCategory("income"),
    ];
    // Stats use statsWhere (includes search/filter/wallet/date but excludes cosmetic hideZero/hideSpam)
    const [buyCount, sellCount, identifiedTypeCount, valueIdentifiedCount, disposalAgg, incomeAgg] = await Promise.all([
      prisma.transaction.count({ where: { ...statsWhere, type: { in: [...getTypesForCategory("buy"), ...getTypesForCategory("nft").filter(t => t === "NFT_PURCHASE" || t === "NFT Purchase" || t === "nft purchase")] } } }),
      prisma.transaction.count({ where: { ...statsWhere, type: { in: [...getTypesForCategory("sell"), ...getTypesForCategory("nft").filter(t => t === "NFT_SALE" || t === "NFT Sale" || t === "nft sale")] } } }),
      prisma.transaction.count({ where: { ...statsWhere, type: { in: allKnownTypes } } }),
      prisma.transaction.count({ where: { ...statsWhere, NOT: { value_usd: 0 } } }),
      // Cost basis stats: aggregate disposal transactions (where gain_loss_usd has been computed)
      prisma.transaction.aggregate({ where: { ...statsWhere, gain_loss_usd: { not: null } }, _sum: { cost_basis_usd: true, gain_loss_usd: true } }),
      // Income stats: aggregate income transactions (airdrops, rewards, vesting)
      prisma.transaction.aggregate({ where: { ...statsWhere, is_income: true }, _count: true, _sum: { value_usd: true } }),
    ]);

    const otherCount = totalCount - buyCount - sellCount;
    const unlabelledCount = totalCount - identifiedTypeCount;
    const identifiedPercentage = totalCount > 0 ? Math.round((identifiedTypeCount / totalCount) * 100) : 0;
    const valueIdentifiedPercentage = totalCount > 0 ? Math.round((valueIdentifiedCount / totalCount) * 100) : 100;
    // Cost basis stats: totalCostBasis, totalProceeds (cost + gain), netGain
    const totalCostBasis = Math.abs(Number(disposalAgg._sum.cost_basis_usd || 0));
    const netGain = Number(disposalAgg._sum.gain_loss_usd || 0);
    const totalProceeds = totalCostBasis + netGain;

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
          totalCostBasis,
          totalProceeds,
          netGain,
        },
        income: {
          count: incomeAgg._count,
          totalValueUsd: Number(incomeAgg._sum.value_usd || 0),
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
