import axios from "axios";
import prisma from "@/lib/prisma";
import { rateLimit, API_BASE, COINGECKO_API_KEY } from "./coingecko";

export interface OHLCVEntry {
  timestamp: number;
  close: number;
}

// In-memory cache: mint address → OHLCV entries (or null for 404s)
const ohlcvCache = new Map<string, OHLCVEntry[] | null>();

// GeckoTerminal free API
const GECKO_TERMINAL_BASE = "https://api.geckoterminal.com/api/v2";
const GECKO_TERMINAL_RATE_LIMIT_MS = 2100; // ~30 calls/min free tier
let lastGeckoTerminalCall = 0;

async function geckoTerminalRateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastGeckoTerminalCall;
  if (elapsed < GECKO_TERMINAL_RATE_LIMIT_MS) {
    await new Promise(r => setTimeout(r, GECKO_TERMINAL_RATE_LIMIT_MS - elapsed));
  }
  lastGeckoTerminalCall = Date.now();
}

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

// In-memory cache for minute-level OHLCV: "mint:YYYY-MM-DD" → entries
const minuteOhlcvCache = new Map<string, OHLCVEntry[] | null>();

/**
 * Fetch minute-level OHLCV candles for a specific calendar day for a given token.
 * Uses CoinGecko Pro /onchain/ endpoint with /ohlcv/minute timeframe.
 * Returns sorted (ascending) array of {timestamp, close} entries.
 * ~1440 minutes per day → needs 2 API calls at limit=1000.
 * Available on CoinGecko Analyst plan ($129/mo), data from Sep 2021+.
 */
export async function getMinuteOHLCVForDay(
  mintAddress: string,
  date: Date,
  maxRetries: number = 3,
): Promise<OHLCVEntry[] | null> {
  const dayStr = date.toISOString().split("T")[0];
  const cacheKey = `${mintAddress}:${dayStr}`;

  if (minuteOhlcvCache.has(cacheKey)) {
    return minuteOhlcvCache.get(cacheKey) || null;
  }

  const dayStart = new Date(dayStr + "T00:00:00Z");
  const dayEnd = new Date(dayStr + "T23:59:59Z");
  const fromTimestamp = Math.floor(dayStart.getTime() / 1000);
  let beforeTimestamp = Math.floor(dayEnd.getTime() / 1000) + 61; // +61s to include last minute

  const allEntries: OHLCVEntry[] = [];

  while (true) {
    let data: any = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        await rateLimit();

        const url = `${API_BASE}/onchain/networks/solana/tokens/${mintAddress}/ohlcv/minute`;
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
        break;
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 404) {
          minuteOhlcvCache.set(cacheKey, null);
          return null;
        }
        if (axios.isAxiosError(error) && error.response?.status === 429 && attempt < maxRetries) {
          const backoffMs = Math.min(2000 * Math.pow(2, attempt), 30000);
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
          continue;
        }
        minuteOhlcvCache.set(cacheKey, allEntries.length > 0 ? allEntries : null);
        return allEntries.length > 0 ? allEntries : null;
      }
    }

    if (!data) break;

    const ohlcvList: number[][] = data?.data?.attributes?.ohlcv_list;
    if (!ohlcvList || ohlcvList.length === 0) break;

    for (const candle of ohlcvList) {
      const ts = candle[0];
      const close = candle[4];
      if (ts >= fromTimestamp) {
        allEntries.push({ timestamp: ts, close });
      }
    }

    const oldestTs = ohlcvList[ohlcvList.length - 1][0];
    if (oldestTs <= fromTimestamp) break;
    if (ohlcvList.length < 1000) break;
    beforeTimestamp = oldestTs;
  }

  // Sort ascending by timestamp for binary search
  allEntries.sort((a, b) => a.timestamp - b.timestamp);
  minuteOhlcvCache.set(cacheKey, allEntries.length > 0 ? allEntries : null);
  return allEntries.length > 0 ? allEntries : null;
}

/**
 * Find the closest price in a sorted array of OHLCV entries for a given timestamp.
 * Uses binary search. Returns the close price of the nearest candle.
 */
export function findClosestPrice(entries: OHLCVEntry[], targetTimestamp: number): number | null {
  if (!entries || entries.length === 0) return null;

  // Binary search for the insertion point
  let lo = 0;
  let hi = entries.length - 1;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (entries[mid].timestamp < targetTimestamp) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }

  // Compare lo and lo-1 to find the closest
  if (lo === 0) return entries[0].close;
  if (lo >= entries.length) return entries[entries.length - 1].close;
  const diffBefore = Math.abs(targetTimestamp - entries[lo - 1].timestamp);
  const diffAfter = Math.abs(targetTimestamp - entries[lo].timestamp);
  return diffBefore <= diffAfter ? entries[lo - 1].close : entries[lo].close;
}

