import { NextRequest, NextResponse } from "next/server";
import { getCoinbaseAccounts, isTokenExpired, refreshAccessToken, CoinbaseTokens } from "@/lib/coinbase";

/**
 * API route to fetch Coinbase accounts 
 * Uses the stored tokens to authenticate with Coinbase API
 */
export async function GET(request: NextRequest) {
  console.log("[Coinbase Accounts API] Fetching accounts");
  
  try {
    // Get tokens from cookies
    const tokensCookie = request.cookies.get('coinbase_tokens')?.value;
    
    if (!tokensCookie) {
      console.error("[Coinbase Accounts API] No tokens found");
      return NextResponse.json(
        { error: "Not authenticated with Coinbase" },
        { status: 401 }
      );
    }
    
    // Parse tokens
    let tokens: CoinbaseTokens;
    try {
      tokens = JSON.parse(tokensCookie);
    } catch (e) {
      console.error("[Coinbase Accounts API] Failed to parse tokens", e);
      return NextResponse.json(
        { error: "Invalid token format" },
        { status: 401 }
      );
    }
    
    // Check if token is expired
    if (isTokenExpired(tokens)) {
      console.log("[Coinbase Accounts API] Access token expired, refreshing");
      try {
        // Refresh the token
        tokens = await refreshAccessToken(tokens.refresh_token);
        
        // Update the tokens cookie
        const response = NextResponse.next();
        response.cookies.set({
          name: 'coinbase_tokens',
          value: JSON.stringify({
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            expires_at: tokens.expires_at
          }),
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          maxAge: 60 * 60 * 24 * 7, // 7 days
          path: '/'
        });
      } catch (error) {
        console.error("[Coinbase Accounts API] Failed to refresh token:", error);
        return NextResponse.json(
          { error: "Failed to refresh authentication" },
          { status: 401 }
        );
      }
    }
    
    // Fetch accounts
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
      { error: "Failed to fetch Coinbase accounts" },
      { status: 500 }
    );
  }
} 