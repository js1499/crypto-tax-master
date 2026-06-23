import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens, getCoinbaseUser, getCoinbaseAccounts } from "@/lib/coinbase";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { encryptApiKey } from "@/lib/exchange-clients";

// Encryption key for OAuth tokens (PRD requires AES-256-GCM encryption at rest)
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

/**
 * Handles the OAuth callback from Coinbase
 * Exchanges the authorization code for tokens and fetches user data
 */
export async function GET(request: NextRequest) {
  console.log("[Coinbase Callback] Received callback request");

  if (!ENCRYPTION_KEY) {
    return NextResponse.json({ error: "Server configuration error" }, { status: 503 });
  }

  // Get the authorization code and state from URL
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  
  // Get the state from cookie for verification
  const cookieState = request.cookies.get('coinbase_oauth_state')?.value;
  
  // Verify state parameter to prevent CSRF attacks
  if (!state || !cookieState || state !== cookieState) {
    console.error("[Coinbase Callback] State verification failed", { 
      state, 
      cookieState, 
      match: state === cookieState 
    });
    return NextResponse.redirect(new URL('/accounts?error=invalid_state', request.nextUrl.origin));
  }
  
  // Verify code parameter
  if (!code) {
    console.error("[Coinbase Callback] No authorization code provided");
    return NextResponse.redirect(new URL('/accounts?error=no_code', request.nextUrl.origin));
  }
  
  try {
    // Exchange the code for tokens
    const tokens = await exchangeCodeForTokens(code);
    
    // Get user data
    const userData = await getCoinbaseUser(tokens.access_token);
    console.log("[Coinbase Callback] User authenticated:", userData.name);
    
    // Get account data
    const accounts = await getCoinbaseAccounts(tokens.access_token);
    console.log("[Coinbase Callback] Retrieved accounts:", accounts.length);
    
    // SECURITY: Coinbase OAuth must LINK to the already-signed-in user. We never
    // create or log into an account from the Coinbase-provided email — doing so
    // allowed account takeover when a Coinbase email was unverified or reused.
    const user = await getCurrentUser(request);
    if (!user) {
      console.warn("[Coinbase Callback] No signed-in user; refusing to link Coinbase by email.");
      return NextResponse.redirect(
        new URL('/login?error=signin_required&message=Please+sign+in+before+connecting+Coinbase', request.nextUrl.origin)
      );
    }
    console.log("[Coinbase Callback] Linking Coinbase to signed-in user:", user.id);
    
    // Store the Coinbase accounts as wallets in our database
    for (const account of accounts) {
      // Create or update the wallet in our database
      await prisma.wallet.upsert({
        where: {
          address_provider_userId: {
            address: account.id,
            provider: 'coinbase',
            userId: user.id,
          }
        },
        update: {
          name: account.name,
          userId: user.id,
          // You could update additional fields here if needed
        },
        create: {
          name: account.name,
          address: account.id, // Using Coinbase account ID as the address
          provider: 'coinbase',
          userId: user.id,
        }
      });
    }
    
    console.log(`[Coinbase Callback] Stored ${accounts.length} wallets for user ${user.id}`);

    // Encrypt tokens before storing (PRD Security requirement: AES-256-GCM encryption at rest)
    const encryptedRefreshToken = encryptApiKey(tokens.refresh_token, ENCRYPTION_KEY);
    const encryptedAccessToken = encryptApiKey(tokens.access_token, ENCRYPTION_KEY);

    // Store Coinbase exchange connection with encrypted tokens
    // Clear any previous API key credentials to ensure OAuth flow is used
    await prisma.exchange.upsert({
      where: {
        name_userId: {
          name: "coinbase",
          userId: user.id,
        },
      },
      update: {
        refreshToken: encryptedRefreshToken,
        accessToken: encryptedAccessToken,
        tokenExpiresAt: new Date(tokens.expires_at || Date.now() + tokens.expires_in * 1000),
        isConnected: true,
        updatedAt: new Date(),
        // Clear any previous API key auth to ensure OAuth is used
        apiKey: null,
        apiSecret: null,
        apiPassphrase: null,
      },
      create: {
        name: "coinbase",
        refreshToken: encryptedRefreshToken,
        accessToken: encryptedAccessToken,
        tokenExpiresAt: new Date(tokens.expires_at || Date.now() + tokens.expires_in * 1000),
        isConnected: true,
        userId: user.id,
      },
    });

    console.log(`[Coinbase Callback] Stored Coinbase exchange connection for user ${user.id}`);

    // The user is already signed in (we LINK Coinbase, we don't log anyone in),
    // so just redirect back to the accounts page — no session is minted here.
    const response = NextResponse.redirect(new URL('/accounts?success=true&coinbase_connected=true', request.nextUrl.origin));

    // Clear the state cookie
    response.cookies.set({
      name: 'coinbase_oauth_state',
      value: '',
      expires: new Date(0)
    });

    // Clear any legacy cookies that might exist
    response.cookies.set({
      name: 'coinbase_tokens',
      value: '',
      expires: new Date(0)
    });
    response.cookies.set({
      name: 'coinbase_connection',
      value: '',
      expires: new Date(0)
    });

    return response;
  } catch (error) {
    console.error("[Coinbase Callback] Error processing callback:", error);
    
    // Redirect back to accounts page with error
    return NextResponse.redirect(new URL('/accounts?error=token_exchange', request.nextUrl.origin));
  }
} 