/**
 * Batch-resolve top pool addresses for multiple mints via GeckoTerminal /tokens/multi/.
 * Returns Map<mintAddress, poolAddress> for mints that have at least one pool.
 * Batches up to 30 addresses per API call.
 */
async function batchResolveGeckoTerminalPools(
  mints: string[],
  maxRetries: number = 2,
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const BATCH_SIZE = 30;

  for (let i = 0; i < mints.length; i += BATCH_SIZE) {
    const batch = mints.slice(i, i + BATCH_SIZE);
    const addressList = batch.join(",");

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        await geckoTerminalRateLimit();
        const resp = await axios.get(
          `${GECKO_TERMINAL_BASE}/networks/solana/tokens/multi/${addressList}`,
          { timeout: 15000 },
        );
        const tokens = resp.data?.data;
        if (Array.isArray(tokens)) {
          for (const token of tokens) {
            const mintAddr = token?.attributes?.address;
            const pools = token?.relationships?.top_pools?.data;
            if (mintAddr && pools && pools.length > 0) {
              result.set(mintAddr, pools[0].id.replace("solana_", ""));
            }
          }
        }
        break;
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 429 && attempt < maxRetries) {
          await new Promise(r => setTimeout(r, 3000 * (attempt + 1)));
          continue;
        }
        console.warn(`[OnChain] GeckoTerminal multi-token batch failed:`,
          axios.isAxiosError(error) ? `${error.response?.status} ${error.message}` : error);
        break;
      }
    }

    if (i + BATCH_SIZE < mints.length) {
      console.log(`[OnChain] GeckoTerminal pool resolution: ${Math.min(i + BATCH_SIZE, mints.length)}/${mints.length} checked, ${result.size} have pools`);
    }
  }

  return result;
}

/**
 * Fetch OHLCV for a Solana token via GeckoTerminal free API using a known pool address.
 * Caller must provide the pool address (resolved via batchResolveGeckoTerminalPools).
 */
async function getPoolOHLCVViaGeckoTerminal(
  mintAddress: string,
  poolAddress: string,
  fromDate: Date,
  toDate: Date,
  maxRetries: number = 2,
): Promise<OHLCVEntry[] | null> {
  const cacheKey = `gt_${mintAddress}`;
  if (ohlcvCache.has(cacheKey)) {
    return ohlcvCache.get(cacheKey) || null;
  }

  const allEntries: OHLCVEntry[] = [];
  let beforeTimestamp = Math.floor(toDate.getTime() / 1000);
  const fromTimestamp = Math.floor(fromDate.getTime() / 1000);

  while (true) {
    let data: any = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        await geckoTerminalRateLimit();
        const resp = await axios.get(
          `${GECKO_TERMINAL_BASE}/networks/solana/pools/${poolAddress}/ohlcv/day`,
          {
            params: {
              aggregate: 1,
              limit: 1000,
              currency: "usd",
              before_timestamp: beforeTimestamp,
            },
            timeout: 15000,
          },
        );
        data = resp.data;
        break;
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 429 && attempt < maxRetries) {
          await new Promise(r => setTimeout(r, 3000 * (attempt + 1)));
          continue;
        }
        ohlcvCache.set(cacheKey, allEntries.length > 0 ? allEntries : null);
        return allEntries.length > 0 ? allEntries : null;
      }
    }

    if (!data) break;

    // On first page, verify our token is the base token (OHLCV is for base only)
    if (allEntries.length === 0) {
      const baseAddr = data?.meta?.base?.address;
      if (baseAddr && baseAddr !== mintAddress) {
        ohlcvCache.set(cacheKey, null);
        return null;
      }
    }

    const ohlcvList: number[][] = data?.data?.attributes?.ohlcv_list;
    if (!ohlcvList || ohlcvList.length === 0) break;

    for (const candle of ohlcvList) {
      const ts = candle[0];
      const close = candle[4];
      if (ts >= fromTimestamp) {
        allEntries.push({ timestamp: ts, close });
      }
    }

    const oldestTs = ohlcvList[ohlcvList.length - 1][0];
    if (oldestTs <= fromTimestamp) break;
    if (ohlcvList.length < 1000) break;
    beforeTimestamp = oldestTs;
  }

  ohlcvCache.set(cacheKey, allEntries.length > 0 ? allEntries : null);
  return allEntries.length > 0 ? allEntries : null;
}

/**
 * Load persistent cache from DB: mints that previously returned 404/no data.
 * Returns failed mints and which ones already had GeckoTerminal tried.
 */
async function loadFailedMintsFromDB(): Promise<{
  failedMints: Set<string>;
  gtTriedMints: Set<string>;
}> {
  try {
    const rows = await prisma.ohlcvMintCache.findMany({
      where: { has_data: false },
      select: { mint_address: true, gt_tried: true },
    });
    return {
      failedMints: new Set(rows.map(r => r.mint_address)),
      gtTriedMints: new Set(rows.filter(r => r.gt_tried).map(r => r.mint_address)),
    };
  } catch {
    return { failedMints: new Set(), gtTriedMints: new Set() };
  }
}

