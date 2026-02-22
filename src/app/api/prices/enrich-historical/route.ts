import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { getCoinGeckoId, getPriceRange, getCurrentPrice, resolveUnknownSymbols, resolveByContractAddress } from "@/lib/coingecko";
import { rateLimitAPI, createRateLimitResponse } from "@/lib/rate-limit";
import { Decimal } from "@prisma/client/runtime/library";

export const maxDuration = 800; // 13 min Vercel timeout

/**
 * POST /api/prices/enrich-historical
 * Enriches transactions with CoinGecko historical prices.
 * Called after wallet sync to replace DAS current prices with accurate
 * historical prices. Works for all chains, not just Solana.
 *
 * Body:
 *   walletId? — enrich transactions for a specific wallet.
 *              If omitted, enriches ALL transactions for the user
 *              (wallets + CSV imports + exchange API imports).
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const log = (msg: string) => console.log(`[Enrich] ${msg}`);
  const warn = (msg: string) => console.warn(`[Enrich] ${msg}`);

  try {
    // Rate limiting: 3 requests per minute
    const rateLimitResult = rateLimitAPI(request, 3);
    if (!rateLimitResult.success) {
      return createRateLimitResponse(rateLimitResult.remaining, rateLimitResult.reset);
    }

    // Auth
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { walletId } = body;

    // ── Step 1: Build transaction query ──────────────────────────────
    let where: Prisma.TransactionWhereInput;
    let label: string;

    if (walletId) {
      // Single wallet mode
      const wallet = await prisma.wallet.findFirst({
        where: { id: walletId, userId: user.id },
      });
      if (!wallet) {
        return NextResponse.json({ error: "Wallet not found" }, { status: 404 });
      }
      where = { wallet_address: wallet.address };
      label = wallet.name || wallet.address.slice(0, 8);
    } else {
      // All-transactions mode: wallets + CSV + exchange imports
      const userWithWallets = await prisma.user.findUnique({
        where: { id: user.id },
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
        where: { userId: user.id },
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
      label = `user ${user.id} (all transactions)`;
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
      return NextResponse.json({
        status: "success",
        updated: 0,
        total: 0,
        skipped: 0,
        fallbackSymbols: [],
        durationMs: Date.now() - startTime,
      });
    }

    // ── Step 3: Date range ───────────────────────────────────────────
    let minDate = transactions[0].tx_timestamp;
    let maxDate = transactions[0].tx_timestamp;
    for (const tx of transactions) {
      if (tx.tx_timestamp < minDate) minDate = tx.tx_timestamp;
      if (tx.tx_timestamp > maxDate) maxDate = tx.tx_timestamp;
    }
    const rangeStart = new Date(minDate.getTime() - 86400000); // -1 day buffer
    const rangeEnd = new Date(maxDate.getTime() + 86400000); // +1 day buffer

    log(`Date range: ${rangeStart.toISOString().split("T")[0]} → ${rangeEnd.toISOString().split("T")[0]}`);

    // ── Step 4: Collect unique symbols and contract addresses ─────────
    const allSymbols = new Set<string>();
    allSymbols.add("SOL"); // Always need SOL for fee correction
    // Map: contract address → current symbol (for tokens with on-chain addresses)
    const contractsToResolve = new Map<string, string>();

    for (const tx of transactions) {
      if (tx.asset_symbol) allSymbols.add(tx.asset_symbol.toUpperCase());
      if (tx.incoming_asset_symbol) allSymbols.add(tx.incoming_asset_symbol.toUpperCase());
      // Collect contract addresses for tokens we can't price by symbol
      if (tx.asset_address && !getCoinGeckoId(tx.asset_symbol)) {
        contractsToResolve.set(tx.asset_address, tx.asset_symbol);
      }
      // Also collect incoming asset contract addresses (for swap received tokens)
      if (tx.incoming_asset_address && tx.incoming_asset_symbol && !getCoinGeckoId(tx.incoming_asset_symbol)) {
        contractsToResolve.set(tx.incoming_asset_address, tx.incoming_asset_symbol);
      }
    }

    log(`${allSymbols.size} unique symbol(s), ${contractsToResolve.size} with contract addresses to resolve`);

    // ── Step 5a: Resolve tokens by contract address (most reliable) ──
    // symbolMap tracks old symbol → new resolved symbol for DB updates
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

      // Register resolved symbols so they can be priced
      for (const [, tokenInfo] of contractResults) {
        allSymbols.add(tokenInfo.symbol);
      }
      // Track symbol renames for DB update
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

    // Build final list of symbols we can actually price
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
            const dateKey = entry.date.split("T")[0]; // YYYY-MM-DD
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

    // Helper: find closest price for a symbol on a given date
    function lookupPrice(symbol: string, date: Date): number | null {
      const dateStr = date.toISOString().split("T")[0];
      const key = `${symbol.toUpperCase()}:${dateStr}`;
      const exact = priceMap.get(key);
      if (exact !== undefined) return exact;

      // Try +/- 1 day if exact date not found (CoinGecko sometimes has gaps)
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

        // Resolve symbol: if we found a better name via contract lookup, use it
        let effectiveSymbol = tx.asset_symbol;
        const betterSymbol = symbolMap.get(tx.asset_symbol);
        if (betterSymbol) {
          effectiveSymbol = betterSymbol;
          updateData.asset_symbol = betterSymbol;
          didUpdate = true;
          symbolsFixed++;
        }

        // Main asset price (use resolved symbol for lookup)
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

        // Fee correction: storedFeeUsd / currentSolPrice → SOL amount → * historicalSolPrice
        if (tx.fee_usd && currentSolPrice && currentSolPrice > 0) {
          const historicalSolPrice = lookupPrice("SOL", tx.tx_timestamp);
          if (historicalSolPrice !== null) {
            const feeSol = Number(tx.fee_usd) / currentSolPrice;
            updateData.fee_usd = new Decimal(feeSol * historicalSolPrice);
            didUpdate = true;
            feeCorrected++;
          }
        }

        // Incoming asset (for swaps / NFT sales)
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

      // Execute batch
      if (updates.length > 0) {
        await prisma.$transaction(updates);
      }

      // Progress log every 500 transactions
      if ((i + BATCH_SIZE) % 500 === 0 || i + BATCH_SIZE >= transactions.length) {
        log(`  Progress: ${Math.min(i + BATCH_SIZE, transactions.length)}/${transactions.length} processed`);
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

    return NextResponse.json({
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
    });
  } catch (error) {
    console.error("[Enrich Historical] Error:", error);
    return NextResponse.json(
      {
        status: "error",
        error: "Failed to enrich historical prices",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
