import axios from "axios";
import { cacheHistoricalPrice, cacheCurrentPrice, CacheKeys } from "./cache-helpers";

// CoinGecko API Configuration
const COINGECKO_API_BASE = "https://api.coingecko.com/api/v3";
const COINGECKO_PRO_API_BASE = "https://pro-api.coingecko.com/api/v3";

// Get API key from environment (optional - free tier works without key)
const COINGECKO_API_KEY = process.env.COINGECKO_API_KEY || "";

// Use Pro API if key is provided, otherwise use free API
const API_BASE = COINGECKO_API_KEY
  ? COINGECKO_PRO_API_BASE
  : COINGECKO_API_BASE;

// Rate limiting: Free tier allows 10-50 calls/minute
// Pro tier allows more calls
const RATE_LIMIT_DELAY = 1200; // 1.2 seconds between calls for free tier

// Fallback in-memory cache (used when Redis is unavailable)
interface PriceCache {
  [key: string]: {
    price: number;
    timestamp: number;
    expiresAt: number;
  };
}

const priceCache: PriceCache = {};
const CACHE_DURATION = 60 * 1000; // 1 minute for current prices (fallback only)
const HISTORICAL_CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours for historical prices (fallback only)

// Last API call timestamp for rate limiting
let lastApiCall = 0;

/**
 * Map common cryptocurrency symbols to CoinGecko IDs
 * CoinGecko uses IDs like "ethereum", "bitcoin", "solana" instead of symbols
 */
const SYMBOL_TO_ID_MAP: { [symbol: string]: string } = {
  BTC: "bitcoin",
  ETH: "ethereum",
  SOL: "solana",
  BNB: "binancecoin",
  ADA: "cardano",
  XRP: "ripple",
  DOT: "polkadot",
  DOGE: "dogecoin",
  AVAX: "avalanche-2",
  MATIC: "matic-network",
  LTC: "litecoin",
  UNI: "uniswap",
  LINK: "chainlink",
  ATOM: "cosmos",
  ETC: "ethereum-classic",
  XLM: "stellar",
  ALGO: "algorand",
  VET: "vechain",
  TRX: "tron",
  EOS: "eos",
  XMR: "monero",
  AAVE: "aave",
  MKR: "maker",
  COMP: "compound-governance-token",
  SNX: "havven",
  SUSHI: "sushi",
  CRV: "curve-dao-token",
  YFI: "yearn-finance",
  USDC: "usd-coin",
  USDT: "tether",
  DAI: "dai",
  BUSD: "binance-usd",
  UST: "terrausd",
  LUNA: "terra-luna",
  FTM: "fantom",
  NEAR: "near",
  FLOW: "flow",
  ICP: "internet-computer",
  THETA: "theta-token",
  FIL: "filecoin",
  HBAR: "hedera-hashgraph",
  EGLD: "elrond-erd-2",
  AXS: "axie-infinity",
  SAND: "the-sandbox",
  MANA: "decentraland",
  ENJ: "enjincoin",
  GALA: "gala",
  CHZ: "chiliz",
  BAT: "basic-attention-token",
  ZEC: "zcash",
  DASH: "dash",
  XTZ: "tezos",
  WAVES: "waves",
  ZIL: "zilliqa",
  ONT: "ontology",
  IOTA: "iota",
  NEO: "neo",
  QTUM: "qtum",
  BCH: "bitcoin-cash",
  BSV: "bitcoin-sv",
};

/**
 * Get CoinGecko ID from symbol
 */
export function getCoinGeckoId(symbol: string): string | null {
  const upperSymbol = symbol.toUpperCase();
  return SYMBOL_TO_ID_MAP[upperSymbol] || null;
}

/**
 * Rate limiting helper
 */
async function rateLimit(): Promise<void> {
  const now = Date.now();
  const timeSinceLastCall = now - lastApiCall;
  if (timeSinceLastCall < RATE_LIMIT_DELAY) {
    await new Promise((resolve) =>
      setTimeout(resolve, RATE_LIMIT_DELAY - timeSinceLastCall)
    );
  }
  lastApiCall = Date.now();
}

/**
 * Get current price for a cryptocurrency
 * @param symbol - Cryptocurrency symbol (e.g., "BTC", "ETH")
 * @param currency - Fiat currency (default: "usd")
 */
