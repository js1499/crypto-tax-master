import { NextRequest, NextResponse } from "next/server";
import {
  getCurrentPrice,
  getCurrentPrices,
  getHistoricalPrice,
  getHistoricalPriceAtTimestamp,
  getPriceRange,
  searchCoin,
} from "@/lib/coingecko";
import { rateLimitAPI, createRateLimitResponse } from "@/lib/rate-limit";
import * as Sentry from "@sentry/nextjs";

/**
 * GET /api/prices?symbol=BTC&currency=usd
 * Get current price for a cryptocurrency
 */
export async function GET(request: NextRequest) {
  try {
    // Rate limiting for price API (CoinGecko has rate limits)
    const rateLimitResult = rateLimitAPI(request, 50); // 50 requests per minute
    if (!rateLimitResult.success) {
      return createRateLimitResponse(
        rateLimitResult.remaining,
        rateLimitResult.reset
      );
    }
    const searchParams = request.nextUrl.searchParams;
    const action = searchParams.get("action") || "current";
    const symbol = searchParams.get("symbol");
    const symbols = searchParams.get("symbols");
    const currency = searchParams.get("currency") || "usd";
    const date = searchParams.get("date");
    const timestamp = searchParams.get("timestamp");
    const fromDate = searchParams.get("fromDate");
    const toDate = searchParams.get("toDate");
    const query = searchParams.get("query");

    switch (action) {
      case "current": {
        if (symbols) {
          // Get multiple current prices
          const symbolList = symbols.split(",").map((s) => s.trim());
          const prices = await getCurrentPrices(symbolList, currency);
          return NextResponse.json({
            success: true,
            prices,
            currency,
          });
        } else if (symbol) {
          // Get single current price
          const price = await getCurrentPrice(symbol, currency);
          if (price === null) {
            return NextResponse.json(
              {
                success: false,
                error: `Price not found for symbol: ${symbol}`,
              },
              { status: 404 }
            );
          }
          return NextResponse.json({
            success: true,
            symbol,
            price,
            currency,
          });
        } else {
          return NextResponse.json(
            {
              success: false,
              error: "Missing required parameter: symbol or symbols",
            },
            { status: 400 }
          );
        }
      }

      case "historical": {
        if (!symbol) {
          return NextResponse.json(
            {
              success: false,
              error: "Missing required parameter: symbol",
            },
            { status: 400 }
          );
        }

        let price: number | null = null;

        if (timestamp) {
          // Get price by Unix timestamp
          const ts = parseInt(timestamp);
          if (isNaN(ts)) {
            return NextResponse.json(
              {
                success: false,
                error: "Invalid timestamp format",
              },
              { status: 400 }
            );
          }
          price = await getHistoricalPriceAtTimestamp(symbol, ts, currency);
        } else if (date) {
          // Get price by date (ISO format: YYYY-MM-DD)
          const dateObj = new Date(date);
          if (isNaN(dateObj.getTime())) {
            return NextResponse.json(
              {
                success: false,
                error: "Invalid date format. Use YYYY-MM-DD",
              },
              { status: 400 }
            );
          }
          price = await getHistoricalPrice(symbol, dateObj, currency);
        } else {
          return NextResponse.json(
            {
              success: false,
              error: "Missing required parameter: date or timestamp",
            },
            { status: 400 }
          );
        }

        if (price === null) {
          return NextResponse.json(
            {
              success: false,
              error: `Historical price not found for ${symbol}`,
            },
            { status: 404 }
          );
        }

        return NextResponse.json({
          success: true,
          symbol,
          price,
          currency,
          date: date || new Date(parseInt(timestamp!) * 1000).toISOString(),
        });
      }

      case "range": {
        if (!symbol || !fromDate || !toDate) {
          return NextResponse.json(
            {
              success: false,
              error: "Missing required parameters: symbol, fromDate, toDate",
            },
            { status: 400 }
          );
        }

        const from = new Date(fromDate);
        const to = new Date(toDate);

        if (isNaN(from.getTime()) || isNaN(to.getTime())) {
          return NextResponse.json(
            {
              success: false,
              error: "Invalid date format. Use ISO format (YYYY-MM-DD)",
            },
            { status: 400 }
          );
        }

        const prices = await getPriceRange(symbol, from, to, currency);

        if (prices === null) {
          return NextResponse.json(
            {
              success: false,
              error: `Price range not found for ${symbol}`,
            },
            { status: 404 }
          );
        }

        return NextResponse.json({
          success: true,
          symbol,
          currency,
          fromDate: from.toISOString(),
          toDate: to.toISOString(),
          prices,
        });
      }

      case "search": {
        if (!query) {
          return NextResponse.json(
            {
              success: false,
              error: "Missing required parameter: query",
            },
            { status: 400 }
          );
        }

        const results = await searchCoin(query);
        return NextResponse.json({
          success: true,
          query,
          results,
        });
      }

      default:
        return NextResponse.json(
          {
            success: false,
            error: `Unknown action: ${action}. Valid actions: current, historical, range, search`,
          },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error("[Prices API] Error:", error);
    
    // Capture error in Sentry
    Sentry.captureException(error, {
      tags: {
        endpoint: "/api/prices",
      },
    });
    
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch price data",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
