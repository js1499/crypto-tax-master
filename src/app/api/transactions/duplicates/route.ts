import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { rateLimitAPI, createRateLimitResponse } from "@/lib/rate-limit";
import * as Sentry from "@sentry/nextjs";

const prisma = new PrismaClient();

/**
 * GET /api/transactions/duplicates
 * Find potential duplicate transactions
 * Query params:
 *   - threshold: Similarity threshold (0-1, default: 0.95)
 *   - maxResults: Maximum number of duplicate groups to return (default: 50)
 */
export async function GET(request: NextRequest) {
  try {
    // Rate limiting
    const rateLimitResult = rateLimitAPI(request, 50);
    if (!rateLimitResult.success) {
      return createRateLimitResponse(
        rateLimitResult.remaining,
        rateLimitResult.reset
      );
    }

    // Get user authentication
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    // Parse query parameters
    const searchParams = request.nextUrl.searchParams;
    const threshold = parseFloat(searchParams.get("threshold") || "0.95");
    const maxResults = parseInt(searchParams.get("maxResults") || "50");

    // Get user's wallets
    const userWithWallets = await prisma.user.findUnique({
      where: { id: user.id },
      include: { wallets: true },
    });

    if (!userWithWallets || userWithWallets.wallets.length === 0) {
      return NextResponse.json({
        status: "success",
        duplicates: [],
        message: "No wallets found",
      });
    }

    const walletAddresses = userWithWallets.wallets.map((w) => w.address);

    // Fetch all user transactions
    const transactions = await prisma.transaction.findMany({
      where: {
        wallet_address: { in: walletAddresses },
      },
      select: {
        id: true,
        type: true,
        asset_symbol: true,
        amount_value: true,
        value_usd: true,
        tx_timestamp: true,
        tx_hash: true,
        source: true,
      },
      orderBy: {
        tx_timestamp: "desc",
      },
    });

    // Find duplicates based on:
    // 1. Same tx_hash (exact duplicates)
    // 2. Same asset, amount, timestamp (within 1 minute), and source
    const duplicateGroups: Array<{
      ids: number[];
      reason: string;
      similarity: number;
    }> = [];

    const processed = new Set<number>();

    for (let i = 0; i < transactions.length; i++) {
      if (processed.has(transactions[i].id)) continue;

      const tx1 = transactions[i];
      const group = [tx1.id];
      let reason = "";
      let maxSimilarity = 1.0;

      // Check for exact hash duplicates
      if (tx1.tx_hash) {
        for (let j = i + 1; j < transactions.length; j++) {
          const tx2 = transactions[j];
          if (tx2.tx_hash && tx1.tx_hash === tx2.tx_hash) {
            group.push(tx2.id);
            reason = "Same transaction hash";
            processed.add(tx2.id);
          }
        }
      }

      // If no hash duplicates, check for similar transactions
      if (group.length === 1) {
        for (let j = i + 1; j < transactions.length; j++) {
          const tx2 = transactions[j];
          if (processed.has(tx2.id)) continue;

          // Calculate similarity
          let similarity = 0;
          let matches = 0;
          let total = 0;

          // Same asset
          if (tx1.asset_symbol === tx2.asset_symbol) {
            matches++;
          }
          total++;

          // Same type
          if (tx1.type === tx2.type) {
            matches++;
          }
          total++;

          // Same source
          if (tx1.source === tx2.source) {
            matches++;
          }
          total++;

          // Amount within 1% (for rounding differences)
          const amount1 = Number(tx1.amount_value);
          const amount2 = Number(tx2.amount_value);
          const amountDiff = Math.abs(amount1 - amount2) / Math.max(amount1, amount2);
          if (amountDiff < 0.01) {
            matches++;
          }
          total++;

          // Timestamp within 1 minute
          const timeDiff = Math.abs(
            tx1.tx_timestamp.getTime() - tx2.tx_timestamp.getTime()
          );
          if (timeDiff < 60000) {
            matches++;
          }
          total++;

          similarity = matches / total;

          if (similarity >= threshold) {
            group.push(tx2.id);
            reason = `Similar transactions (${Math.round(similarity * 100)}% match)`;
            maxSimilarity = Math.min(maxSimilarity, similarity);
            processed.add(tx2.id);
          }
        }
      }

      if (group.length > 1) {
        duplicateGroups.push({
          ids: group,
          reason,
          similarity: maxSimilarity,
        });
      }

      processed.add(tx1.id);
    }

    // Sort by similarity (highest first) and limit results
    duplicateGroups.sort((a, b) => b.similarity - a.similarity);
    const limitedGroups = duplicateGroups.slice(0, maxResults);

    return NextResponse.json({
      status: "success",
      duplicates: limitedGroups,
      totalGroups: duplicateGroups.length,
      totalDuplicates: duplicateGroups.reduce(
        (sum, group) => sum + group.ids.length - 1,
        0
      ),
    });
  } catch (error) {
    console.error("[Find Duplicates API] Error:", error);

    Sentry.captureException(error, {
      tags: {
        endpoint: "/api/transactions/duplicates",
      },
    });

    return NextResponse.json(
      {
        error: "Failed to find duplicates",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}
