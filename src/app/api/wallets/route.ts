import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { CoinbaseUser } from "@/lib/coinbase";

// Initialize Prisma client
const prisma = new PrismaClient();

/**
 * API route to fetch user wallets from the database
 */
export async function GET(request: NextRequest) {
  console.log("[Wallets API] Fetching wallets");
  
  try {
    // Get user info from cookies
    const connectionCookie = request.cookies.get('coinbase_connection')?.value;
    
    if (!connectionCookie) {
      console.log("[Wallets API] No connection data found, returning empty wallet list");
      return NextResponse.json({
        status: "success",
        wallets: []
      });
    }
    /*rebuild*/
    // Parse connection data
    let connectionData;
    try {
      connectionData = JSON.parse(connectionCookie);
    } catch (e) {
      console.error("[Wallets API] Failed to parse connection data", e);
      return NextResponse.json(
        { error: "Invalid connection data" },
        { status: 400 }
      );
    }
    
    // Get the user's email from the tokens cookie to identify them
    const tokensCookie = request.cookies.get('coinbase_tokens')?.value;
    if (!tokensCookie) {
      console.error("[Wallets API] No tokens found");
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }
    
    // Fetch user info from Coinbase API to get their email
    const coinbaseUser = await getCoinbaseUserFromTokens(tokensCookie);
    if (!coinbaseUser || !coinbaseUser.email) {
      console.error("[Wallets API] Could not identify user");
      return NextResponse.json(
        { error: "Could not identify user" },
        { status: 401 }
      );
    }
    
    // Find the user in our database
    const user = await prisma.user.findUnique({
      where: { email: coinbaseUser.email },
      include: { wallets: true }
    });
    
    if (!user) {
      console.error("[Wallets API] User not found in database");
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }
    
    // Format the wallets for the frontend
    const wallets = user.wallets.map(wallet => ({
      id: wallet.id,
      name: wallet.name,
      address: wallet.address,
      provider: wallet.provider,
      createdAt: wallet.createdAt,
      updatedAt: wallet.updatedAt
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
  } finally {
    // Disconnect from Prisma to avoid connection leaking
    await prisma.$disconnect();
  }
}

// Helper function to get Coinbase user from tokens
async function getCoinbaseUserFromTokens(tokensCookie: string): Promise<CoinbaseUser | null> {
  try {
    const { getCoinbaseUser, isTokenExpired, refreshAccessToken } = await import("@/lib/coinbase");
    const tokens = JSON.parse(tokensCookie);
    
    let accessToken = tokens.access_token;
    
    // Refresh token if expired
    if (isTokenExpired(tokens)) {
      console.log("[Wallets API] Access token expired, refreshing");
      const newTokens = await refreshAccessToken(tokens.refresh_token);
      accessToken = newTokens.access_token;
    }
    
    return await getCoinbaseUser(accessToken);
  } catch (error) {
    console.error("[Wallets API] Error getting user from tokens:", error);
    return null;
  }
} 