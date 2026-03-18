import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { rateLimitAPI, createRateLimitResponse } from "@/lib/rate-limit";
import * as Sentry from "@sentry/nextjs";

/**
 * API route to fetch user wallets from the database
 */
export async function GET(request: NextRequest) {
  console.log("[Wallets API] Fetching wallets");
  
  try {
    // Rate limiting - more lenient for initial page loads
    const rateLimitResult = rateLimitAPI(request, 100); // 100 requests per minute
    if (!rateLimitResult.success) {
      return createRateLimitResponse(
        rateLimitResult.remaining,
        rateLimitResult.reset
      );
    }
    // Get user authentication via NextAuth - pass request for proper Vercel session handling
    const user = await getCurrentUser(request);

    if (!user) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }
    
    // Find the user in our database with wallets
    const userWithWallets = await prisma.user.findUnique({
      where: { id: user.id },
      include: { wallets: true }
    });
    
    if (!userWithWallets) {
      console.error("[Wallets API] User not found in database");
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }
    
    // Count transactions per wallet address
    const walletAddresses = userWithWallets.wallets.map(w => w.address);
    const txCounts = walletAddresses.length > 0
      ? await prisma.transaction.groupBy({
          by: ['wallet_address'],
          _count: true,
          where: { wallet_address: { in: walletAddresses } },
        })
      : [];
    const txCountMap: Record<string, number> = {};
    for (const row of txCounts) {
      if (row.wallet_address) {
        txCountMap[row.wallet_address] = row._count;
      }
    }

    // Format the wallets for the frontend
    const wallets = userWithWallets.wallets.map(wallet => ({
      id: wallet.id,
      name: wallet.name,
      address: wallet.address,
      provider: wallet.provider,
      chains: wallet.chains,
      lastSyncAt: wallet.lastSyncAt,
      createdAt: wallet.createdAt,
      updatedAt: wallet.updatedAt,
      transactionCount: txCountMap[wallet.address] || 0,
    }));
    
    // Return the wallets
    return NextResponse.json({
      status: "success",
      wallets
    });
  } catch (error) {
    console.error("[Wallets API] Error fetching wallets:", error);
    return NextResponse.json(
      { error: "Failed to fetch wallets" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/wallets
 * Create a new wallet for the authenticated user
 */
export async function POST(request: NextRequest) {
  console.log("[Wallets API] Creating wallet");
  
  try {
    // Rate limiting
    const rateLimitResult = rateLimitAPI(request, 20); // 20 requests per minute
    if (!rateLimitResult.success) {
      return createRateLimitResponse(
        rateLimitResult.remaining,
        rateLimitResult.reset
      );
    }

    // Get user authentication - pass request for proper Vercel session handling
    const user = await getCurrentUser(request);

    if (!user) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { name, address, provider, chains } = body;

    // Validate required fields
    if (!name || !address || !provider) {
      return NextResponse.json(
        { error: "Missing required fields: name, address, and provider are required" },
        { status: 400 }
      );
    }

    // Validate address format based on provider
    if (provider.toLowerCase() === "solana") {
      // Solana address: base58, 32-44 characters
      if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) {
        return NextResponse.json(
          { error: "Invalid Solana wallet address. Must be a valid base58 address (32-44 characters)." },
          { status: 400 }
        );
      }
    } else {
      // Validate EVM address format for ethereum-based wallets
      const evmProviders = ["ethereum", "polygon", "bsc", "arbitrum", "optimism", "base", "avalanche", "fantom", "cronos", "gnosis", "linea", "evm"];
      if (evmProviders.includes(provider.toLowerCase()) && !/^0x[a-fA-F0-9]{40}$/.test(address)) {
        return NextResponse.json(
          { error: "Invalid EVM wallet address. Must start with 0x and be 42 characters long." },
          { status: 400 }
        );
      }
    }

    // Check if wallet already belongs to a different user
    const existing = await prisma.wallet.findUnique({
      where: { address_provider: { address, provider } },
    });
    if (existing && existing.userId !== user.id) {
      return NextResponse.json(
        { error: "This wallet is already connected to another account" },
        { status: 409 }
      );
    }

    // Create or update wallet (upsert to avoid duplicates)
    const wallet = await prisma.wallet.upsert({
      where: {
        address_provider: {
          address: address,
          provider: provider,
        },
      },
      update: {
        name: name,
        userId: user.id,
        chains: chains || null,
      },
      create: {
        name: name,
        address: address,
        provider: provider,
        chains: chains || null,
        userId: user.id,
      },
    });
    
    console.log("[Wallets API] Created/updated wallet:", wallet.id);
    
    // Return the created wallet
    return NextResponse.json({
      status: "success",
      wallet: {
        id: wallet.id,
        name: wallet.name,
        address: wallet.address,
        provider: wallet.provider,
        createdAt: wallet.createdAt,
        updatedAt: wallet.updatedAt,
      },
    });
  } catch (error: any) {
    console.error("[Wallets API] Error creating wallet:", error);
    
    Sentry.captureException(error, {
      tags: {
        endpoint: "/api/wallets",
        method: "POST",
      },
    });
    
    // Handle unique constraint violation
    if (error.code === "P2002") {
      return NextResponse.json(
        { error: "Wallet with this address and provider already exists" },
        { status: 409 }
      );
    }
    
    return NextResponse.json(
      {
        error: "Failed to create wallet",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/wallets?walletId=...
 * Disconnect (delete) a wallet and its transactions
 */
export async function DELETE(request: NextRequest) {
  console.log("[Wallets API] Deleting wallet");

  try {
    const rateLimitResult = rateLimitAPI(request, 20);
    if (!rateLimitResult.success) {
      return createRateLimitResponse(
        rateLimitResult.remaining,
        rateLimitResult.reset
      );
    }

    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    const walletId = request.nextUrl.searchParams.get("walletId");
    if (!walletId) {
      return NextResponse.json(
        { error: "Missing walletId parameter" },
        { status: 400 }
      );
    }

    const wallet = await prisma.wallet.findUnique({ where: { id: walletId } });
    if (!wallet) {
      return NextResponse.json(
        { error: "Wallet not found" },
        { status: 404 }
      );
    }
    if (wallet.userId !== user.id) {
      return NextResponse.json(
        { error: "Not authorized" },
        { status: 403 }
      );
    }

    // Delete associated transactions first, then the wallet
    const deletedTx = await prisma.transaction.deleteMany({
      where: { wallet_address: wallet.address },
    });
    await prisma.wallet.delete({ where: { id: walletId } });

    console.log("[Wallets API] Deleted wallet", walletId, "and", deletedTx.count, "transactions");

    return NextResponse.json({
      status: "success",
      deletedTransactions: deletedTx.count,
    });
  } catch (error) {
    console.error("[Wallets API] Error deleting wallet:", error);

    Sentry.captureException(error, {
      tags: { endpoint: "/api/wallets", method: "DELETE" },
    });

    return NextResponse.json(
      { error: "Failed to delete wallet" },
      { status: 500 }
    );
  }
}
