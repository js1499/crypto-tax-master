import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { rateLimitAPI, createRateLimitResponse, rateLimitByUser } from "@/lib/rate-limit";
import * as Sentry from "@sentry/nextjs";
import { encryptApiKey } from "@/lib/exchange-clients";
import { BinanceClient, KrakenClient, KuCoinClient, GeminiClient } from "@/lib/exchange-clients";
import { generateCoinbaseJWT } from "@/lib/coinbase-signer";

// Encryption key - REQUIRED in production
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
if (!ENCRYPTION_KEY) {
  console.error("[CRITICAL] ENCRYPTION_KEY environment variable is not set!");
}

/**
 * POST /api/exchanges/connect
 * Connect an exchange by storing API credentials
 * Body: {
 *   exchange: "binance" | "kraken" | "kucoin" | "gemini" | "coinbase",
 *   apiKey?: string,
 *   apiSecret?: string,
 *   apiPassphrase?: string (for KuCoin),
 *   refreshToken?: string (for Coinbase OAuth)
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // Verify encryption key is available
    if (!ENCRYPTION_KEY) {
      console.error("[Exchange Connect] ENCRYPTION_KEY not configured");
      return NextResponse.json(
        { error: "Server configuration error. Please contact support." },
        { status: 500 }
      );
    }

    // Rate limiting
    const rateLimitResult = rateLimitAPI(request, 20); // 20 connections per minute
    if (!rateLimitResult.success) {
      return createRateLimitResponse(
        rateLimitResult.remaining,
        rateLimitResult.reset
      );
    }

    // Get user authentication - pass request for proper Vercel session handling
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    // Additional rate limiting by user
    const userRateLimit = rateLimitByUser(user.id, 10); // 10 connections per minute per user
    if (!userRateLimit.success) {
      return createRateLimitResponse(
        userRateLimit.remaining,
        userRateLimit.reset
      );
    }

    // Parse request body
    const body = await request.json();
    const { exchange, apiKey, apiSecret, apiPassphrase, refreshToken } = body;

    if (!exchange) {
      return NextResponse.json(
        { error: "Missing exchange name" },
        { status: 400 }
      );
    }

    const exchangeName = exchange.toLowerCase();
    const validExchanges = ["binance", "kraken", "kucoin", "gemini", "coinbase"];

    if (!validExchanges.includes(exchangeName)) {
      return NextResponse.json(
        { error: `Invalid exchange. Must be one of: ${validExchanges.join(", ")}` },
        { status: 400 }
      );
    }

    // Validate credentials based on exchange
    if (exchangeName === "coinbase") {
      // Coinbase supports both OAuth (refreshToken) and API Key authentication
      if (!refreshToken && (!apiKey || !apiSecret)) {
        return NextResponse.json(
          { error: "Coinbase requires either OAuth refresh token or API key/secret" },
          { status: 400 }
        );
      }

      // If API key is provided, validate it by making a test request using CDP JWT auth
      if (apiKey && apiSecret) {
        try {
          const axios = (await import("axios")).default;

          // Validate by signing a CDP JWT (auto-detects EC vs Ed25519 — no manual PEM
          // formatting required) and calling /v2/user. The raw secret is stored as-is;
          // the signer re-normalizes it on every use (connect + sync).
          const token = generateCoinbaseJWT(apiKey, apiSecret, "GET", "api.coinbase.com", "/v2/user");

          const response = await axios.get("https://api.coinbase.com/v2/user", {
            headers: {
              "Authorization": `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          });

          if (!response.data || !response.data.data) {
            throw new Error("Invalid API response");
          }

          console.log(`[Exchange Connect] Coinbase CDP API key validated for user: ${response.data.data.email || response.data.data.name}`);
        } catch (error) {
          console.error(`[Exchange Connect] Coinbase API key validation failed:`, error);

          // Provide helpful error messages
          let errorMessage = "Invalid Coinbase API credentials.";
          const errorDetails = error instanceof Error ? error.message : "Unknown error";

          if (errorDetails.includes("secretOrPrivateKey") || errorDetails.includes("DECODER") || errorDetails.includes("PEM") || errorDetails.includes("asymmetric")) {
            errorMessage = "Could not read your Coinbase private key. Paste it exactly as Coinbase provides it (EC or Ed25519) — no extra formatting needed.";
          } else if (errorDetails.includes("401")) {
            errorMessage = "Authentication failed. Please ensure you're using a valid CDP API Key Name and Private Key from the Coinbase Developer Platform.";
          }

          return NextResponse.json(
            {
              error: errorMessage,
              details: errorDetails,
            },
            { status: 400 }
          );
        }
      }
    } else {
      if (!apiKey || !apiSecret) {
        return NextResponse.json(
          { error: "API key and secret are required" },
          { status: 400 }
        );
      }

      // Test connection by making a test API call
      try {
        switch (exchangeName) {
          case "binance":
            const binanceClient = new BinanceClient(apiKey, apiSecret);
            await binanceClient.getAccountInfo();
            break;
          case "kraken":
            const krakenClient = new KrakenClient(apiKey, apiSecret);
            await krakenClient.testConnection();
            break;
          case "kucoin":
            if (!apiPassphrase) {
              return NextResponse.json(
                { error: "KuCoin requires API passphrase" },
                { status: 400 }
              );
            }
            // Detect sandbox keys (sandbox API keys might have different patterns)
            const isKuCoinSandbox = apiKey.includes("sandbox") || process.env.KUCOIN_SANDBOX === "true";
            const kucoinClient = new KuCoinClient(apiKey, apiSecret, apiPassphrase, isKuCoinSandbox);
            await kucoinClient.testConnection();
            if (isKuCoinSandbox) {
              console.log("[Exchange Connect] KuCoin SANDBOX connection validated");
            }
            break;
          case "gemini":
            // Detect sandbox keys (they start with "master-" or from sandbox domain)
            const isSandbox = apiKey.startsWith("master-") || apiKey.includes("sandbox");
            const geminiClient = new GeminiClient(apiKey, apiSecret, isSandbox);
            await geminiClient.testConnection();
            if (isSandbox) {
              console.log("[Exchange Connect] Gemini SANDBOX connection validated");
            }
            break;
        }
      } catch (error) {
        // Log error only in development
        if (process.env.NODE_ENV === "development") {
          console.error(`[Exchange Connect] Test connection failed for ${exchangeName}:`, error);
        }
        return NextResponse.json(
          {
            error: "Invalid API credentials. Please check your API key and secret.",
            details: process.env.NODE_ENV === "development" ? (error instanceof Error ? error.message : "Unknown error") : "An internal error occurred",
          },
          { status: 400 }
        );
      }
    }

    // Encrypt credentials. Store the secret as the user provided it (trimmed); the Coinbase
    // signer normalizes any format (EC/Ed25519, PEM/base64) on every use (connect + sync).
    const encryptedApiKey = apiKey ? encryptApiKey(apiKey, ENCRYPTION_KEY) : null;
    const secretToEncrypt = apiSecret ? apiSecret.trim() : null;
    const encryptedApiSecret = secretToEncrypt ? encryptApiKey(secretToEncrypt, ENCRYPTION_KEY) : null;
    const encryptedApiPassphrase = apiPassphrase
      ? encryptApiKey(apiPassphrase, ENCRYPTION_KEY)
      : null;

    // Create or update exchange connection
    // Clear OAuth tokens when using API key auth, and vice versa
    const exchangeRecord = await prisma.exchange.upsert({
      where: {
        name_userId: {
          name: exchangeName,
          userId: user.id,
        },
      },
      update: {
        apiKey: encryptedApiKey,
        apiSecret: encryptedApiSecret,
        apiPassphrase: encryptedApiPassphrase,
        // Clear OAuth tokens if using API key auth to prevent auth method conflicts
        refreshToken: refreshToken || (encryptedApiKey ? null : undefined),
        accessToken: encryptedApiKey ? null : undefined,
        tokenExpiresAt: encryptedApiKey ? null : undefined,
        isConnected: true,
        updatedAt: new Date(),
      },
      create: {
        name: exchangeName,
        apiKey: encryptedApiKey,
        apiSecret: encryptedApiSecret,
        apiPassphrase: encryptedApiPassphrase,
        refreshToken: refreshToken || undefined,
        isConnected: true,
        userId: user.id,
      },
    });

    return NextResponse.json({
      status: "success",
      message: `Successfully connected to ${exchangeName}`,
      exchange: {
        id: exchangeRecord.id,
        name: exchangeRecord.name,
        isConnected: exchangeRecord.isConnected,
        lastSyncAt: exchangeRecord.lastSyncAt,
      },
    });
  } catch (error) {
    // Always capture in Sentry for production monitoring
    Sentry.captureException(error, {
      tags: {
        endpoint: "/api/exchanges/connect",
      },
    });

    return NextResponse.json(
      {
        error: "Failed to connect exchange",
        details: process.env.NODE_ENV === "development" ? (error instanceof Error ? error.message : "Unknown error") : "An internal error occurred",
      },
      { status: 500 }
    );
  }
}
