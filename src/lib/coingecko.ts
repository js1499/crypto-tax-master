import axios from "axios";
import { cacheHistoricalPrice, cacheCurrentPrice, CacheKeys } from "./cache-helpers";

// CoinGecko API Configuration
const COINGECKO_API_BASE = "https://api.coingecko.com/api/v3";
const COINGECKO_PRO_API_BASE = "https://pro-api.coingecko.com/api/v3";

// Get API key from environment (optional - free tier works without key)
export const COINGECKO_API_KEY = process.env.COINGECKO_API_KEY || "";

// Use Pro API if key is provided, otherwise use free API
export const API_BASE = COINGECKO_API_KEY
  ? COINGECKO_PRO_API_BASE
  : COINGECKO_API_BASE;

// Rate limiting: Free/Demo ~30 calls/min, Analyst 500/min
// Delay = 60_000ms / calls_per_minute
const RATE_LIMIT_DELAY = COINGECKO_API_KEY ? 120 : 1200; // 120ms (Analyst 500/min) or 1.2s (free)

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

// Dynamic cache: symbols resolved at runtime via search API.
// Persists for the lifetime of the server process so repeated enrichment
// calls don't re-search the same symbols.
const dynamicIdCache = new Map<string, string | null>();

/**
 * Get CoinGecko ID from symbol.
 * Checks the hardcoded map first, then the dynamic cache populated by
 * resolveUnknownSymbols().
 */
export function getCoinGeckoId(symbol: string): string | null {
  const upperSymbol = symbol.toUpperCase();
  if (SYMBOL_TO_ID_MAP[upperSymbol]) return SYMBOL_TO_ID_MAP[upperSymbol];
  if (dynamicIdCache.has(upperSymbol)) return dynamicIdCache.get(upperSymbol) || null;
  return null;
}

/**
 * Resolve unknown symbols by searching the CoinGecko API.
 * For each symbol not already in the hardcoded map or dynamic cache,
 * calls the search API, picks the best exact-symbol match by market cap
 * rank, and caches the result (including misses to avoid re-searching).
 *
 * Call this BEFORE getPriceRange/getHistoricalPrice so that getCoinGeckoId()
 * returns the correct IDs.
 */
export async function resolveUnknownSymbols(
  symbols: string[]
): Promise<{ resolved: string[]; failed: string[] }> {
  const unknown = symbols.filter((s) => {
    const upper = s.toUpperCase();
    return !SYMBOL_TO_ID_MAP[upper] && !dynamicIdCache.has(upper);
  });

  if (unknown.length === 0) return { resolved: [], failed: [] };

  console.log(`[CoinGecko] Resolving ${unknown.length} unknown symbol(s): ${unknown.join(", ")}`);

  const resolved: string[] = [];
  const failed: string[] = [];

  for (const symbol of unknown) {
    const upper = symbol.toUpperCase();
    try {
      // searchCoin already calls rateLimit() internally
      const results = await searchCoin(symbol);

      // Find best match: exact symbol match, sorted by market cap rank (lower = more popular)
      const exactMatches = results
        .filter((r) => r.symbol.toUpperCase() === upper)
        .sort((a, b) => (a.market_cap_rank || 999999) - (b.market_cap_rank || 999999));

      if (exactMatches.length > 0) {
        const best = exactMatches[0];
        dynamicIdCache.set(upper, best.id);
        resolved.push(symbol);
        console.log(
          `[CoinGecko] Resolved ${symbol} → ${best.id} (${best.name}, rank #${best.market_cap_rank || "N/A"})`
        );
      } else {
        dynamicIdCache.set(upper, null); // Cache the miss
        failed.push(symbol);
        console.log(`[CoinGecko] No match for ${symbol} (${results.length} search results, none matched symbol)`);
      }
    } catch (err) {
      dynamicIdCache.set(upper, null);
      failed.push(symbol);
      console.warn(`[CoinGecko] Search failed for ${symbol}:`, err instanceof Error ? err.message : err);
    }
  }

  console.log(
    `[CoinGecko] Resolution complete: ${resolved.length} resolved, ${failed.length} failed`
  );
  return { resolved, failed };
}

// Contract address → resolved token info cache (mint → { id, symbol, name } or null)
const contractCache = new Map<string, { id: string; symbol: string; name: string } | null>();

/**
 * Look up a token on CoinGecko by its on-chain contract (mint) address.
 * Uses GET /coins/{platform}/contract/{address}.
 * Returns the CoinGecko ID, symbol, and name, or null if not found.
 * Also populates the dynamicIdCache so getPriceRange() works afterwards.
 */
export async function getTokenByContract(
  contractAddress: string,
  platform: string = "solana",
  maxRetries: number = 3,
): Promise<{ id: string; symbol: string; name: string } | null> {
  // Check cache first
  if (contractCache.has(contractAddress)) {
    return contractCache.get(contractAddress) || null;
  }

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      await rateLimit();

      const url = `${API_BASE}/coins/${platform}/contract/${contractAddress}`;
      const params: any = {};
      if (COINGECKO_API_KEY) {
        params.x_cg_pro_api_key = COINGECKO_API_KEY;
      }

      const response = await axios.get(url, { params, timeout: 10000 });
      const data = response.data;

      if (data && data.id && data.symbol) {
        const result = {
          id: data.id,
          symbol: data.symbol.toUpperCase(),
          name: data.name || data.symbol,
        };
        contractCache.set(contractAddress, result);
        dynamicIdCache.set(result.symbol, result.id);
        return result;
      }

      contractCache.set(contractAddress, null);
      return null;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        contractCache.set(contractAddress, null);
        return null;
      }
      // 429 = rate limited — wait with exponential backoff and retry
      if (axios.isAxiosError(error) && error.response?.status === 429 && attempt < maxRetries) {
        const backoffMs = Math.min(2000 * Math.pow(2, attempt), 30000); // 2s, 4s, 8s... max 30s
        console.warn(`[CoinGecko] 429 rate limited, retrying in ${backoffMs / 1000}s (attempt ${attempt + 1}/${maxRetries})...`);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
        continue;
      }
      // Other error or max retries exhausted
      console.warn(
        `[CoinGecko] Contract lookup failed for ${contractAddress}:`,
        axios.isAxiosError(error) ? `${error.response?.status} ${error.message}` : error
      );
      return null;
    }
  }
  return null;
}

