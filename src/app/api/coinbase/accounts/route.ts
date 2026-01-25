import { NextRequest, NextResponse } from "next/server";
import { getCoinbaseAccounts, refreshAccessToken, CoinbaseTokens } from "@/lib/coinbase";
import { getCurrentUser } from "@/lib/auth-helpers";
import { decryptApiKey, encryptApiKey } from "@/lib/exchange-clients";
import prisma from "@/lib/prisma";
import crypto from "crypto";

// Encryption key for OAuth tokens
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString("hex");

/**
 * API route to fetch Coinbase accounts
 * Uses tokens from database (not cookies) for proper authentication
 * PRD Requirement: GET /api/coinbase/accounts returns Coinbase accounts for current user
 */
export async function GET(request: NextRequest) {
  console.log("[Coinbase Accounts API] Fetching accounts");

  try {
    // Get authenticated user
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json(
        { error: "Not authenticated", code: "AUTH_REQUIRED" },
        { status: 401 }
      );
    }

    // Get Coinbase exchange connection from database
    const exchange = await prisma.exchange.findUnique({
      where: {
        name_userId: {
          name: "coinbase",
          userId: user.id,
        },
      },
    });

    if (!exchange || !exchange.refreshToken) {
      return NextResponse.json(
        { error: "Coinbase not connected", code: "NOT_CONNECTED" },
        { status: 401 }
      );
    }

    if (!exchange.isConnected) {
      return NextResponse.json(
        { error: "Coinbase connection expired. Please reconnect.", code: "RECONNECT_REQUIRED" },
        { status: 401 }
      );
    }

    // Decrypt the refresh token
    let refreshToken: string;
    try {
      refreshToken = decryptApiKey(exchange.refreshToken, ENCRYPTION_KEY);
    } catch (error) {
      console.error("[Coinbase Accounts API] Failed to decrypt token:", error);
      return NextResponse.json(
        { error: "Unable to access credentials. Please reconnect.", code: "DECRYPT_FAILED" },
        { status: 401 }
      );
    }

    // Refresh token to get new access token
    let tokens: CoinbaseTokens;
    try {
      tokens = await refreshAccessToken(refreshToken);

      // Persist refreshed tokens back to database
      const encryptedNewRefreshToken = encryptApiKey(tokens.refresh_token, ENCRYPTION_KEY);
      const encryptedNewAccessToken = encryptApiKey(tokens.access_token, ENCRYPTION_KEY);

      await prisma.exchange.update({
        where: { id: exchange.id },
        data: {
          refreshToken: encryptedNewRefreshToken,
          accessToken: encryptedNewAccessToken,
          tokenExpiresAt: new Date(tokens.expires_at || Date.now() + tokens.expires_in * 1000),
          isConnected: true,
        },
      });
    } catch (error) {
      console.error("[Coinbase Accounts API] Failed to refresh token:", error);

      // Mark connection as needing re-auth
      await prisma.exchange.update({
        where: { id: exchange.id },
        data: { isConnected: false },
      });

      return NextResponse.json(
        { error: "Coinbase connection expired. Please reconnect.", code: "TOKEN_REFRESH_FAILED" },
        { status: 401 }
      );
    }

    // Fetch accounts from Coinbase API
    const accounts = await getCoinbaseAccounts(tokens.access_token);

    // Process and format account data for the frontend
    const formattedAccounts = accounts.map(account => ({
      id: account.id,
      name: account.name,
      type: account.type,
      currency: account.currency.code,
      balance: {
        amount: account.balance.amount,
        currency: account.balance.currency,
        formatted: `${account.balance.amount} ${account.balance.currency}`
      },
      created_at: account.created_at,
      updated_at: account.updated_at
    }));

    // Return the accounts
    return NextResponse.json({
      status: "success",
      accounts: formattedAccounts
    });
  } catch (error) {
    console.error("[Coinbase Accounts API] Error fetching accounts:", error);
    return NextResponse.json(
      { error: "Failed to fetch Coinbase accounts", code: "FETCH_FAILED" },
      { status: 500 }
    );
  }
} 