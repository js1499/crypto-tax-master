import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { rateLimitAPI, createRateLimitResponse } from "@/lib/rate-limit";

/**
 * GET /api/wallets/suggestions
 * Suggest counterparty wallet addresses that frequently interact with user's wallets.
 * Useful for discovering wallets the user owns but hasn't connected yet.
 */
export async function GET(request: NextRequest) {
  try {
    // Rate limiting
    const rateLimitResult = rateLimitAPI(request, 30); // 30 requests per minute
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

    // Get user's wallet addresses
    const userWallets = await prisma.wallet.findMany({
      where: { userId: user.id },
      select: { address: true },
    });

    const walletAddresses = userWallets.map((w) => w.address);
    if (walletAddresses.length === 0) {
      return NextResponse.json({ suggestions: [] });
    }

    // Find counterparty addresses with high interaction counts
    const candidates = await prisma.$queryRawUnsafe(
      `
      SELECT
        counterparty_address,
        COUNT(*)::int as txn_count,
        ROUND(SUM(ABS(value_usd)::numeric), 2) as total_value,
        COUNT(*) FILTER (WHERE type = 'TRANSFER_IN')::int as in_count,
        COUNT(*) FILTER (WHERE type = 'TRANSFER_OUT')::int as out_count,
        MODE() WITHIN GROUP (ORDER BY chain) as chain
      FROM transactions
      WHERE wallet_address = ANY($1::text[])
        AND counterparty_address IS NOT NULL
        AND counterparty_address != ''
        AND counterparty_address NOT IN (SELECT address FROM "Wallet" WHERE "userId" = $2)
        AND type IN ('TRANSFER_IN', 'TRANSFER_OUT')
      GROUP BY counterparty_address
      HAVING COUNT(*) >= 100 AND SUM(ABS(value_usd)::numeric) > 5000
      ORDER BY COUNT(*) * SUM(ABS(value_usd)::numeric) DESC
      LIMIT 10
      `,
      walletAddresses,
      user.id
    ) as Array<{
      counterparty_address: string;
      txn_count: number;
      total_value: number;
      in_count: number;
      out_count: number;
      chain: string | null;
    }>;

    if (candidates.length === 0) {
      return NextResponse.json({ suggestions: [] });
    }

    // Filter out addresses that interact with 3+ distinct wallet addresses (likely protocols)
    const candidateAddresses = candidates.map((c) => c.counterparty_address);

    const protocolAddresses = await prisma.$queryRawUnsafe(
      `
      SELECT counterparty_address
      FROM transactions
      WHERE counterparty_address = ANY($1::text[])
      GROUP BY counterparty_address
      HAVING COUNT(DISTINCT wallet_address) >= 3
      `,
      candidateAddresses
    ) as Array<{ counterparty_address: string }>;

    const protocolSet = new Set(protocolAddresses.map((p) => p.counterparty_address));

    // Score and filter results
    const suggestions = candidates
      .filter((c) => !protocolSet.has(c.counterparty_address))
      .map((c) => {
        // Boost score for bidirectional transfers (both IN and OUT)
        const bidirectionalBoost = c.in_count > 0 && c.out_count > 0 ? 1.5 : 1;
        const score =
          c.txn_count * Number(c.total_value) * bidirectionalBoost;
        return {
          address: c.counterparty_address,
          txnCount: c.txn_count,
          totalValue: Number(c.total_value),
          inCount: c.in_count,
          outCount: c.out_count,
          chain: c.chain || "solana",
          score,
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(({ score, ...rest }) => rest); // Remove internal score from response

    return NextResponse.json({ suggestions });
  } catch (error) {
    console.error("[Wallet Suggestions API] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch wallet suggestions" },
      { status: 500 }
    );
  }
}
