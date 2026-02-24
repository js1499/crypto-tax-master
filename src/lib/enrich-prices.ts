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
  swapPriced: number;
  nftPriced: number;
  transferPriced: number;
  feeCorrected: number;
  mirrorPriced: number;
  onchainResolved: number;
  onchainFailed: number;
  fallbackSymbols: string[];
  durationMs: number;
  error?: string;
}

interface BulkRow {
  id: number;
  price_per_unit: number | null;
  value_usd: number | null;
  fee_usd: number | null;
  incoming_value_usd: number | null;
}

const BATCH_SIZE = 500;

async function bulkUpdateTransactions(rows: BulkRow[]): Promise<void> {
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
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
}

/**
 * Enrich transactions with historical prices.
 * On-chain-first approach:
 *   Phase 0: Fetch SOL daily price history (1 API call)
 *   Phase 1: Price SWAPs from Helius swap events (DB reads + SOL price)
 *   Phase 2: Price NFT sales from Helius nft events (DB reads + SOL price)
 *   Phase 3: Price transfers via known CoinGecko symbols
 *   Phase 4: Mirror priced swap sides to unpriced counterparties
 *   Phase 5: OHLCV fallback for remaining unknown tokens
 */
export async function enrichHistoricalPrices(
  walletAddress?: string,
  userId?: string,
): Promise<EnrichResult> {
  const startTime = Date.now();
  const emptyResult = (): EnrichResult => ({
    status: "success", updated: 0, total: 0, skipped: 0,
    swapPriced: 0, nftPriced: 0, transferPriced: 0,
    feeCorrected: 0, mirrorPriced: 0,
    onchainResolved: 0, onchainFailed: 0,
    fallbackSymbols: [], durationMs: Date.now() - startTime,
  });

  log(`── enrichHistoricalPrices called ──`);
  log(`  walletAddress=${walletAddress || "(all)"}, userId=${userId || "(none)"}`);

  try {
    // ── Step 1: Build transaction query ──
    let where: Prisma.TransactionWhereInput;
    let label: string;

    if (walletAddress) {
      where = { wallet_address: walletAddress };
      label = walletAddress.slice(0, 8);
    } else if (userId) {
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
      return emptyResult();
    }

    // ── Step 2: Fetch transactions ──
    log(`Querying transactions for ${label}...`);
    const transactions = await prisma.transaction.findMany({
      where,
      select: {
        id: true,
        type: true,
        tx_hash: true,
        asset_symbol: true,
        asset_address: true,
        amount_value: true,
        incoming_asset_symbol: true,
        incoming_asset_address: true,
        incoming_amount_value: true,
        incoming_value_usd: true,
        price_per_unit: true,
        value_usd: true,
        fee_usd: true,
        tx_timestamp: true,
        chain: true,
      },
    });

    log(`Found ${transactions.length} transactions`);
    if (transactions.length === 0) return emptyResult();

    // ── Step 3: Date range ──
    let minDate = transactions[0].tx_timestamp;
    let maxDate = transactions[0].tx_timestamp;
    for (const tx of transactions) {
      if (tx.tx_timestamp < minDate) minDate = tx.tx_timestamp;
      if (tx.tx_timestamp > maxDate) maxDate = tx.tx_timestamp;
    }
    const rangeStart = new Date(minDate.getTime() - 86400000);
    const rangeEnd = new Date(maxDate.getTime() + 86400000);
    log(`Date range: ${rangeStart.toISOString().split("T")[0]} → ${rangeEnd.toISOString().split("T")[0]}`);

    const txById = new Map(transactions.map(tx => [tx.id, tx]));

    // ══════════════════════════════════════════════════════════════════
    // ── PHASE 0: Fetch SOL daily price history (1 API call) ──────────
    // ══════════════════════════════════════════════════════════════════
    log(`── Phase 0: Fetching SOL daily price history ──`);
    const solPriceMap = new Map<string, number>();

    const solPrices = await getPriceRange("SOL", rangeStart, rangeEnd);
    if (solPrices && solPrices.length > 0) {
      for (const entry of solPrices) {
        solPriceMap.set(entry.date.split("T")[0], entry.price);
      }
      log(`  SOL: ${solPriceMap.size} daily prices loaded`);
    } else {
      warn(`  Failed to fetch SOL prices — on-chain pricing will be limited`);
    }

    function lookupSolPrice(date: Date): number | null {
      const dateStr = date.toISOString().split("T")[0];
      const exact = solPriceMap.get(dateStr);
      if (exact !== undefined) return exact;
      const prev = new Date(date.getTime() - 86400000).toISOString().split("T")[0];
      const next = new Date(date.getTime() + 86400000).toISOString().split("T")[0];
      return solPriceMap.get(prev) ?? solPriceMap.get(next) ?? null;
    }

    // Stats
    let updated = 0;
    let swapPriced = 0;
    let nftPriced = 0;
    let transferPriced = 0;
    let feeCorrected = 0;
    let mirrorPriced = 0;
    const pricedIds = new Set<number>();

    // ══════════════════════════════════════════════════════════════════
    // ── PHASE 1: Price SWAPs from Helius on-chain data ───────────────
    // ══════════════════════════════════════════════════════════════════
    const swapTxIds = transactions
      .filter(tx => tx.type === "SWAP" && tx.tx_hash)
      .map(tx => tx.id);

    log(`── Phase 1: Pricing ${swapTxIds.length} SWAPs from Helius on-chain data ──`);

    if (swapTxIds.length > 0 && solPriceMap.size > 0) {
      const phase1Rows: BulkRow[] = [];

      for (let i = 0; i < swapTxIds.length; i += 1000) {
        const batchIds = swapTxIds.slice(i, i + 1000);

        const heliusRows = await prisma.$queryRawUnsafe<Array<{
          id: number;
          native_input_lamports: string | null;
          native_output_lamports: string | null;
        }>>(`
          SELECT DISTINCT ON (t.id)
            t.id,
            (h.raw_payload->'events'->'swap'->'nativeInput'->>'amount') as native_input_lamports,
            (h.raw_payload->'events'->'swap'->'nativeOutput'->>'amount') as native_output_lamports
          FROM transactions t
          JOIN helius_raw_transactions h ON SPLIT_PART(t.tx_hash, '-', 1) = h.signature
          WHERE t.id IN (${batchIds.join(",")})
          AND h.raw_payload->'events'->'swap' IS NOT NULL
          ORDER BY t.id
        `);

        for (const row of heliusRows) {
          const tx = txById.get(row.id);
          if (!tx) continue;

          const solLamports = row.native_output_lamports || row.native_input_lamports;
          if (!solLamports) continue;

          const solAmount = Number(solLamports) / 1e9;
          const solPrice = lookupSolPrice(tx.tx_timestamp);
          if (solPrice === null) continue;

          const tradeValueUsd = solAmount * solPrice;
          const mainAmount = Math.abs(Number(tx.amount_value));
          const ppu = mainAmount > 0 ? tradeValueUsd / mainAmount : 0;

          phase1Rows.push({
            id: tx.id,
            price_per_unit: ppu,
            value_usd: tradeValueUsd,
            fee_usd: null,
            incoming_value_usd: tradeValueUsd,
          });
          pricedIds.add(tx.id);
          swapPriced++;
        }

        if (i + 1000 < swapTxIds.length) {
          log(`  Phase 1 progress: ${Math.min(i + 1000, swapTxIds.length)}/${swapTxIds.length} queried`);
        }
      }

      if (phase1Rows.length > 0) {
        await bulkUpdateTransactions(phase1Rows);
        updated += phase1Rows.length;
      }
      log(`  Phase 1 complete: ${swapPriced}/${swapTxIds.length} swaps priced from on-chain data`);
    }

    // ══════════════════════════════════════════════════════════════════
    // ── PHASE 2: Price NFT sales/purchases from Helius ───────────────
    // ══════════════════════════════════════════════════════════════════
    const nftTxIds = transactions
      .filter(tx => (tx.type === "NFT_SALE" || tx.type === "NFT_PURCHASE") && tx.tx_hash)
      .map(tx => tx.id);

    log(`── Phase 2: Pricing ${nftTxIds.length} NFT sales/purchases from Helius ──`);

    if (nftTxIds.length > 0 && solPriceMap.size > 0) {
      const phase2Rows: BulkRow[] = [];

      for (let i = 0; i < nftTxIds.length; i += 1000) {
        const batchIds = nftTxIds.slice(i, i + 1000);

        const heliusRows = await prisma.$queryRawUnsafe<Array<{
          id: number;
          nft_amount_lamports: string | null;
        }>>(`
          SELECT DISTINCT ON (t.id)
            t.id,
            (h.raw_payload->'events'->'nft'->>'amount')::text as nft_amount_lamports
          FROM transactions t
          JOIN helius_raw_transactions h ON SPLIT_PART(t.tx_hash, '-', 1) = h.signature
          WHERE t.id IN (${batchIds.join(",")})
          AND h.raw_payload->'events'->'nft' IS NOT NULL
          ORDER BY t.id
        `);

        for (const row of heliusRows) {
          const tx = txById.get(row.id);
          if (!tx || !row.nft_amount_lamports) continue;

          const solAmount = Number(row.nft_amount_lamports) / 1e9;
          if (solAmount <= 0) continue;

          const solPrice = lookupSolPrice(tx.tx_timestamp);
          if (solPrice === null) continue;

          const valueUsd = solAmount * solPrice;
          const mainAmount = Math.abs(Number(tx.amount_value));
          const ppu = mainAmount > 0 ? valueUsd / mainAmount : solPrice;

          phase2Rows.push({
            id: tx.id,
            price_per_unit: ppu,
            value_usd: valueUsd,
            fee_usd: null,
            incoming_value_usd: null,
          });
          pricedIds.add(tx.id);
          nftPriced++;
        }
      }

      if (phase2Rows.length > 0) {
        await bulkUpdateTransactions(phase2Rows);
        updated += phase2Rows.length;
      }
      log(`  Phase 2 complete: ${nftPriced}/${nftTxIds.length} NFT txns priced from on-chain data`);
    }

    // ══════════════════════════════════════════════════════════════════
    // ── PHASE 3: Price transfers via known CoinGecko symbols ─────────
    // ══════════════════════════════════════════════════════════════════
    log(`── Phase 3: Pricing transfers via known symbols ──`);

    // Collect known symbols needed for transfers
    const symbolsNeeded = new Set<string>();
    for (const tx of transactions) {
      if (pricedIds.has(tx.id)) continue;
      if (getCoinGeckoId(tx.asset_symbol)) symbolsNeeded.add(tx.asset_symbol.toUpperCase());
      if (tx.incoming_asset_symbol && getCoinGeckoId(tx.incoming_asset_symbol))
        symbolsNeeded.add(tx.incoming_asset_symbol.toUpperCase());
    }

    // Build price map: "SYMBOL:YYYY-MM-DD" → price
    const priceMap = new Map<string, number>();

    // Add SOL prices already fetched in Phase 0
    for (const [dateStr, price] of solPriceMap) {
      priceMap.set(`SOL:${dateStr}`, price);
    }

    // Fetch price ranges for non-SOL known symbols
    const otherSymbols = Array.from(symbolsNeeded).filter(s => s !== "SOL");
    for (let idx = 0; idx < otherSymbols.length; idx++) {
      const symbol = otherSymbols[idx];
      try {
        const prices = await getPriceRange(symbol, rangeStart, rangeEnd);
        if (prices && prices.length > 0) {
          for (const entry of prices) {
            priceMap.set(`${symbol}:${entry.date.split("T")[0]}`, entry.price);
          }
          log(`  [${idx + 1}/${otherSymbols.length}] ${symbol}: ${prices.length} daily prices`);
        } else {
          warn(`  [${idx + 1}/${otherSymbols.length}] ${symbol}: no price data`);
        }
      } catch (err) {
        warn(`  [${idx + 1}/${otherSymbols.length}] ${symbol}: error — ${err instanceof Error ? err.message : err}`);
      }
    }

    function lookupPrice(symbol: string, date: Date): number | null {
      const dateStr = date.toISOString().split("T")[0];
      const key = `${symbol.toUpperCase()}:${dateStr}`;
      const exact = priceMap.get(key);
      if (exact !== undefined) return exact;
      const prev = new Date(date.getTime() - 86400000).toISOString().split("T")[0];
      const next = new Date(date.getTime() + 86400000).toISOString().split("T")[0];
      return priceMap.get(`${symbol.toUpperCase()}:${prev}`) ??
             priceMap.get(`${symbol.toUpperCase()}:${next}`) ?? null;
    }

    // Current SOL price for fee correction
    const currentSolPrice = await getCurrentPrice("SOL");
    log(`Current SOL price for fee correction: $${currentSolPrice?.toFixed(2) || "N/A"}`);

    // Pump.fun impostor check: tokens with mint ending in "pump" shouldn't
    // be priced via known-symbol CoinGecko lookup
    const isPumpFun = (addr: string | null): boolean => addr ? addr.endsWith("pump") : false;

    const phase3Rows: BulkRow[] = [];
    const unknownMints = new Map<string, string>();
    const fallbackSymbols = new Set<string>();

    for (const tx of transactions) {
      // Fee correction for ALL transactions
      let fusd: number | null = null;
      if (tx.fee_usd && currentSolPrice && currentSolPrice > 0) {
        const historicalSolPrice = lookupSolPrice(tx.tx_timestamp);
        if (historicalSolPrice !== null) {
          fusd = (Number(tx.fee_usd) / currentSolPrice) * historicalSolPrice;
          feeCorrected++;
        }
      }

      // Skip if already priced in Phase 1/2 (only apply fee correction)
      if (pricedIds.has(tx.id)) {
        if (fusd !== null) {
          phase3Rows.push({ id: tx.id, price_per_unit: null, value_usd: null, fee_usd: fusd, incoming_value_usd: null });
        }
        continue;
      }

      let ppu: number | null = null;
      let vusd: number | null = null;
      let iusd: number | null = null;
      let didPrice = false;

      // Main asset price (skip pump.fun impostors)
      if (!isPumpFun(tx.asset_address) && getCoinGeckoId(tx.asset_symbol)) {
        const price = lookupPrice(tx.asset_symbol, tx.tx_timestamp);
        if (price !== null) {
          ppu = price;
          vusd = Math.abs(Number(tx.amount_value) * price);
          didPrice = true;
          transferPriced++;
        }
      }

      // Incoming asset price (skip pump.fun impostors)
      if (tx.incoming_asset_symbol && tx.incoming_amount_value) {
        if (!isPumpFun(tx.incoming_asset_address) && getCoinGeckoId(tx.incoming_asset_symbol)) {
          const price = lookupPrice(tx.incoming_asset_symbol, tx.tx_timestamp);
          if (price !== null) {
            iusd = Math.abs(Number(tx.incoming_amount_value) * price);
            didPrice = true;
          }
        }
      }

      // Track unknown mints for Phase 5
      if (ppu === null && tx.asset_address && !getCoinGeckoId(tx.asset_symbol)) {
        unknownMints.set(tx.asset_address, tx.asset_symbol);
      }
      if (tx.incoming_asset_symbol && tx.incoming_amount_value && iusd === null &&
          tx.incoming_asset_address && !getCoinGeckoId(tx.incoming_asset_symbol)) {
        unknownMints.set(tx.incoming_asset_address, tx.incoming_asset_symbol);
      }

      if (didPrice || fusd !== null) {
        phase3Rows.push({ id: tx.id, price_per_unit: ppu, value_usd: vusd, fee_usd: fusd, incoming_value_usd: iusd });
        if (didPrice) pricedIds.add(tx.id);
      }
    }

    if (phase3Rows.length > 0) {
      await bulkUpdateTransactions(phase3Rows);
      updated += phase3Rows.filter(r => r.price_per_unit !== null || r.value_usd !== null).length;
    }
    log(`  Phase 3 complete: ${transferPriced} transfers priced, ${feeCorrected} fees corrected`);

    // ══════════════════════════════════════════════════════════════════
    // ── PHASE 4: Mirror priced side to unpriced side (swaps) ─────────
    // ══════════════════════════════════════════════════════════════════
    log(`── Phase 4: Mirroring swap sides for remaining unpriced assets ──`);

    const mirrorRows: BulkRow[] = [];
    const mirroredMainIds = new Set<number>();
    const mirroredIncomingIds = new Set<number>();

    for (const tx of transactions) {
      if (!tx.incoming_asset_symbol || !tx.incoming_amount_value) continue;
      if (pricedIds.has(tx.id)) continue;

      const mainPrice = lookupPrice(tx.asset_symbol, tx.tx_timestamp);
      const incomingPrice = tx.incoming_asset_symbol
        ? lookupPrice(tx.incoming_asset_symbol, tx.tx_timestamp)
        : null;

      if ((mainPrice !== null) === (incomingPrice !== null)) continue;

      if (mainPrice !== null && incomingPrice === null) {
        const vusd = Math.abs(Number(tx.amount_value) * mainPrice);
        mirrorRows.push({ id: tx.id, price_per_unit: null, value_usd: null, fee_usd: null, incoming_value_usd: vusd });
        mirroredIncomingIds.add(tx.id);
        mirrorPriced++;
      } else if (incomingPrice !== null && mainPrice === null) {
        const iusd = Math.abs(Number(tx.incoming_amount_value) * incomingPrice);
        const amountAbs = Math.abs(Number(tx.amount_value));
        const derivedPpu = amountAbs > 0 ? iusd / amountAbs : 0;
        mirrorRows.push({ id: tx.id, price_per_unit: derivedPpu, value_usd: iusd, fee_usd: null, incoming_value_usd: null });
        mirroredMainIds.add(tx.id);
        mirrorPriced++;
      }
    }

    if (mirrorRows.length > 0) {
      await bulkUpdateTransactions(mirrorRows);
      updated += mirrorRows.length;
      log(`  Phase 4 complete: ${mirrorPriced} swap sides mirrored`);
    } else {
      log(`  Phase 4: No swap sides to mirror`);
    }

    // Recompute remaining unknown mints after mirroring
    const remainingMints = new Map<string, string>();
    for (const [mint, symbol] of unknownMints) {
      const stillNeeded = transactions.some(tx => {
        if (pricedIds.has(tx.id) || mirroredMainIds.has(tx.id) || mirroredIncomingIds.has(tx.id)) return false;
        return tx.asset_address === mint || tx.incoming_asset_address === mint;
      });
      if (stillNeeded) remainingMints.set(mint, symbol);
    }
    log(`After mirroring: ${remainingMints.size} unknown mints still need OHLCV (was ${unknownMints.size})`);

    // ══════════════════════════════════════════════════════════════════
    // ── PHASE 5: OHLCV fallback for remaining unknown tokens ─────────
    // ══════════════════════════════════════════════════════════════════
    let onchainResolved = 0;
    let onchainFailed = 0;

    if (remainingMints.size > 0) {
      log(`── Phase 5: Fetching OHLCV for ${remainingMints.size} unknown mints ──`);
      const mintAddresses = Array.from(remainingMints.keys());

      const ohlcvResults = await batchGetTokenOHLCV(
        mintAddresses, rangeStart, rangeEnd,
        (done, total, resolved) => {
          log(`  Phase 5 OHLCV: ${done}/${total} mints (${resolved} resolved)`);
        },
      );

      for (const [mint, entries] of ohlcvResults) {
        const symbol = remainingMints.get(mint);
        if (!symbol) continue;
        onchainResolved++;
        for (const entry of entries) {
          const dateStr = new Date(entry.timestamp * 1000).toISOString().split("T")[0];
          priceMap.set(`${symbol.toUpperCase()}:${dateStr}`, entry.close);
        }
      }
      onchainFailed = remainingMints.size - onchainResolved;
      log(`  Phase 5 OHLCV: ${onchainResolved} resolved, ${onchainFailed} not found`);

      // Apply OHLCV prices to still-unpriced transactions
      const stillUnpriced = transactions.filter(tx =>
        !pricedIds.has(tx.id) && !mirroredMainIds.has(tx.id) && !mirroredIncomingIds.has(tx.id)
      );

      if (stillUnpriced.length > 0 && onchainResolved > 0) {
        const phase5Rows: BulkRow[] = [];
        for (const tx of stillUnpriced) {
          let ppu: number | null = null;
          let vusd: number | null = null;
          let iusd: number | null = null;
          let didUpdate = false;

          const price = lookupPrice(tx.asset_symbol, tx.tx_timestamp);
          if (price !== null) {
            ppu = price;
            vusd = Math.abs(Number(tx.amount_value) * price);
            didUpdate = true;
          } else if (!getCoinGeckoId(tx.asset_symbol)) {
            fallbackSymbols.add(tx.asset_symbol);
          }

          if (tx.incoming_asset_symbol && tx.incoming_amount_value) {
            const ip = lookupPrice(tx.incoming_asset_symbol, tx.tx_timestamp);
            if (ip !== null) {
              iusd = Math.abs(Number(tx.incoming_amount_value) * ip);
              didUpdate = true;
            } else if (!getCoinGeckoId(tx.incoming_asset_symbol)) {
              fallbackSymbols.add(tx.incoming_asset_symbol);
            }
          }

          if (didUpdate) {
            phase5Rows.push({ id: tx.id, price_per_unit: ppu, value_usd: vusd, fee_usd: null, incoming_value_usd: iusd });
          }
        }

        if (phase5Rows.length > 0) {
          await bulkUpdateTransactions(phase5Rows);
          updated += phase5Rows.length;
        }
        log(`  Phase 5 applied: ${phase5Rows.length} transactions updated`);
      }
    } else {
      log(`── Phase 5: Skipped (no remaining unknown mints) ──`);
    }

    // ── Summary ──
    const durationMs = Date.now() - startTime;
    const fallbackList = Array.from(fallbackSymbols);

    log(`─── Enrichment complete ───`);
    log(`  Duration:         ${(durationMs / 1000).toFixed(1)}s`);
    log(`  Transactions:     ${transactions.length} total`);
    log(`  Phase 1 (swaps):  ${swapPriced} priced from on-chain data`);
    log(`  Phase 2 (NFTs):   ${nftPriced} priced from on-chain data`);
    log(`  Phase 3 (xfers):  ${transferPriced} priced via known symbols`);
    log(`  Phase 4 (mirror): ${mirrorPriced} swap sides mirrored`);
    log(`  Phase 5 (OHLCV):  ${onchainResolved} resolved, ${onchainFailed} not found`);
    log(`  Fee corrections:  ${feeCorrected}`);
    log(`  Total updated:    ${updated}`);
    if (fallbackList.length > 0) {
      log(`  Unpriceable:      ${fallbackList.join(", ")}`);
    }

    return {
      status: "success",
      updated,
      total: transactions.length,
      skipped: transactions.length - updated,
      swapPriced,
      nftPriced,
      transferPriced,
      feeCorrected,
      mirrorPriced,
      onchainResolved,
      onchainFailed,
      fallbackSymbols: fallbackList,
      durationMs,
    };
  } catch (error) {
    console.error("[Enrich] FATAL error:", error);
    return {
      status: "error",
      updated: 0, total: 0, skipped: 0,
      swapPriced: 0, nftPriced: 0, transferPriced: 0,
      feeCorrected: 0, mirrorPriced: 0,
      onchainResolved: 0, onchainFailed: 0,
      fallbackSymbols: [],
      durationMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
