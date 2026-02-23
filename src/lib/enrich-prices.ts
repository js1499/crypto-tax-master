import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { getCoinGeckoId, getPriceRange, getCurrentPrice, resolveUnknownSymbols, resolveByContractAddress } from "@/lib/coingecko";
import { Decimal } from "@prisma/client/runtime/library";

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
  symbolsFixed: number;
  contractResolved: number;
  fallbackSymbols: string[];
  durationMs: number;
  error?: string;
}

/**
 * Enrich transactions with CoinGecko historical prices.
 * Can be called from the API route or directly from the sync route.
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
      return { status: "success", updated: 0, total: 0, skipped: 0, mainPriced: 0, feeCorrected: 0, incomingPriced: 0, symbolsFixed: 0, contractResolved: 0, fallbackSymbols: [], durationMs: 0 };
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
      return { status: "success", updated: 0, total: 0, skipped: 0, mainPriced: 0, feeCorrected: 0, incomingPriced: 0, symbolsFixed: 0, contractResolved: 0, fallbackSymbols: [], durationMs: Date.now() - startTime };
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

    // ── Step 4: Collect unique symbols and contract addresses ─────────
    const allSymbols = new Set<string>();
    allSymbols.add("SOL");
    const contractsToResolve = new Map<string, string>();

    for (const tx of transactions) {
      if (tx.asset_symbol) allSymbols.add(tx.asset_symbol.toUpperCase());
      if (tx.incoming_asset_symbol) allSymbols.add(tx.incoming_asset_symbol.toUpperCase());
      if (tx.asset_address && !getCoinGeckoId(tx.asset_symbol)) {
        contractsToResolve.set(tx.asset_address, tx.asset_symbol);
      }
      if (tx.incoming_asset_address && tx.incoming_asset_symbol && !getCoinGeckoId(tx.incoming_asset_symbol)) {
        contractsToResolve.set(tx.incoming_asset_address, tx.incoming_asset_symbol);
      }
    }

    log(`${allSymbols.size} unique symbol(s), ${contractsToResolve.size} with contract addresses to resolve`);

    // ── Step 5a: Resolve tokens by contract address ──────────────────
    const symbolMap = new Map<string, string>();
    let contractResolved = 0;

    if (contractsToResolve.size > 0) {
      log(`Resolving ${contractsToResolve.size} token(s) by contract address...`);
      const contractEntries = Array.from(contractsToResolve.entries()).map(
        ([addr, sym]) => ({ contractAddress: addr, currentSymbol: sym })
      );
      const { resolved: contractResults, failed: contractFailed, symbolUpdates } =
        await resolveByContractAddress(contractEntries);
      contractResolved = contractResults.size;

      for (const [, tokenInfo] of contractResults) {
        allSymbols.add(tokenInfo.symbol);
      }
      for (const [oldSym, newSym] of symbolUpdates) {
        symbolMap.set(oldSym, newSym);
      }

      log(`Contract resolution: ${contractResolved} found on CoinGecko, ${contractFailed.length} not found`);
    }

    // ── Step 5b: Resolve remaining unknown symbols via search ─────────
    const stillUnknown = Array.from(allSymbols).filter(
      (s) => !getCoinGeckoId(s) && !s.includes("...")
    );
    if (stillUnknown.length > 0) {
      log(`${stillUnknown.length} symbol(s) still unresolved, searching by name...`);
      const { resolved, failed } = await resolveUnknownSymbols(stillUnknown);
      if (resolved.length > 0) log(`Search resolved: ${resolved.join(", ")}`);
      if (failed.length > 0) warn(`Search failed: ${failed.join(", ")}`);
    }

    const priceableSymbols = Array.from(allSymbols).filter((s) => getCoinGeckoId(s));
    const unpriceableSymbols = Array.from(allSymbols).filter((s) => !getCoinGeckoId(s));

    log(`Priceable: ${priceableSymbols.length} symbols | Unpriceable: ${unpriceableSymbols.length} symbols`);

    // ── Step 6: Fetch historical price ranges ────────────────────────
    log(`Fetching price ranges for ${priceableSymbols.length} symbol(s)...`);

    const priceMap = new Map<string, number>();
    const priceFetchFailed: string[] = [];

    for (let idx = 0; idx < priceableSymbols.length; idx++) {
      const symbol = priceableSymbols[idx];
      try {
        const prices = await getPriceRange(symbol, rangeStart, rangeEnd);
        if (prices && prices.length > 0) {
          for (const entry of prices) {
            const dateKey = entry.date.split("T")[0];
            priceMap.set(`${symbol}:${dateKey}`, entry.price);
          }
          log(`  [${idx + 1}/${priceableSymbols.length}] ${symbol}: ${prices.length} daily prices fetched`);
        } else {
          priceFetchFailed.push(symbol);
          warn(`  [${idx + 1}/${priceableSymbols.length}] ${symbol}: no price data returned`);
        }
      } catch (err) {
        priceFetchFailed.push(symbol);
        warn(`  [${idx + 1}/${priceableSymbols.length}] ${symbol}: fetch error — ${err instanceof Error ? err.message : err}`);
      }
    }

    log(`Price map built: ${priceMap.size} date-price entries`);
    if (priceFetchFailed.length > 0) {
      warn(`Failed to fetch prices for: ${priceFetchFailed.join(", ")}`);
    }

    // ── Step 7: Current SOL price for fee correction ─────────────────
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

    // ── Step 8: Update transactions in batches ───────────────────────
    log(`Updating transactions in batches of 100...`);

    let updated = 0;
    let skipped = 0;
    let mainPriced = 0;
    let feeCorrected = 0;
    let incomingPriced = 0;
    let symbolsFixed = 0;
    const fallbackSymbols = new Set<string>();
    const BATCH_SIZE = 100;

    for (let i = 0; i < transactions.length; i += BATCH_SIZE) {
      const batch = transactions.slice(i, i + BATCH_SIZE);
      const updates: Array<ReturnType<typeof prisma.transaction.update>> = [];

      for (const tx of batch) {
        const updateData: Record<string, any> = {};
        let didUpdate = false;

        let effectiveSymbol = tx.asset_symbol;
        const betterSymbol = symbolMap.get(tx.asset_symbol);
        if (betterSymbol) {
          effectiveSymbol = betterSymbol;
          updateData.asset_symbol = betterSymbol;
          didUpdate = true;
          symbolsFixed++;
        }

        const historicalPrice = lookupPrice(effectiveSymbol, tx.tx_timestamp);
        if (historicalPrice !== null) {
          updateData.price_per_unit = new Decimal(historicalPrice);
          updateData.value_usd = new Decimal(
            Math.abs(Number(tx.amount_value) * historicalPrice)
          );
          didUpdate = true;
          mainPriced++;
        } else {
          if (!getCoinGeckoId(effectiveSymbol)) {
            fallbackSymbols.add(effectiveSymbol);
          }
        }

        if (tx.fee_usd && currentSolPrice && currentSolPrice > 0) {
          const historicalSolPrice = lookupPrice("SOL", tx.tx_timestamp);
          if (historicalSolPrice !== null) {
            const feeSol = Number(tx.fee_usd) / currentSolPrice;
            updateData.fee_usd = new Decimal(feeSol * historicalSolPrice);
            didUpdate = true;
            feeCorrected++;
          }
        }

        if (tx.incoming_asset_symbol && tx.incoming_amount_value) {
          const effectiveIncoming = symbolMap.get(tx.incoming_asset_symbol) || tx.incoming_asset_symbol;
          if (effectiveIncoming !== tx.incoming_asset_symbol) {
            updateData.incoming_asset_symbol = effectiveIncoming;
          }
          const incomingPrice = lookupPrice(effectiveIncoming, tx.tx_timestamp);
          if (incomingPrice !== null) {
            updateData.incoming_value_usd = new Decimal(
              Math.abs(Number(tx.incoming_amount_value) * incomingPrice)
            );
            didUpdate = true;
            incomingPriced++;
          } else if (!getCoinGeckoId(effectiveIncoming)) {
            fallbackSymbols.add(effectiveIncoming);
          }
        }

        if (didUpdate) {
          updates.push(
            prisma.transaction.update({
              where: { id: tx.id },
              data: updateData,
            })
          );
          updated++;
        } else {
          skipped++;
        }
      }

      if (updates.length > 0) {
        await prisma.$transaction(updates);
      }

      if ((i + BATCH_SIZE) % 200 === 0 || i + BATCH_SIZE >= transactions.length) {
        log(`  Progress: ${Math.min(i + BATCH_SIZE, transactions.length)}/${transactions.length} processed (${updated} updated, ${skipped} skipped)`);
      }
    }

    // ── Step 9: Summary ──────────────────────────────────────────────
    const fallbackList = Array.from(fallbackSymbols);
    const durationMs = Date.now() - startTime;

    log(`─── Enrichment complete ───`);
    log(`  Duration:        ${(durationMs / 1000).toFixed(1)}s`);
    log(`  Transactions:    ${transactions.length} total`);
    log(`  Updated:         ${updated} (${mainPriced} main prices, ${feeCorrected} fees, ${incomingPriced} incoming prices)`);
    log(`  Symbols fixed:   ${symbolsFixed} (truncated mints → real names)`);
    log(`  Contracts resolved: ${contractResolved} via on-chain address`);
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
      symbolsFixed,
      contractResolved,
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
      symbolsFixed: 0,
      contractResolved: 0,
      fallbackSymbols: [],
      durationMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