export async function getCurrentPrice(
  symbol: string,
  currency: string = "usd"
): Promise<number | null> {
  const coinId = getCoinGeckoId(symbol);
  if (!coinId) {
    console.warn(`[CoinGecko] Unknown symbol: ${symbol}`);
    return null;
  }

  const cacheKey = CacheKeys.currentPrice(symbol, currency);

  // Use Redis cache with 60 second TTL (current prices change frequently)
  return cacheCurrentPrice(cacheKey, async () => {
    // Fallback to in-memory cache if Redis unavailable
    const cached = priceCache[cacheKey];
    if (cached && Date.now() < cached.expiresAt) {
      return cached.price;
    }

    try {
      await rateLimit();

      const url = `${API_BASE}/simple/price`;
      const params: any = {
        ids: coinId,
        vs_currencies: currency,
      };

      if (COINGECKO_API_KEY) {
        params.x_cg_pro_api_key = COINGECKO_API_KEY;
      }

      const response = await axios.get(url, { params });

      if (response.data && response.data[coinId]) {
        const price = response.data[coinId][currency];
        if (price) {
          // Store in fallback in-memory cache
          priceCache[cacheKey] = {
            price,
            timestamp: Date.now(),
            expiresAt: Date.now() + CACHE_DURATION,
          };
          return price;
        }
      }

      return null;
    } catch (error) {
      console.error(`[CoinGecko] Error fetching current price for ${symbol}:`, error);
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 429) {
          console.warn("[CoinGecko] Rate limit exceeded, consider upgrading to Pro API");
        }
      }
      return null;
    }
  }, 60); // 60 second TTL for current prices
}

/**
 * Get current prices for multiple cryptocurrencies
 * @param symbols - Array of cryptocurrency symbols
 * @param currency - Fiat currency (default: "usd")
 */
export async function getCurrentPrices(
  symbols: string[],
  currency: string = "usd"
): Promise<{ [symbol: string]: number | null }> {
  const coinIds = symbols
    .map((symbol) => {
      const id = getCoinGeckoId(symbol);
      return id ? { symbol, id } : null;
    })
    .filter((item): item is { symbol: string; id: string } => item !== null);

  if (coinIds.length === 0) {
    return {};
  }

  // Check Redis cache first (bulk lookup)
  const { getMultipleCache } = await import("./redis");
  const cacheKeys = coinIds.map(({ symbol }) => CacheKeys.currentPrice(symbol, currency));
  const cachedPrices = await getMultipleCache<number>(cacheKeys);

  // Process cached results and identify symbols to fetch
  const results: { [symbol: string]: number | null } = {};
  const symbolsToFetch: { symbol: string; id: string }[] = [];

  for (let i = 0; i < coinIds.length; i++) {
    const { symbol, id } = coinIds[i];
    
    // Check Redis cache result
    if (cachedPrices[i] !== null) {
      results[symbol] = cachedPrices[i];
      continue;
    }

    // Fallback to in-memory cache
    const fallbackCacheKey = `${id}-${currency}-current`;
    const cached = priceCache[fallbackCacheKey];
    if (cached && Date.now() < cached.expiresAt) {
      results[symbol] = cached.price;
    } else {
      symbolsToFetch.push({ symbol, id });
    }
  }

  // Fetch remaining symbols
  if (symbolsToFetch.length > 0) {
    try {
      await rateLimit();

      const ids = symbolsToFetch.map((item) => item.id).join(",");
      const url = `${API_BASE}/simple/price`;
      const params: any = {
        ids,
        vs_currencies: currency,
      };

      if (COINGECKO_API_KEY) {
        params.x_cg_pro_api_key = COINGECKO_API_KEY;
      }

      const response = await axios.get(url, { params });

      // Cache results in Redis and fallback cache
      const { setMultipleCache } = await import("./redis");
      const cacheItems: Array<{ key: string; value: number; ttlSeconds?: number }> = [];

      for (const { symbol, id } of symbolsToFetch) {
        if (response.data && response.data[id]) {
          const price = response.data[id][currency];
          if (price) {
            results[symbol] = price;
            // Prepare for Redis cache
            cacheItems.push({
              key: CacheKeys.currentPrice(symbol, currency),
              value: price,
              ttlSeconds: 60, // 60 second TTL
            });
            // Also store in fallback in-memory cache
            const fallbackCacheKey = `${id}-${currency}-current`;
            priceCache[fallbackCacheKey] = {
              price,
              timestamp: Date.now(),
              expiresAt: Date.now() + CACHE_DURATION,
            };
          } else {
            results[symbol] = null;
          }
        } else {
          results[symbol] = null;
        }
      }

      // Bulk cache in Redis
      if (cacheItems.length > 0) {
        await setMultipleCache(cacheItems);
      }
    } catch (error) {
      console.error("[CoinGecko] Error fetching current prices:", error);
      // Set null for all symbols that failed
      for (const { symbol } of symbolsToFetch) {
        if (!(symbol in results)) {
          results[symbol] = null;
        }
      }
    }
  }

  return results;
}

/**
 * Get historical price for a cryptocurrency at a specific date
 * @param symbol - Cryptocurrency symbol (e.g., "BTC", "ETH")
 * @param date - Date to get price for
 * @param currency - Fiat currency (default: "usd")
 */
