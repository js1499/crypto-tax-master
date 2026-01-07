import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens, getCoinbaseUser, getCoinbaseAccounts } from "@/lib/coinbase";
import { PrismaClient } from "@prisma/client";

// Initialize Prisma client
const prisma = new PrismaClient();

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
    
    // Create a secure, short-lived cookie with connection info
    // This is for demonstration - in production, use server-side session storage
    const response = NextResponse.redirect(new URL('/accounts?success=true', request.nextUrl.origin));
    
    // Store minimal connection data in secure cookie
    response.cookies.set({
      name: 'coinbase_connection',
      value: JSON.stringify({
        user_id: userData.id,
        username: userData.username,
        connected_at: new Date().toISOString(),
        accounts_count: accounts.length
      }),
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 30, // 30 minutes
      path: '/'
    });
    
    // Store tokens securely
    // Warning: In production, NEVER store tokens in cookies
    // This is only for demo purposes - use a secure database instead
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
    
    // Clear the state cookie
    response.cookies.set({
      name: 'coinbase_oauth_state',
      value: '',
      expires: new Date(0)
    });
    
    return response;
  } catch (error) {
    console.error("[Coinbase Callback] Error processing callback:", error);
    
    // Redirect back to accounts page with error
    return NextResponse.redirect(new URL('/accounts?error=token_exchange', request.nextUrl.origin));
  } finally {
    // Disconnect from Prisma to avoid connection leaking
    await prisma.$disconnect();
  }
} 