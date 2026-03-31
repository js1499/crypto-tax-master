// In-memory cache for FX rates during a single computation
const rateCache = new Map<string, number>();

/**
 * Fetch the daily USD→target exchange rate for a given date.
 * Uses the Frankfurter API (free, based on ECB data, no API key).
 * Caches rates in memory to avoid repeated API calls.
 */
export async function getUsdRate(targetCurrency: string, date: Date): Promise<number> {
  if (targetCurrency === "USD") return 1;

  const dateStr = date.toISOString().split("T")[0]; // YYYY-MM-DD
  const cacheKey = `${targetCurrency}:${dateStr}`;

  if (rateCache.has(cacheKey)) return rateCache.get(cacheKey)!;

  try {
    const response = await fetch(
      `https://api.frankfurter.dev/${dateStr}?from=USD&to=${targetCurrency}`
    );
    if (!response.ok) {
      console.warn(`[FX] Failed to fetch rate for ${dateStr}: ${response.status}`);
      return getLatestCachedRate(targetCurrency);
    }
    const data = await response.json();
    const rate = data.rates?.[targetCurrency];
    if (rate) {
      rateCache.set(cacheKey, rate);
      return rate;
    }
  } catch (error) {
    console.warn(`[FX] Error fetching rate for ${dateStr}:`, error);
  }

  return getLatestCachedRate(targetCurrency);
}

/**
 * Batch fetch daily rates for a date range.
 * More efficient than individual calls — fetches a time series.
 */
export async function batchFetchRates(
  targetCurrency: string,
  startDate: Date,
  endDate: Date,
): Promise<Map<string, number>> {
  if (targetCurrency === "USD") return new Map();

  const start = startDate.toISOString().split("T")[0];
  const end = endDate.toISOString().split("T")[0];

  try {
    const response = await fetch(
      `https://api.frankfurter.dev/${start}..${end}?from=USD&to=${targetCurrency}`
    );
    if (!response.ok) {
      console.warn(`[FX] Batch fetch failed: ${response.status}`);
      return new Map();
    }
    const data = await response.json();
    const rates = new Map<string, number>();

    if (data.rates) {
      for (const [dateStr, rateObj] of Object.entries(data.rates)) {
        const rate = (rateObj as Record<string, number>)[targetCurrency];
        if (rate) {
          rates.set(dateStr, rate);
          rateCache.set(`${targetCurrency}:${dateStr}`, rate);
        }
      }
    }

    return rates;
  } catch (error) {
    console.warn(`[FX] Batch fetch error:`, error);
    return new Map();
  }
}

/**
 * Convert a USD amount to the target currency using the daily rate for the given date.
 * Falls back to nearest available rate if exact date not found.
 */
export async function convertUsd(
  amountUsd: number,
  targetCurrency: string,
  date: Date,
): Promise<number> {
  if (targetCurrency === "USD" || amountUsd === 0) return amountUsd;
  const rate = await getUsdRate(targetCurrency, date);
  return Math.round(amountUsd * rate * 100) / 100;
}

function getLatestCachedRate(targetCurrency: string): number {
  // Find the most recent cached rate for this currency
  let latestRate = targetCurrency === "GBP" ? 0.79 : targetCurrency === "EUR" ? 0.92 : 1;
  let latestDate = "";

  for (const [key, rate] of rateCache) {
    if (key.startsWith(`${targetCurrency}:`)) {
      const dateStr = key.split(":")[1];
      if (dateStr > latestDate) {
        latestDate = dateStr;
        latestRate = rate;
      }
    }
  }

  return latestRate;
}

/** Clear the in-memory FX rate cache */
export function clearFxCache(): void {
  rateCache.clear();
}
