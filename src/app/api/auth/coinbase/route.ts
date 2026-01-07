import { NextRequest, NextResponse } from "next/server";

/**
 * Initiates the Coinbase OAuth2 authorization flow
 * Using login.coinbase.com OAuth endpoints as per documentation
 */
export async function GET(request: NextRequest) {
  console.log("[Coinbase Auth] Initiating OAuth flow");
  
  const clientId = process.env.COINBASE_CLIENT_ID;
  const redirectUri = process.env.COINBASE_REDIRECT_URI;
  
  if (!clientId || !redirectUri) {
    console.error("[Coinbase Auth] OAuth configuration missing", { clientId: !!clientId, redirectUri: !!redirectUri });
    return NextResponse.json(
      { error: "OAuth configuration missing" },
      { status: 500 }
    );
  }

  // Define the scopes we need for accessing user's Coinbase data
  // Added offline_access scope to receive refresh tokens
  const scopes = [
    "wallet:accounts:read",
    "wallet:transactions:read",
    "wallet:user:read",
    "offline_access"
  ];

  console.log("[Coinbase Auth] Using scopes:", scopes.join(", "));

  // Construct the authorization URL with the correct login.coinbase.com domain
  const authUrl = new URL("https://login.coinbase.com/oauth2/auth");
  authUrl.searchParams.append("client_id", clientId);
  authUrl.searchParams.append("redirect_uri", redirectUri);
  authUrl.searchParams.append("response_type", "code");
  authUrl.searchParams.append("scope", scopes.join(" "));
  
  // Generate a state parameter to prevent CSRF
  const state = Math.random().toString(36).substring(2, 15);
  authUrl.searchParams.append("state", state);
  
  console.log("[Coinbase Auth] Generated state parameter:", state);
  console.log("[Coinbase Auth] Redirecting to:", authUrl.toString());
  
  // Store the state in a cookie to verify when handling callback
  const response = NextResponse.redirect(authUrl.toString());
  response.cookies.set({
    name: "coinbase_oauth_state",
    value: state,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 10, // 10 minutes
    path: "/"
  });
  
  return response;
} 