import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { calculateTaxReport, formatTaxReport } from "@/lib/tax-calculator";
import { CoinbaseUser } from "@/lib/coinbase";

const prisma = new PrismaClient();

/**
 * GET /api/tax-reports?year=2023
 * Calculate tax report for a given year
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const year = parseInt(searchParams.get("year") || new Date().getFullYear().toString());
    
    if (isNaN(year) || year < 2000 || year > 2100) {
      return NextResponse.json(
        { error: "Invalid year parameter" },
        { status: 400 }
      );
    }

    // Get user authentication (similar to wallets route)
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
      include: { wallets: true },
    });

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // Get user's wallet addresses
    const walletAddresses = user.wallets.map((w) => w.address);

    // Calculate tax report using user's wallet addresses
    // If user has no wallets, pass empty array (will calculate for all transactions)
    // In production, you might want to require at least one wallet
    const report = await calculateTaxReport(
      prisma,
      walletAddresses.length > 0 ? walletAddresses : [],
      year,
      "FIFO"
    );

    // Format the report for frontend
    const formattedReport = formatTaxReport(report);

    return NextResponse.json({
      status: "success",
      year,
      report: {
        ...formattedReport,
        detailed: {
          taxableEvents: report.taxableEvents.map((e) => ({
            id: e.id,
            date: e.date.toISOString(),
            asset: e.asset,
            amount: e.amount,
            proceeds: e.proceeds,
            costBasis: e.costBasis,
            gainLoss: e.gainLoss,
            holdingPeriod: e.holdingPeriod,
            chain: e.chain,
            txHash: e.txHash,
          })),
          incomeEvents: report.incomeEvents.map((e) => ({
            id: e.id,
            date: e.date.toISOString(),
            asset: e.asset,
            amount: e.amount,
            valueUsd: e.valueUsd,
            type: e.type,
            chain: e.chain,
            txHash: e.txHash,
          })),
        },
      },
    });
  } catch (error) {
    console.error("[Tax Reports API] Error calculating tax report:", error);
    return NextResponse.json(
      { error: "Failed to calculate tax report", details: error instanceof Error ? error.message : "Unknown error" },
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
      console.log("[Tax Reports API] Access token expired, refreshing");
      const newTokens = await refreshAccessToken(tokens.refresh_token);
      accessToken = newTokens.access_token;
    }

    return await getCoinbaseUser(accessToken);
  } catch (error) {
    console.error("[Tax Reports API] Error getting user from tokens:", error);
    return null;
  }
}
