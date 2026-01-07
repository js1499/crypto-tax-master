import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { fetchWalletTransactions } from "@/lib/blockchain-apis";
import { CoinbaseUser } from "@/lib/coinbase";

const prisma = new PrismaClient();

/**
 * POST /api/transactions/fetch
 * Fetch transactions from blockchain APIs and store them in the database
 * Body: { address: string, chain: "ethereum" | "solana" }
 */
export async function POST(request: NextRequest) {
  try {
    // Get user authentication
    const tokensCookie = request.cookies.get("coinbase_tokens")?.value;
    if (!tokensCookie) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    // Get user info from Coinbase
    const coinbaseUser = await getCoinbaseUserFromTokens(tokensCookie);
    if (!coinbaseUser || !coinbaseUser.email) {
      return NextResponse.json(
        { error: "Could not identify user" },
        { status: 401 }
      );
    }

    // Find user in database
    const user = await prisma.user.findUnique({
      where: { email: coinbaseUser.email },
    });

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { address, chain } = body;

    if (!address || !chain) {
      return NextResponse.json(
        { error: "Missing required fields: address and chain" },
        { status: 400 }
      );
    }

    if (chain !== "ethereum" && chain !== "solana") {
      return NextResponse.json(
        { error: "Invalid chain. Must be 'ethereum' or 'solana'" },
        { status: 400 }
      );
    }

    // Validate address format (basic validation)
    if (chain === "ethereum" && !address.match(/^0x[a-fA-F0-9]{40}$/)) {
      return NextResponse.json(
        { error: "Invalid Ethereum address format" },
        { status: 400 }
      );
    }

    if (chain === "solana" && !address.match(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/)) {
      return NextResponse.json(
        { error: "Invalid Solana address format" },
        { status: 400 }
      );
    }

    // Fetch transactions from blockchain API
    console.log(`Fetching ${chain} transactions for address: ${address}`);
    const transactions = await fetchWalletTransactions(address, chain);

    if (transactions.length === 0) {
      return NextResponse.json({
        status: "success",
        message: "No transactions found",
        transactionsAdded: 0,
        transactionsSkipped: 0,
      });
    }

    // Store or update transactions in database
    let added = 0;
    let skipped = 0;

    for (const tx of transactions) {
      try {
        // Check if transaction already exists (by tx_hash)
        const existing = await prisma.transaction.findUnique({
          where: { tx_hash: tx.tx_hash },
        });

        if (existing) {
          skipped++;
          continue;
        }

        // Create new transaction
        await prisma.transaction.create({
          data: {
            type: tx.type,
            status: tx.status,
            source: chain === "ethereum" ? "Etherscan" : "Solscan",
            source_type: "blockchain_api",
            asset_symbol: tx.asset_symbol,
            asset_chain: chain,
            amount_value: tx.amount_value,
            price_per_unit: tx.price_per_unit,
            value_usd: tx.value_usd,
            wallet_address: tx.wallet_address,
            counterparty_address: tx.counterparty_address,
            tx_hash: tx.tx_hash,
            chain: chain,
            block_number: tx.block_number,
            tx_timestamp: tx.tx_timestamp,
            identified: false, // User needs to review and identify
          },
        });

        added++;
      } catch (error) {
        console.error(`Error saving transaction ${tx.tx_hash}:`, error);
        // Continue with next transaction
      }
    }

    // Update or create wallet record
    const walletProvider = chain === "ethereum" ? "ethereum" : "solana";
    await prisma.wallet.upsert({
      where: {
        address_provider: {
          address: address,
          provider: walletProvider,
        },
      },
      update: {
        updatedAt: new Date(),
      },
      create: {
        name: `${chain.charAt(0).toUpperCase() + chain.slice(1)} Wallet`,
        address: address,
        provider: walletProvider,
        userId: user.id,
      },
    });

    return NextResponse.json({
      status: "success",
      message: `Fetched ${transactions.length} transactions`,
      transactionsAdded: added,
      transactionsSkipped: skipped,
      totalTransactions: transactions.length,
    });
  } catch (error) {
    console.error("[Fetch Transactions API] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch transactions",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}

// Helper function to get Coinbase user from tokens
async function getCoinbaseUserFromTokens(
  tokensCookie: string
): Promise<CoinbaseUser | null> {
  try {
    const { getCoinbaseUser, isTokenExpired, refreshAccessToken } =
      await import("@/lib/coinbase");
    const tokens = JSON.parse(tokensCookie);

    let accessToken = tokens.access_token;

    // Refresh token if expired
    if (isTokenExpired(tokens)) {
      console.log("[Fetch Transactions API] Access token expired, refreshing");
      const newTokens = await refreshAccessToken(tokens.refresh_token);
      accessToken = newTokens.access_token;
    }

    return await getCoinbaseUser(accessToken);
  } catch (error) {
    console.error("[Fetch Transactions API] Error getting user from tokens:", error);
    return null;
  }
}