export async function getHistoricalPrice(
  symbol: string,
  date: Date,
  currency: string = "usd"
): Promise<number | null> {
  const coinId = getCoinGeckoId(symbol);
  if (!coinId) {
    console.warn(`[CoinGecko] Unknown symbol: ${symbol}`);
    return null;
  }

  // Format date as DD-MM-YYYY for CoinGecko
  const dateStr = date.toISOString().split("T")[0].split("-").reverse().join("-");
  const cacheKey = CacheKeys.historicalPrice(symbol, dateStr, currency);

  // Use Redis cache (permanent - historical prices never change)
  return cacheHistoricalPrice(cacheKey, async () => {
    // Fallback to in-memory cache if Redis unavailable
    const fallbackCacheKey = `${coinId}-${currency}-${dateStr}`;
    const cached = priceCache[fallbackCacheKey];
    if (cached && Date.now() < cached.expiresAt) {
      return cached.price;
    }

    try {
      await rateLimit();

      const url = `${API_BASE}/coins/${coinId}/history`;
      const params: any = {
        date: dateStr,
      };

      if (COINGECKO_API_KEY) {
        params.x_cg_pro_api_key = COINGECKO_API_KEY;
      }

      const response = await axios.get(url, { params });

      if (
        response.data &&
        response.data.market_data &&
        response.data.market_data.current_price
      ) {
        const price = response.data.market_data.current_price[currency];
        if (price) {
          // Store in fallback in-memory cache
          priceCache[fallbackCacheKey] = {
            price,
            timestamp: Date.now(),
            expiresAt: Date.now() + HISTORICAL_CACHE_DURATION,
          };
          return price;
        }
      }

      return null;
    } catch (error) {
      console.error(
        `[CoinGecko] Error fetching historical price for ${symbol} on ${dateStr}:`,
        error
      );
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 429) {
          console.warn("[CoinGecko] Rate limit exceeded, consider upgrading to Pro API");
        }
      }
      return null;
    }
  });
}

/**
 * Get historical price for a cryptocurrency at a specific timestamp (Unix timestamp)
 * @param symbol - Cryptocurrency symbol (e.g., "BTC", "ETH")
 * @param timestamp - Unix timestamp in seconds
 * @param currency - Fiat currency (default: "usd")
 */
export async function getHistoricalPriceAtTimestamp(
  symbol: string,
  timestamp: number,
  currency: string = "usd"
): Promise<number | null> {
  const cacheKey = CacheKeys.historicalPriceTimestamp(symbol, timestamp, currency);

  // Use Redis cache (permanent - historical prices never change)
  return cacheHistoricalPrice(cacheKey, async () => {
    // Convert timestamp to date and use date-based function
    const date = new Date(timestamp * 1000);
    return getHistoricalPrice(symbol, date, currency);
  });
}

/**
 * Get price range for a cryptocurrency between two dates
 * @param symbol - Cryptocurrency symbol
 * @param fromDate - Start date
 * @param toDate - End date
 * @param currency - Fiat currency (default: "usd")
 */
export async function getPriceRange(
  symbol: string,
  fromDate: Date,
  toDate: Date,
  currency: string = "usd"
): Promise<{ date: string; price: number }[] | null> {
  const coinId = getCoinGeckoId(symbol);
  if (!coinId) {
    console.warn(`[CoinGecko] Unknown symbol: ${symbol}`);
    return null;
  }

  try {
    await rateLimit();

    // Convert dates to Unix timestamps
    const fromTimestamp = Math.floor(fromDate.getTime() / 1000);
    const toTimestamp = Math.floor(toDate.getTime() / 1000);

    const url = `${API_BASE}/coins/${coinId}/market_chart/range`;
    const params: any = {
      vs_currency: currency,
      from: fromTimestamp,
      to: toTimestamp,
    };

    if (COINGECKO_API_KEY) {
      params.x_cg_pro_api_key = COINGECKO_API_KEY;
    }

    const response = await axios.get(url, { params });

    if (response.data && response.data.prices) {
      return response.data.prices.map(([timestamp, price]: [number, number]) => ({
        date: new Date(timestamp).toISOString(),
        price,
      }));
    }

    return null;
  } catch (error) {
    console.error(
      `[CoinGecko] Error fetching price range for ${symbol}:`,
      error
    );
    return null;
  }
}

/**
 * Search for a coin by name or symbol
 * @param query - Search query
 */
export async function searchCoin(query: string): Promise<
  Array<{
    id: string;
    name: string;
    symbol: string;
    market_cap_rank?: number;
  }>
> {
  try {
    await rateLimit();

    const url = `${API_BASE}/search`;
    const params: any = {
      query,
    };

    if (COINGECKO_API_KEY) {
      params.x_cg_pro_api_key = COINGECKO_API_KEY;
    }

    const response = await axios.get(url, { params });

    if (response.data && response.data.coins) {
      return response.data.coins.map((coin: any) => ({
        id: coin.id,
        name: coin.name,
        symbol: coin.symbol,
        market_cap_rank: coin.market_cap_rank,
      }));
    }

    return [];
  } catch (error) {
    console.error(`[CoinGecko] Error searching for coin: ${query}`, error);
    return [];
  }
}

/**
 * Clear the price cache
 */
export function clearCache(): void {
  Object.keys(priceCache).forEach((key) => delete priceCache[key]);
}

/**
 * Get cache statistics
 */
export function getCacheStats(): {
  size: number;
  entries: number;
} {
  return {
    size: Object.keys(priceCache).length,
    entries: Object.keys(priceCache).length,
  };
}