// In-memory cache for the full CoinGecko coin list with platform addresses.
// Map key: "platform:contractAddress" (lowercase), value: { id, symbol, name }
let coinListByContract: Map<string, { id: string; symbol: string; name: string }> | null = null;

/**
 * Fetch the full CoinGecko coin list with platform contract addresses.
 * Single API call that returns ~15K coins. Cached in memory for the process lifetime.
 */
async function loadCoinListWithPlatforms(): Promise<Map<string, { id: string; symbol: string; name: string }>> {
  if (coinListByContract) return coinListByContract;

  console.log("[CoinGecko] Fetching full coin list with platforms (1 API call)...");
  await rateLimit();

  const params: any = { include_platform: true };
  if (COINGECKO_API_KEY) params.x_cg_pro_api_key = COINGECKO_API_KEY;

  const response = await axios.get(`${API_BASE}/coins/list`, { params, timeout: 30000 });
  const coins: Array<{ id: string; symbol: string; name: string; platforms?: Record<string, string> }> = response.data;

  coinListByContract = new Map();
  for (const coin of coins) {
    if (!coin.platforms) continue;
    for (const [platform, address] of Object.entries(coin.platforms)) {
      if (!address) continue;
      const key = `${platform}:${address.toLowerCase()}`;
      coinListByContract.set(key, {
        id: coin.id,
        symbol: coin.symbol.toUpperCase(),
        name: coin.name,
      });
    }
  }

  console.log(`[CoinGecko] Coin list loaded: ${coins.length} coins, ${coinListByContract.size} contract mappings`);
  return coinListByContract;
}

/**
 * Resolve multiple contract addresses in bulk using the coin list.
 * Uses 1 API call (coin list) instead of N individual contract lookups.
 * Matches addresses locally by platform + contract address.
 */
export async function resolveByContractAddress(
  addresses: Array<{ contractAddress: string; currentSymbol: string }>,
  platform: string = "solana"
): Promise<{
  resolved: Map<string, { id: string; symbol: string; name: string }>;
  failed: string[];
  symbolUpdates: Map<string, string>;
}> {
  const resolved = new Map<string, { id: string; symbol: string; name: string }>();
  const failed: string[] = [];
  const symbolUpdates = new Map<string, string>();

  // Check in-memory contract cache first
  const toResolve: Array<{ contractAddress: string; currentSymbol: string }> = [];
  for (const entry of addresses) {
    const cached = contractCache.get(entry.contractAddress);
    if (cached !== undefined) {
      if (cached) {
        resolved.set(entry.contractAddress, cached);
        if (entry.currentSymbol !== cached.symbol) {
          symbolUpdates.set(entry.currentSymbol, cached.symbol);
        }
      }
    } else {
      toResolve.push(entry);
    }
  }

  if (toResolve.length === 0) {
    console.log(`[CoinGecko] All ${addresses.length} contract addresses already cached`);
    return { resolved, failed, symbolUpdates };
  }

  try {
    const coinList = await loadCoinListWithPlatforms();

    console.log(`[CoinGecko] Matching ${toResolve.length} addresses against coin list (platform: ${platform})...`);

    for (const { contractAddress, currentSymbol } of toResolve) {
      const key = `${platform}:${contractAddress.toLowerCase()}`;
      const match = coinList.get(key);

      if (match) {
        resolved.set(contractAddress, match);
        contractCache.set(contractAddress, match);
        dynamicIdCache.set(match.symbol, match.id);
        if (currentSymbol !== match.symbol) {
          symbolUpdates.set(currentSymbol, match.symbol);
        }
      } else {
        contractCache.set(contractAddress, null);
        failed.push(contractAddress);
      }
    }

    console.log(
      `[CoinGecko] Contract resolution complete: ${resolved.size} resolved, ${failed.length} not on CoinGecko`
    );
  } catch (error) {
    console.warn("[CoinGecko] Failed to load coin list:", error instanceof Error ? error.message : error);
    // All unresolved become failed
    for (const { contractAddress } of toResolve) {
      if (!resolved.has(contractAddress)) failed.push(contractAddress);
    }
  }

  return { resolved, failed, symbolUpdates };
}

/**
 * Rate limiting helper
 */
export async function rateLimit(): Promise<void> {
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
  currency: string = "usd",
  maxRetries: number = 3,
): Promise<{ date: string; price: number }[] | null> {
  const coinId = getCoinGeckoId(symbol);
  if (!coinId) {
    console.warn(`[CoinGecko] Unknown symbol: ${symbol}`);
    return null;
  }

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      await rateLimit();

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
      if (axios.isAxiosError(error) && error.response?.status === 429 && attempt < maxRetries) {
        const backoffMs = Math.min(2000 * Math.pow(2, attempt), 30000);
        console.warn(`[CoinGecko] 429 on getPriceRange(${symbol}), retrying in ${backoffMs / 1000}s...`);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
        continue;
      }
      console.error(`[CoinGecko] Error fetching price range for ${symbol}:`, error);
      return null;
    }
  }
  return null;
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
