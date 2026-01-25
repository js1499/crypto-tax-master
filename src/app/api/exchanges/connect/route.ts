import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { rateLimitAPI, createRateLimitResponse, rateLimitByUser } from "@/lib/rate-limit";
import * as Sentry from "@sentry/nextjs";
import { encryptApiKey } from "@/lib/exchange-clients";
import { BinanceClient, KrakenClient, KuCoinClient, GeminiClient } from "@/lib/exchange-clients";
import crypto from "crypto";

// Encryption key (in production, use environment variable)
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString("hex");

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

      // If API key is provided, validate it by making a test request
      if (apiKey && apiSecret) {
        try {
          const axios = (await import("axios")).default;
          const timestamp = Math.floor(Date.now() / 1000).toString();
          const method = "GET";
          const path = "/v2/user";
          const body = "";

          // Create signature for Coinbase API v2
          const crypto = await import("crypto");
          const message = timestamp + method + path + body;
          const signature = crypto
            .createHmac("sha256", apiSecret)
            .update(message)
            .digest("hex");

          const response = await axios.get("https://api.coinbase.com/v2/user", {
            headers: {
              "CB-ACCESS-KEY": apiKey,
              "CB-ACCESS-SIGN": signature,
              "CB-ACCESS-TIMESTAMP": timestamp,
              "CB-VERSION": "2021-03-05",
            },
          });

          if (!response.data || !response.data.data) {
            throw new Error("Invalid API response");
          }

          console.log(`[Exchange Connect] Coinbase API key validated for user: ${response.data.data.email || response.data.data.name}`);
        } catch (error) {
          console.error(`[Exchange Connect] Coinbase API key validation failed:`, error);
          return NextResponse.json(
            {
              error: "Invalid Coinbase API credentials. Please check your API key and secret.",
              details: error instanceof Error ? error.message : "Unknown error",
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
            // Kraken doesn't have a simple test endpoint, skip validation for now
            // In production, you might want to make a minimal API call
            break;
          case "kucoin":
            if (!apiPassphrase) {
              return NextResponse.json(
                { error: "KuCoin requires API passphrase" },
                { status: 400 }
              );
            }
            // KuCoin validation would go here
            break;
          case "gemini":
            // Gemini validation would go here
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
            details: error instanceof Error ? error.message : "Unknown error",
          },
          { status: 400 }
        );
      }
    }

    // Encrypt credentials
    const encryptedApiKey = apiKey ? encryptApiKey(apiKey, ENCRYPTION_KEY) : null;
    const encryptedApiSecret = apiSecret ? encryptApiKey(apiSecret, ENCRYPTION_KEY) : null;
    const encryptedApiPassphrase = apiPassphrase
      ? encryptApiKey(apiPassphrase, ENCRYPTION_KEY)
      : null;

    // Create or update exchange connection
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
        refreshToken: refreshToken || undefined,
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
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
