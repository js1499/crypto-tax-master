import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { rateLimitAPI, createRateLimitResponse, rateLimitByUser } from "@/lib/rate-limit";
import * as Sentry from "@sentry/nextjs";
import { encryptApiKey } from "@/lib/exchange-clients";
import { BinanceClient, KrakenClient, KuCoinClient, GeminiClient } from "@/lib/exchange-clients";
import crypto from "crypto";

const prisma = new PrismaClient();

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

    // Get user authentication
    const user = await getCurrentUser();
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
      if (!refreshToken) {
        return NextResponse.json(
          { error: "Coinbase requires OAuth refresh token" },
          { status: 400 }
        );
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
  } finally {
    await prisma.$disconnect();
  }
}
