# CoinGecko API Integration

This document describes the CoinGecko API integration for fetching cryptocurrency prices.

## Overview

The CoinGecko integration provides:
- Current price fetching for cryptocurrencies
- Historical price data for specific dates/timestamps
- Price range queries
- Coin search functionality
- Automatic caching to reduce API calls
- Rate limiting support

## Setup

### Environment Variables

Optional: Add your CoinGecko API key to use the Pro API (higher rate limits):

```env
COINGECKO_API_KEY=your_api_key_here
```

**Note:** The integration works without an API key using the free tier, but rate limits are stricter (10-50 calls/minute).

## Usage

### Library Functions

#### Get Current Price

```typescript
import { getCurrentPrice } from "@/lib/coingecko";

const btcPrice = await getCurrentPrice("BTC", "usd");
// Returns: 45000.50 (or null if not found)
```

#### Get Multiple Current Prices

```typescript
import { getCurrentPrices } from "@/lib/coingecko";

const prices = await getCurrentPrices(["BTC", "ETH", "SOL"], "usd");
// Returns: { BTC: 45000.50, ETH: 2500.75, SOL: 100.25 }
```

#### Get Historical Price

```typescript
import { getHistoricalPrice, getHistoricalPriceAtTimestamp } from "@/lib/coingecko";

// By date
const date = new Date("2023-01-15");
const price = await getHistoricalPrice("BTC", date, "usd");

// By Unix timestamp (seconds)
const timestamp = 1673827200; // Unix timestamp
const price = await getHistoricalPriceAtTimestamp("ETH", timestamp, "usd");
```

#### Get Price Range

```typescript
import { getPriceRange } from "@/lib/coingecko";

const fromDate = new Date("2023-01-01");
const toDate = new Date("2023-12-31");
const prices = await getPriceRange("BTC", fromDate, toDate, "usd");
// Returns: [{ date: "2023-01-01T00:00:00Z", price: 16500 }, ...]
```

#### Search for Coins

```typescript
import { searchCoin } from "@/lib/coingecko";

const results = await searchCoin("bitcoin");
// Returns: [{ id: "bitcoin", name: "Bitcoin", symbol: "BTC", market_cap_rank: 1 }, ...]
```

## API Routes

### Get Current Price

```
GET /api/prices?action=current&symbol=BTC&currency=usd
```

### Get Multiple Current Prices

```
GET /api/prices?action=current&symbols=BTC,ETH,SOL&currency=usd
```

### Get Historical Price by Date

```
GET /api/prices?action=historical&symbol=BTC&date=2023-01-15&currency=usd
```

### Get Historical Price by Timestamp

```
GET /api/prices?action=historical&symbol=ETH&timestamp=1673827200&currency=usd
```

### Get Price Range

```
GET /api/prices?action=range&symbol=BTC&fromDate=2023-01-01&toDate=2023-12-31&currency=usd
```

### Search Coins

```
GET /api/prices?action=search&query=bitcoin
```

### Update Transaction Prices

```
POST /api/prices/update-transactions
Body: { limit: 100 } // Optional, defaults to 100
```

This endpoint updates missing `price_per_unit` and `value_usd` fields for transactions in the database.

## Supported Cryptocurrencies

The integration includes a mapping of common cryptocurrency symbols to CoinGecko IDs. Supported symbols include:

- Major coins: BTC, ETH, SOL, BNB, ADA, XRP, DOT, DOGE, AVAX, MATIC, LTC
- DeFi tokens: UNI, LINK, AAVE, MKR, COMP, SNX, SUSHI, CRV, YFI
- Stablecoins: USDC, USDT, DAI, BUSD
- And many more...

If a symbol is not in the mapping, you can:
1. Use the search function to find the CoinGecko ID
2. Add it to the `SYMBOL_TO_ID_MAP` in `src/lib/coingecko.ts`

## Caching

The integration includes automatic caching:
- Current prices: Cached for 1 minute
- Historical prices: Cached for 24 hours

Cache can be cleared programmatically:

```typescript
import { clearCache } from "@/lib/coingecko";

clearCache();
```

## Rate Limiting

The integration includes automatic rate limiting:
- Free tier: ~1.2 seconds between calls (50 calls/minute)
- Pro tier: Higher limits (depends on your plan)

Rate limiting is handled automatically, but you may see warnings in logs if limits are exceeded.

## Integration with Blockchain APIs

The CoinGecko integration is automatically used by:
- `blockchain-apis.ts` - For fetching historical prices when parsing transactions
- Transaction import - For calculating USD values
- Tax calculator - For accurate cost basis calculations

## Error Handling

All functions return `null` if:
- The symbol is not found
- The API request fails
- Rate limits are exceeded

Check the console logs for detailed error messages.

## Best Practices

1. **Batch Requests**: Use `getCurrentPrices()` for multiple symbols instead of multiple `getCurrentPrice()` calls
2. **Cache Usage**: Historical prices are cached for 24 hours, so repeated queries for the same date won't hit the API
3. **Rate Limits**: Be mindful of rate limits, especially when updating many transactions
4. **Error Handling**: Always check for `null` return values and handle gracefully
5. **Pro API**: Consider upgrading to Pro API for production use with higher rate limits

## Example: Updating Missing Prices

```typescript
// Update prices for transactions missing price data
const response = await fetch("/api/prices/update-transactions", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ limit: 100 }),
});

const result = await response.json();
console.log(`Updated ${result.updated} transactions`);
```
