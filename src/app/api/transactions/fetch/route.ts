import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { fetchWalletTransactions } from "@/lib/blockchain-apis";
import { getCurrentUser } from "@/lib/auth-helpers";
import { rateLimitAPI, createRateLimitResponse, rateLimitByUser } from "@/lib/rate-limit";
import * as Sentry from "@sentry/nextjs";

const prisma = new PrismaClient();

// Configure for long-running operations on Vercel
export const maxDuration = 300; // 5 minutes max execution time (Vercel Pro limit)
export const runtime = 'nodejs';

/**
 * POST /api/transactions/fetch
 * Fetch transactions from blockchain APIs and store them in the database
 * Body: { address: string, chain: "ethereum" | "solana" }
 */
export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const rateLimitResult = rateLimitAPI(request, 10); // 10 fetches per minute
    if (!rateLimitResult.success) {
      return createRateLimitResponse(
        rateLimitResult.remaining,
        rateLimitResult.reset
      );
    }
    
    // Get user authentication via NextAuth
    const user = await getCurrentUser();
    
    if (!user) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }
    
    // Additional rate limiting by user
    const userRateLimit = rateLimitByUser(user.id, 5); // 5 fetches per minute per user
    if (!userRateLimit.success) {
      return createRateLimitResponse(
        userRateLimit.remaining,
        userRateLimit.reset
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
            fee_usd: tx.fee_usd || null,
            wallet_address: tx.wallet_address,
            counterparty_address: tx.counterparty_address,
            tx_hash: tx.tx_hash,
            chain: chain,
            block_number: tx.block_number,
            tx_timestamp: tx.tx_timestamp,
            identified: false, // User needs to review and identify
            // Swap fields (if available from blockchain API parsing)
            incoming_asset_symbol: (tx as any).incoming_asset_symbol || null,
            incoming_amount_value: (tx as any).incoming_amount_value || null,
            incoming_value_usd: (tx as any).incoming_value_usd || null,
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
    
    // Capture error in Sentry
    Sentry.captureException(error, {
      tags: {
        endpoint: "/api/transactions/fetch",
      },
    });
    
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

