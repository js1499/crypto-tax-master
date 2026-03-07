import axios from "axios";
import prisma from "@/lib/prisma";
import { rateLimit, API_BASE, COINGECKO_API_KEY } from "./coingecko";

interface OHLCVEntry {
  timestamp: number;
  close: number;
}

// In-memory cache: mint address → OHLCV entries (or null for 404s)
const ohlcvCache = new Map<string, OHLCVEntry[] | null>();

/**
 * Fetch daily close prices for a Solana token by mint address.
 * Uses CoinGecko Pro /onchain/ endpoint (GeckoTerminal data).
 * Returns array of { timestamp, close } or null if not found.
 */
export async function getTokenOHLCVByMint(
  mintAddress: string,
  fromDate: Date,
  toDate: Date,
  maxRetries: number = 3,
): Promise<OHLCVEntry[] | null> {
  // Check in-memory cache first
  if (ohlcvCache.has(mintAddress)) {
    return ohlcvCache.get(mintAddress) || null;
  }

  const allEntries: OHLCVEntry[] = [];
  // CoinGecko on-chain OHLCV: limit=1000 gives ~1000 daily candles (~2.7 years)
  // Paginate with before_timestamp if range is larger
  let beforeTimestamp = Math.floor(toDate.getTime() / 1000);
  const fromTimestamp = Math.floor(fromDate.getTime() / 1000);

  while (true) {
    let data: any = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        await rateLimit();

        const url = `${API_BASE}/onchain/networks/solana/tokens/${mintAddress}/ohlcv/day`;
        const params: any = {
          limit: 1000,
          currency: "usd",
          before_timestamp: beforeTimestamp,
        };
        if (COINGECKO_API_KEY) {
          params.x_cg_pro_api_key = COINGECKO_API_KEY;
        }

        const response = await axios.get(url, { params, timeout: 15000 });
        data = response.data;
        break; // success
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 404) {
          // Token not tracked on-chain
          ohlcvCache.set(mintAddress, null);
          return null;
        }
        if (axios.isAxiosError(error) && error.response?.status === 429 && attempt < maxRetries) {
          const backoffMs = Math.min(2000 * Math.pow(2, attempt), 30000);
          console.warn(
            `[OnChain] 429 rate limited for ${mintAddress.slice(0, 8)}..., retrying in ${backoffMs / 1000}s (attempt ${attempt + 1}/${maxRetries})...`
          );
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
          continue;
        }
        console.warn(
          `[OnChain] OHLCV fetch failed for ${mintAddress.slice(0, 8)}...:`,
          axios.isAxiosError(error) ? `${error.response?.status} ${error.message}` : error
        );
        ohlcvCache.set(mintAddress, allEntries.length > 0 ? allEntries : null);
        return allEntries.length > 0 ? allEntries : null;
      }
    }

    if (!data) break;

    // Response format: { data: { attributes: { ohlcv_list: [[ts, o, h, l, c, v], ...] } } }
    const ohlcvList: number[][] = data?.data?.attributes?.ohlcv_list;
    if (!ohlcvList || ohlcvList.length === 0) break;

    for (const candle of ohlcvList) {
      const ts = candle[0]; // Unix timestamp in seconds
      const close = candle[4]; // close price
      if (ts >= fromTimestamp) {
        allEntries.push({ timestamp: ts, close });
      }
    }

    // Find the oldest timestamp in this batch
    const oldestTs = ohlcvList[ohlcvList.length - 1][0];

    // If oldest entry is already before our fromDate, we have all we need
    if (oldestTs <= fromTimestamp) break;

    // If we got fewer than 1000 candles, no more data to fetch
    if (ohlcvList.length < 1000) break;

    // Paginate: set before_timestamp to oldest entry
    beforeTimestamp = oldestTs;
  }

  ohlcvCache.set(mintAddress, allEntries.length > 0 ? allEntries : null);
  return allEntries.length > 0 ? allEntries : null;
}

/**
 * Load persistent cache from DB: mints that previously returned 404/no data.
 * Returns a Set of mint addresses to skip.
 */
async function loadFailedMintsFromDB(): Promise<Set<string>> {
  try {
    const rows = await prisma.ohlcvMintCache.findMany({
      where: { has_data: false },
      select: { mint_address: true },
    });
    return new Set(rows.map(r => r.mint_address));
  } catch {
    return new Set();
  }
}

/**
 * Persist OHLCV lookup results to DB cache.
 * Inserts mints with has_data=true/false so future runs can skip 404s.
 */
async function persistOHLCVResults(
  results: Map<string, OHLCVEntry[]>,
  allQueriedMints: string[],
): Promise<void> {
  if (allQueriedMints.length === 0) return;

  try {
    const values = allQueriedMints.map(mint => {
      const hasData = results.has(mint);
      return `('${mint}', ${hasData}, NOW())`;
    }).join(",\n");

    await prisma.$executeRawUnsafe(`
      INSERT INTO "ohlcv_mint_cache" (mint_address, has_data, checked_at)
      VALUES ${values}
      ON CONFLICT (mint_address)
      DO UPDATE SET has_data = EXCLUDED.has_data, checked_at = EXCLUDED.checked_at
    `);
  } catch (error) {
    console.warn("[OnChain] Failed to persist OHLCV cache:", error);
  }
}

/**
 * Batch-fetch OHLCV for multiple mint addresses.
 * Processes sequentially respecting shared rate limit.
 * Skips mints that previously returned 404 (persisted in DB).
 * Returns Map<mintAddress, OHLCVEntry[]>.
 */
export async function batchGetTokenOHLCV(
  mints: string[],
  fromDate: Date,
  toDate: Date,
  onProgress?: (done: number, total: number, resolved: number) => void,
): Promise<Map<string, OHLCVEntry[]>> {
  const results = new Map<string, OHLCVEntry[]>();

  // Load persistent cache of previously failed mints
  const failedMints = await loadFailedMintsFromDB();
  const skippedFromCache = mints.filter(m => failedMints.has(m));
  const mintsToQuery = mints.filter(m => !failedMints.has(m));

  if (skippedFromCache.length > 0) {
    console.log(`[OnChain] Skipping ${skippedFromCache.length}/${mints.length} mints (previously failed, cached in DB)`);
  }

  const queriedMints: string[] = [];

  for (let i = 0; i < mintsToQuery.length; i++) {
    const mint = mintsToQuery[i];
    const entries = await getTokenOHLCVByMint(mint, fromDate, toDate);
    queriedMints.push(mint);
    if (entries && entries.length > 0) {
      results.set(mint, entries);
    }

    if (onProgress && (i + 1) % 200 === 0) {
      onProgress(i + 1, mintsToQuery.length, results.size);
    }
  }

  // Final progress callback
  if (onProgress) {
    onProgress(mintsToQuery.length, mintsToQuery.length, results.size);
  }

  // Persist results to DB for future runs
  await persistOHLCVResults(results, queriedMints);

  return results;
}