/**
 * Persist OHLCV lookup results to DB cache.
 * Inserts mints with has_data=true/false so future runs can skip 404s.
 * gtTriedMints marks mints where GeckoTerminal was also tried.
 */
async function persistOHLCVResults(
  results: Map<string, OHLCVEntry[]>,
  allQueriedMints: string[],
  gtTriedMints: Set<string> = new Set(),
): Promise<void> {
  if (allQueriedMints.length === 0) return;

  try {
    const values = allQueriedMints.map(mint => {
      const hasData = results.has(mint);
      const gtTried = gtTriedMints.has(mint);
      return `('${mint}', ${hasData}, ${gtTried}, NOW())`;
    }).join(",\n");

    await prisma.$executeRawUnsafe(`
      INSERT INTO "ohlcv_mint_cache" (mint_address, has_data, gt_tried, checked_at)
      VALUES ${values}
      ON CONFLICT (mint_address)
      DO UPDATE SET has_data = EXCLUDED.has_data, gt_tried = EXCLUDED.gt_tried, checked_at = EXCLUDED.checked_at
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
  const { failedMints, gtTriedMints } = await loadFailedMintsFromDB();
  const skippedFromCache = mints.filter(m => failedMints.has(m));
  const mintsToQuery = mints.filter(m => !failedMints.has(m));
  // Mints that failed CG Pro but haven't been tried on GeckoTerminal yet
  const cachedNeedGT = skippedFromCache.filter(m => !gtTriedMints.has(m));

  if (skippedFromCache.length > 0) {
    console.log(`[OnChain] Skipping ${skippedFromCache.length}/${mints.length} mints from CG Pro (cached). ${cachedNeedGT.length} still need GeckoTerminal.`);
  }

  const queriedMints: string[] = [];
  const cgFailedMints: string[] = []; // Mints that failed CoinGecko Pro, to try GeckoTerminal

  for (let i = 0; i < mintsToQuery.length; i++) {
    const mint = mintsToQuery[i];
    const entries = await getTokenOHLCVByMint(mint, fromDate, toDate);
    queriedMints.push(mint);
    if (entries && entries.length > 0) {
      results.set(mint, entries);
    } else {
      cgFailedMints.push(mint);
    }

    if (onProgress && (i + 1) % 200 === 0) {
      onProgress(i + 1, mintsToQuery.length, results.size);
    }
  }

  // Final progress for CoinGecko Pro phase
  if (onProgress) {
    onProgress(mintsToQuery.length, mintsToQuery.length, results.size);
  }

  // Phase 2: Try GeckoTerminal free API (pool-based OHLCV) for failed mints
  // Includes fresh CG Pro failures + cached failures that haven't tried GT yet
  const gtCandidates = [...cgFailedMints, ...cachedNeedGT];
  if (gtCandidates.length > 0) {
    console.log(`[OnChain] Trying GeckoTerminal for ${gtCandidates.length} mints (${cgFailedMints.length} fresh + ${cachedNeedGT.length} cached, GT-untried)...`);

    // Step 1: Batch-resolve pool addresses (30 per API call)
    const mintToPool = await batchResolveGeckoTerminalPools(gtCandidates);
    console.log(`[OnChain] GeckoTerminal: ${mintToPool.size}/${gtCandidates.length} have pools, fetching OHLCV...`);

    // Step 2: Fetch OHLCV only for mints that have pools
    let gtResolved = 0;
    const poolMints = gtCandidates.filter(m => mintToPool.has(m));
    for (let i = 0; i < poolMints.length; i++) {
      const mint = poolMints[i];
      const poolAddr = mintToPool.get(mint)!;
      const entries = await getPoolOHLCVViaGeckoTerminal(mint, poolAddr, fromDate, toDate);
      if (entries && entries.length > 0) {
        results.set(mint, entries);
        gtResolved++;
      }
      if ((i + 1) % 50 === 0) {
        console.log(`[OnChain] GeckoTerminal OHLCV: ${i + 1}/${poolMints.length} (${gtResolved} resolved)`);
      }
    }
    console.log(`[OnChain] GeckoTerminal: ${gtResolved}/${gtCandidates.length} resolved via pool-based OHLCV`);
  }

  // Persist results to DB for future runs
  // Include GT candidates so mints resolved via GeckoTerminal get has_data=true
  const allQueriedMints = [...new Set([...queriedMints, ...gtCandidates])];
  const allGtTried = new Set(gtCandidates);
  await persistOHLCVResults(results, allQueriedMints, allGtTried);

  return results;
}
