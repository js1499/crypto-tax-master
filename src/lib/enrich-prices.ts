import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { getCoinGeckoId, getPriceRange, getCurrentPrice } from "@/lib/coingecko";
import { batchGetTokenOHLCV } from "./onchain-prices";

const log = (msg: string) => console.log(`[Enrich] ${msg}`);
const warn = (msg: string) => console.warn(`[Enrich] ${msg}`);

export interface EnrichResult {
  status: "success" | "error";
  updated: number;
  total: number;
  skipped: number;
  mainPriced: number;
  feeCorrected: number;
  incomingPriced: number;
  onchainResolved: number;
  onchainFailed: number;
  fallbackSymbols: string[];
  durationMs: number;
  error?: string;
}

/**
 * Enrich transactions with CoinGecko historical prices.
 * Two-phase approach:
 *   Phase A: Price known symbols (SOL, USDC, etc.) immediately
 *   Phase B: Price unknown tokens via on-chain OHLCV by mint address
 *
 * @param walletAddress - if provided, only enrich transactions for this wallet address
 * @param userId - required for all-transactions mode (when walletAddress is omitted)
 */
export async function enrichHistoricalPrices(
  walletAddress?: string,
  userId?: string,
): Promise<EnrichResult> {
  const startTime = Date.now();

  log(`── enrichHistoricalPrices called ──`);
  log(`  walletAddress=${walletAddress || "(all)"}, userId=${userId || "(none)"}`);

  try {
    // ── Step 1: Build transaction query ──────────────────────────────
    let where: Prisma.TransactionWhereInput;
    let label: string;

    if (walletAddress) {
      where = { wallet_address: walletAddress };
      label = walletAddress.slice(0, 8);
    } else if (userId) {
      // All-transactions mode: wallets + CSV + exchange imports
      const userWithWallets = await prisma.user.findUnique({
        where: { id: userId },
        include: { wallets: true },
      });
      const walletAddresses = userWithWallets?.wallets.map((w) => w.address) || [];

      const orConditions: Prisma.TransactionWhereInput[] = [];
      if (walletAddresses.length > 0) {
        orConditions.push({ wallet_address: { in: walletAddresses } });
      }
      orConditions.push({
        AND: [{ source_type: "csv_import" }, { wallet_address: null }],
      });
      const userExchanges = await prisma.exchange.findMany({
        where: { userId },
        select: { name: true },
      });
      if (userExchanges.length > 0) {
        orConditions.push({
          AND: [
            { source_type: "exchange_api" },
            { source: { in: userExchanges.map((e) => e.name) } },
          ],
        });
      }
      where = { OR: orConditions };
      label = `user ${userId} (all transactions)`;
    } else {
      log(`No walletAddress or userId provided, nothing to enrich`);
      return { status: "success", updated: 0, total: 0, skipped: 0, mainPriced: 0, feeCorrected: 0, incomingPriced: 0, onchainResolved: 0, onchainFailed: 0, fallbackSymbols: [], durationMs: 0 };
    }

    // ── Step 2: Fetch transactions ───────────────────────────────────
    log(`Querying transactions for ${label}...`);

    const transactions = await prisma.transaction.findMany({
      where,
      select: {
        id: true,
        asset_symbol: true,
        tx_timestamp: true,
        amount_value: true,
        fee_usd: true,
        incoming_asset_symbol: true,
        incoming_asset_address: true,
        incoming_amount_value: true,
        incoming_value_usd: true,
        price_per_unit: true,
        value_usd: true,
        chain: true,
        asset_address: true,
      },
    });

    log(`Found ${transactions.length} transactions`);

    if (transactions.length === 0) {
      return { status: "success", updated: 0, total: 0, skipped: 0, mainPriced: 0, feeCorrected: 0, incomingPriced: 0, onchainResolved: 0, onchainFailed: 0, fallbackSymbols: [], durationMs: Date.now() - startTime };
    }

    // ── Step 3: Date range ───────────────────────────────────────────
    let minDate = transactions[0].tx_timestamp;
    let maxDate = transactions[0].tx_timestamp;
    for (const tx of transactions) {
      if (tx.tx_timestamp < minDate) minDate = tx.tx_timestamp;
      if (tx.tx_timestamp > maxDate) maxDate = tx.tx_timestamp;
    }
    const rangeStart = new Date(minDate.getTime() - 86400000);
    const rangeEnd = new Date(maxDate.getTime() + 86400000);

    log(`Date range: ${rangeStart.toISOString().split("T")[0]} → ${rangeEnd.toISOString().split("T")[0]}`);

    // ── Step 4: Collect symbols + split known vs unknown ─────────────
    const allSymbols = new Set<string>();
    allSymbols.add("SOL");

    for (const tx of transactions) {
      if (tx.asset_symbol) allSymbols.add(tx.asset_symbol.toUpperCase());
      if (tx.incoming_asset_symbol) allSymbols.add(tx.incoming_asset_symbol.toUpperCase());
    }

    const knownSymbols = Array.from(allSymbols).filter((s) => getCoinGeckoId(s));
    const unknownMints = new Map<string, string>(); // mint address → symbol
    for (const tx of transactions) {
      if (tx.asset_address && !getCoinGeckoId(tx.asset_symbol)) {
        unknownMints.set(tx.asset_address, tx.asset_symbol);
      }
      if (tx.incoming_asset_address && tx.incoming_asset_symbol && !getCoinGeckoId(tx.incoming_asset_symbol)) {
        unknownMints.set(tx.incoming_asset_address, tx.incoming_asset_symbol);
      }
    }

    log(`${allSymbols.size} unique symbols: ${knownSymbols.length} known, ${unknownMints.size} unknown mints`);

    // ══════════════════════════════════════════════════════════════════
    // ── PHASE A: Price known symbols (fast) ──────────────────────────
    // ══════════════════════════════════════════════════════════════════
    log(`── Phase A: Pricing ${knownSymbols.length} known symbols ──`);

    // Step 5: Fetch historical price ranges for known symbols
    const priceMap = new Map<string, number>();
    const priceFetchFailed: string[] = [];

    for (let idx = 0; idx < knownSymbols.length; idx++) {
      const symbol = knownSymbols[idx];
      try {
        const prices = await getPriceRange(symbol, rangeStart, rangeEnd);
        if (prices && prices.length > 0) {
          for (const entry of prices) {
            const dateKey = entry.date.split("T")[0];
            priceMap.set(`${symbol}:${dateKey}`, entry.price);
          }
          log(`  [${idx + 1}/${knownSymbols.length}] ${symbol}: ${prices.length} daily prices fetched`);
        } else {
          priceFetchFailed.push(symbol);
          warn(`  [${idx + 1}/${knownSymbols.length}] ${symbol}: no price data returned`);
        }
      } catch (err) {
        priceFetchFailed.push(symbol);
        warn(`  [${idx + 1}/${knownSymbols.length}] ${symbol}: fetch error — ${err instanceof Error ? err.message : err}`);
      }
    }

    log(`Phase A price map: ${priceMap.size} date-price entries`);
    if (priceFetchFailed.length > 0) {
      warn(`Failed to fetch prices for: ${priceFetchFailed.join(", ")}`);
    }

    // Step 6: Current SOL price for fee correction
    const currentSolPrice = await getCurrentPrice("SOL");
    log(`Current SOL price for fee correction: $${currentSolPrice?.toFixed(2) || "N/A"}`);

    function lookupPrice(symbol: string, date: Date): number | null {
      const dateStr = date.toISOString().split("T")[0];
      const key = `${symbol.toUpperCase()}:${dateStr}`;
      const exact = priceMap.get(key);
      if (exact !== undefined) return exact;

      const prev = new Date(date.getTime() - 86400000).toISOString().split("T")[0];
      const next = new Date(date.getTime() + 86400000).toISOString().split("T")[0];
      const prevPrice = priceMap.get(`${symbol.toUpperCase()}:${prev}`);
      if (prevPrice !== undefined) return prevPrice;
      const nextPrice = priceMap.get(`${symbol.toUpperCase()}:${next}`);
      if (nextPrice !== undefined) return nextPrice;

      return null;
    }

    // Step 7: Update ALL transactions with known-symbol prices (bulk SQL)
    log(`Phase A: Computing price updates for ${transactions.length} transactions...`);

    let updated = 0;
    let skipped = 0;
    let mainPriced = 0;
    let feeCorrected = 0;
    let incomingPriced = 0;
    const fallbackSymbols = new Set<string>();
    const BATCH_SIZE = 500;

    // Track which transactions still need pricing (for Phase B)
    const unpricedTxIds = new Set<number>();

    // Pre-compute all updates in memory first (no DB calls)
    interface BulkRow {
      id: number;
      price_per_unit: number | null;
      value_usd: number | null;
      fee_usd: number | null;
      incoming_value_usd: number | null;
    }
    const bulkRows: BulkRow[] = [];

    for (const tx of transactions) {
      let mainUnpriced = false;
      let incomingUnpriced = false;
      let ppu: number | null = null;
      let vusd: number | null = null;
      let fusd: number | null = null;
      let iusd: number | null = null;
      let didUpdate = false;

      // Main asset price
      const historicalPrice = lookupPrice(tx.asset_symbol, tx.tx_timestamp);
      if (historicalPrice !== null) {
        ppu = historicalPrice;
        vusd = Math.abs(Number(tx.amount_value) * historicalPrice);
        didUpdate = true;
        mainPriced++;
      } else {
        mainUnpriced = true;
      }

      // Fee correction using historical SOL price
      if (tx.fee_usd && currentSolPrice && currentSolPrice > 0) {
        const historicalSolPrice = lookupPrice("SOL", tx.tx_timestamp);
        if (historicalSolPrice !== null) {
          const feeSol = Number(tx.fee_usd) / currentSolPrice;
          fusd = feeSol * historicalSolPrice;
          didUpdate = true;
          feeCorrected++;
        }
      }

      // Incoming asset price
      if (tx.incoming_asset_symbol && tx.incoming_amount_value) {
        const incomingPrice = lookupPrice(tx.incoming_asset_symbol, tx.tx_timestamp);
        if (incomingPrice !== null) {
          iusd = Math.abs(Number(tx.incoming_amount_value) * incomingPrice);
          didUpdate = true;
          incomingPriced++;
        } else {
          incomingUnpriced = true;
        }
      }

      if (didUpdate) {
        bulkRows.push({ id: tx.id, price_per_unit: ppu, value_usd: vusd, fee_usd: fusd, incoming_value_usd: iusd });
        updated++;
      }

      if (mainUnpriced || incomingUnpriced) {
        unpricedTxIds.add(tx.id);
        if (!didUpdate) skipped++;
      } else if (!didUpdate) {
        skipped++;
      }
    }

    log(`Phase A: ${bulkRows.length} rows to update, ${skipped} skipped — writing to DB in batches of ${BATCH_SIZE}...`);

    // Bulk SQL UPDATE using VALUES + JOIN (one query per batch instead of N individual UPDATEs)
    for (let i = 0; i < bulkRows.length; i += BATCH_SIZE) {
      const batch = bulkRows.slice(i, i + BATCH_SIZE);

      const valuesClauses = batch.map(
        (r) =>
          `(${r.id}, ${r.price_per_unit ?? "NULL"}::decimal, ${r.value_usd ?? "NULL"}::decimal, ${r.fee_usd ?? "NULL"}::decimal, ${r.incoming_value_usd ?? "NULL"}::decimal)`
      );

      const sql = `
        UPDATE "transactions" AS t SET
          price_per_unit = COALESCE(v.new_ppu, t.price_per_unit),
          value_usd = COALESCE(v.new_vusd, t.value_usd),
          fee_usd = COALESCE(v.new_fusd, t.fee_usd),
          incoming_value_usd = COALESCE(v.new_iusd, t.incoming_value_usd)
        FROM (VALUES ${valuesClauses.join(",")})
          AS v(id, new_ppu, new_vusd, new_fusd, new_iusd)
        WHERE t.id = v.id
      `;
      await prisma.$executeRawUnsafe(sql);

      if ((i + BATCH_SIZE) % 2000 === 0 || i + BATCH_SIZE >= bulkRows.length) {
        log(`  Phase A DB progress: ${Math.min(i + BATCH_SIZE, bulkRows.length)}/${bulkRows.length} rows written`);
      }
    }

    const phaseADuration = ((Date.now() - startTime) / 1000).toFixed(1);
    log(`── Phase A complete (${phaseADuration}s) ──`);
    log(`  Known-symbol prices: ${mainPriced} main, ${feeCorrected} fees, ${incomingPriced} incoming`);
    log(`  Unpriced transactions: ${unpricedTxIds.size} (candidates for Phase B)`);

    // ══════════════════════════════════════════════════════════════════
    // ── PHASE B: On-chain OHLCV for unknown tokens ───────────────────
    // ══════════════════════════════════════════════════════════════════
    let onchainResolved = 0;
    let onchainFailed = 0;

    if (unknownMints.size > 0) {
      log(`── Phase B: Fetching on-chain OHLCV for ${unknownMints.size} unknown mints ──`);

      const phaseBStart = Date.now();
      const mintAddresses = Array.from(unknownMints.keys());

      const ohlcvResults = await batchGetTokenOHLCV(
        mintAddresses,
        rangeStart,
        rangeEnd,
        (done, total) => {
          log(`  Phase B OHLCV progress: ${done}/${total} mints processed (${onchainResolved} resolved)`);
        },
      );

      // Build price entries from OHLCV close prices
      for (const [mint, entries] of ohlcvResults) {
        const symbol = unknownMints.get(mint);
        if (!symbol) continue;
        onchainResolved++;

        for (const entry of entries) {
          const dateStr = new Date(entry.timestamp * 1000).toISOString().split("T")[0];
          priceMap.set(`${symbol.toUpperCase()}:${dateStr}`, entry.close);
        }
      }

      onchainFailed = unknownMints.size - onchainResolved;
      log(`Phase B OHLCV: ${onchainResolved} tokens resolved, ${onchainFailed} not found`);

      // Step 10: Update remaining unpriced transactions with Phase B prices
      const unpricedTransactions = transactions.filter((tx) => unpricedTxIds.has(tx.id));

      if (unpricedTransactions.length > 0 && onchainResolved > 0) {
        log(`Phase B: Computing updates for ${unpricedTransactions.length} previously-unpriced transactions...`);

        let phaseBUpdated = 0;
        let phaseBMainPriced = 0;
        let phaseBIncomingPriced = 0;
        const phaseBRows: BulkRow[] = [];

        for (const tx of unpricedTransactions) {
          let ppu: number | null = null;
          let vusd: number | null = null;
          let iusd: number | null = null;
          let didUpdate = false;

          // Try main asset price (may now be in priceMap from OHLCV data)
          const historicalPrice = lookupPrice(tx.asset_symbol, tx.tx_timestamp);
          if (historicalPrice !== null) {
            ppu = historicalPrice;
            vusd = Math.abs(Number(tx.amount_value) * historicalPrice);
            didUpdate = true;
            phaseBMainPriced++;
          } else {
            if (!getCoinGeckoId(tx.asset_symbol)) {
              fallbackSymbols.add(tx.asset_symbol);
            }
          }

          // Try incoming asset price
          if (tx.incoming_asset_symbol && tx.incoming_amount_value) {
            const incomingPrice = lookupPrice(tx.incoming_asset_symbol, tx.tx_timestamp);
            if (incomingPrice !== null) {
              iusd = Math.abs(Number(tx.incoming_amount_value) * incomingPrice);
              didUpdate = true;
              phaseBIncomingPriced++;
            } else if (!getCoinGeckoId(tx.incoming_asset_symbol)) {
              fallbackSymbols.add(tx.incoming_asset_symbol);
            }
          }

          if (didUpdate) {
            phaseBRows.push({ id: tx.id, price_per_unit: ppu, value_usd: vusd, fee_usd: null, incoming_value_usd: iusd });
            phaseBUpdated++;
          }
        }

        // Bulk SQL UPDATE for Phase B
        log(`Phase B: ${phaseBRows.length} rows to update — writing to DB...`);
        for (let i = 0; i < phaseBRows.length; i += BATCH_SIZE) {
          const batch = phaseBRows.slice(i, i + BATCH_SIZE);
          const valuesClauses = batch.map(
            (r) =>
              `(${r.id}, ${r.price_per_unit ?? "NULL"}::decimal, ${r.value_usd ?? "NULL"}::decimal, ${r.fee_usd ?? "NULL"}::decimal, ${r.incoming_value_usd ?? "NULL"}::decimal)`
          );
          const sql = `
            UPDATE "transactions" AS t SET
              price_per_unit = COALESCE(v.new_ppu, t.price_per_unit),
              value_usd = COALESCE(v.new_vusd, t.value_usd),
              fee_usd = COALESCE(v.new_fusd, t.fee_usd),
              incoming_value_usd = COALESCE(v.new_iusd, t.incoming_value_usd)
            FROM (VALUES ${valuesClauses.join(",")})
              AS v(id, new_ppu, new_vusd, new_fusd, new_iusd)
            WHERE t.id = v.id
          `;
          await prisma.$executeRawUnsafe(sql);
        }

        // Adjust totals
        updated += phaseBUpdated;
        mainPriced += phaseBMainPriced;
        incomingPriced += phaseBIncomingPriced;
        skipped = Math.max(0, skipped - phaseBUpdated);

        const phaseBDuration = ((Date.now() - phaseBStart) / 1000).toFixed(1);
        log(`── Phase B complete (${phaseBDuration}s) ──`);
        log(`  On-chain prices applied: ${phaseBMainPriced} main, ${phaseBIncomingPriced} incoming`);
      } else {
        log(`Phase B: No new prices to apply (${onchainResolved} resolved but 0 unpriced transactions)`);
      }
    } else {
      log(`── Phase B: Skipped (no unknown mints) ──`);
    }

    // ── Summary ──────────────────────────────────────────────────────
    const fallbackList = Array.from(fallbackSymbols);
    const durationMs = Date.now() - startTime;

    log(`─── Enrichment complete ───`);
    log(`  Duration:        ${(durationMs / 1000).toFixed(1)}s`);
    log(`  Transactions:    ${transactions.length} total`);
    log(`  Updated:         ${updated} (${mainPriced} main prices, ${feeCorrected} fees, ${incomingPriced} incoming prices)`);
    log(`  On-chain OHLCV:  ${onchainResolved} tokens resolved, ${onchainFailed} not found`);
    log(`  Skipped:         ${skipped} (no price data available)`);
    if (fallbackList.length > 0) {
      log(`  Unpriceable:     ${fallbackList.join(", ")}`);
    }

    return {
      status: "success",
      updated,
      total: transactions.length,
      skipped,
      mainPriced,
      feeCorrected,
      incomingPriced,
      onchainResolved,
      onchainFailed,
      fallbackSymbols: fallbackList,
      durationMs,
    };
  } catch (error) {
    console.error("[Enrich] FATAL error:", error);
    return {
      status: "error",
      updated: 0,
      total: 0,
      skipped: 0,
      mainPriced: 0,
      feeCorrected: 0,
      incomingPriced: 0,
      onchainResolved: 0,
      onchainFailed: 0,
      fallbackSymbols: [],
      durationMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
