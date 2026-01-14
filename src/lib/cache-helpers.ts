import { getCache, setCache, isRedisEnabled } from "./redis";

/**
 * Cache key generators for different data types
 */
export const CacheKeys = {
  // Blockchain transactions (permanent - never change)
  ethereumTransactions: (address: string, startBlock: number, endBlock: number) =>
    `tx:ethereum:${address.toLowerCase()}:${startBlock}:${endBlock}`,
  
  solanaTransactions: (address: string, limit: number) =>
    `tx:solana:${address.toLowerCase()}:${limit}`,

  // Historical prices (permanent - never change)
  historicalPrice: (symbol: string, date: string, currency: string = "usd") =>
    `price:historical:${symbol.toLowerCase()}:${date}:${currency}`,
  
  historicalPriceTimestamp: (symbol: string, timestamp: number, currency: string = "usd") =>
    `price:historical:${symbol.toLowerCase()}:${timestamp}:${currency}`,

  // Current prices (short TTL - change frequently)
  currentPrice: (symbol: string, currency: string = "usd") =>
    `price:current:${symbol.toLowerCase()}:${currency}`,
  
  currentPrices: (symbols: string[], currency: string = "usd") =>
    `price:current:bulk:${symbols.sort().join(",")}:${currency}`,
};

/**
 * Cache blockchain transactions (permanent cache)
 */
export async function cacheBlockchainTransactions<T>(
  key: string,
  fetchFn: () => Promise<T>
): Promise<T> {
  // Try to get from cache first
  const cached = await getCache<T>(key);
  if (cached !== null) {
    console.log(`[Cache] Hit for blockchain transactions: ${key}`);
    return cached;
  }

  // Cache miss - fetch from API
  console.log(`[Cache] Miss for blockchain transactions: ${key}`);
  const data = await fetchFn();

  // Store in cache permanently (no expiration)
  await setCache(key, data, 0);
  console.log(`[Cache] Stored blockchain transactions: ${key}`);

  return data;
}

/**
 * Cache historical prices (permanent cache - prices never change)
 */
export async function cacheHistoricalPrice(
  key: string,
  fetchFn: () => Promise<number | null>
): Promise<number | null> {
  // Try to get from cache first
  const cached = await getCache<number>(key);
  if (cached !== null) {
    console.log(`[Cache] Hit for historical price: ${key}`);
    return cached;
  }

  // Cache miss - fetch from API
  console.log(`[Cache] Miss for historical price: ${key}`);
  const price = await fetchFn();

  // Only cache if we got a valid price
  if (price !== null) {
    // Store in cache permanently (no expiration)
    await setCache(key, price, 0);
    console.log(`[Cache] Stored historical price: ${key}`);
  }

  return price;
}

/**
 * Cache current prices (short TTL - prices change frequently)
 */
export async function cacheCurrentPrice(
  key: string,
  fetchFn: () => Promise<number | null>,
  ttlSeconds: number = 60 // 1 minute default
): Promise<number | null> {
  // Try to get from cache first
  const cached = await getCache<number>(key);
  if (cached !== null) {
    console.log(`[Cache] Hit for current price: ${key}`);
    return cached;
  }

  // Cache miss - fetch from API
  console.log(`[Cache] Miss for current price: ${key}`);
  const price = await fetchFn();

  // Only cache if we got a valid price
  if (price !== null) {
    // Store in cache with TTL
    await setCache(key, price, ttlSeconds);
    console.log(`[Cache] Stored current price: ${key} (TTL: ${ttlSeconds}s)`);
  }

  return price;
}

/**
 * Check if Redis caching is available
 */
export function isCachingEnabled(): boolean {
  return isRedisEnabled();
}
