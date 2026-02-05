import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens, getCoinbaseUser, getCoinbaseAccounts } from "@/lib/coinbase";
import prisma from "@/lib/prisma";
import { encode } from "next-auth/jwt";
import { authOptions } from "@/lib/auth-config";
import { encryptApiKey } from "@/lib/exchange-clients";
import crypto from "crypto";

// Encryption key for OAuth tokens (PRD requires AES-256-GCM encryption at rest)
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString("hex");

/**
 * Handles the OAuth callback from Coinbase
 * Exchanges the authorization code for tokens and fetches user data
 */
export async function GET(request: NextRequest) {
  console.log("[Coinbase Callback] Received callback request");
  
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
    
    // Find or create the user in our database
    let user = await prisma.user.findUnique({
      where: { email: userData.email }
    });
    
    if (!user) {
      user = await prisma.user.create({
        data: {
          email: userData.email,
          name: userData.name || userData.username || 'Coinbase User'
        }
      });
      console.log("[Coinbase Callback] Created new user:", user.id);
    } else {
      console.log("[Coinbase Callback] Found existing user:", user.id);
    }
    
    // Store the Coinbase accounts as wallets in our database
    for (const account of accounts) {
      // Create or update the wallet in our database
      await prisma.wallet.upsert({
        where: {
          address_provider: {
            address: account.id,
            provider: 'coinbase'
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

    // Create a NextAuth session for the user by generating a JWT token
    // This allows users to be logged in automatically after Coinbase OAuth
    const secret = process.env.NEXTAUTH_SECRET;
    if (!secret) {
      console.error("[Coinbase Callback] NEXTAUTH_SECRET not set, cannot create session");
      return NextResponse.redirect(new URL('/login?error=config_error&message=Missing+NEXTAUTH_SECRET', request.nextUrl.origin));
    }

    // Create JWT token for NextAuth session
    const sessionToken = await encode({
      token: {
        id: user.id,
        sub: user.id,
        email: user.email,
        name: user.name,
        picture: user.image || null,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60), // 30 days
      },
      secret,
      maxAge: 30 * 24 * 60 * 60, // 30 days
    });

    console.log(`[Coinbase Callback] Created NextAuth session for user ${user.id}`);

    // Redirect to accounts page with success
    const response = NextResponse.redirect(new URL('/accounts?success=true&coinbase_connected=true', request.nextUrl.origin));

    // Set NextAuth session cookie
    // Use __Secure- prefix in production for enhanced security
    const isProduction = process.env.NODE_ENV === 'production';
    const cookieName = isProduction
      ? '__Secure-next-auth.session-token'
      : 'next-auth.session-token';

    response.cookies.set({
      name: cookieName,
      value: sessionToken,
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60, // 30 days
      path: '/'
    });

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