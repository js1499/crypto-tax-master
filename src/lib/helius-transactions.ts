import axios from "axios";
import { Decimal } from "@prisma/client/runtime/library";
import type { WalletTransaction } from "./moralis-transactions";

// Helius API key from environment
const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
const HELIUS_BASE_URL = "https://api.helius.xyz";

// Jupiter Price API
const JUPITER_PRICE_URL = "https://api.jup.ag/price/v2";

// Native SOL mint address (used for Jupiter price lookups)
const SOL_MINT = "So11111111111111111111111111111111111111112";

// ============================================================
// Helius API response interfaces
// ============================================================

interface HeliusNativeTransfer {
  fromUserAccount: string;
  toUserAccount: string;
  amount: number; // in lamports
}

interface HeliusTokenTransfer {
  fromUserAccount: string;
  toUserAccount: string;
  fromTokenAccount: string;
  toTokenAccount: string;
  tokenAmount: number;
  mint: string;
  tokenStandard: string;
}

interface HeliusSwapEvent {
  nativeInput?: { account: string; amount: string };
  nativeOutput?: { account: string; amount: string };
  tokenInputs?: { userAccount: string; tokenAccount: string; mint: string; rawTokenAmount: { tokenAmount: string; decimals: number } }[];
  tokenOutputs?: { userAccount: string; tokenAccount: string; mint: string; rawTokenAmount: { tokenAmount: string; decimals: number } }[];
}

interface HeliusEnhancedTransaction {
  signature: string;
  slot: number;
  timestamp: number;
  type: string;
  source: string;
  fee: number; // in lamports
  feePayer: string;
  description?: string;
  nativeTransfers?: HeliusNativeTransfer[];
  tokenTransfers?: HeliusTokenTransfer[];
  events?: {
    swap?: HeliusSwapEvent;
    nft?: {
      seller?: string;
      buyer?: string;
      amount?: number;
      nfts?: { mint: string; tokenStandard: string }[];
    };
  };
  accountData?: { account: string; nativeBalanceChange: number; tokenBalanceChanges: any[] }[];
}

// ============================================================
// Solana address validation
// ============================================================

/**
 * Validate a Solana address (base58 format, 32-44 chars)
 */
export function isValidSolanaAddress(address: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
}

// ============================================================
// Price cache and lookup via Jupiter
// ============================================================

// Cache prices: "mint:YYYY-MM-DD" -> price in USD
const priceCache = new Map<string, number>();

/**
 * Get token prices from Jupiter Price API.
 * Supports batch lookups for multiple mints.
 * Returns a map of mint -> USD price.
 */
async function getJupiterPrices(mints: string[]): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (mints.length === 0) return result;

  // Deduplicate
  const uniqueMints = [...new Set(mints)];

  // Jupiter supports batch lookups with comma-separated IDs
  // Process in chunks of 100 to avoid URL length limits
  const chunkSize = 100;

  for (let i = 0; i < uniqueMints.length; i += chunkSize) {
    const chunk = uniqueMints.slice(i, i + chunkSize);
    try {
      const response = await axios.get(JUPITER_PRICE_URL, {
        params: { ids: chunk.join(",") },
        timeout: 15000,
      });

      const data = response.data?.data;
      if (data) {
        for (const mint of chunk) {
          const priceInfo = data[mint];
          if (priceInfo?.price) {
            const price = parseFloat(priceInfo.price);
            if (!isNaN(price) && price > 0) {
              result.set(mint, price);
            }
          }
        }
      }

      console.log(
        `[Helius Price] Jupiter batch: ${chunk.length} mints queried, ${result.size} prices found`
      );
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.warn(
          `[Helius Price] Jupiter API error: ${error.response?.status} - ${error.message}`
        );
      } else {
        console.warn(
          `[Helius Price] Jupiter error:`,
          error instanceof Error ? error.message : error
        );
      }
    }
  }

  return result;
}

/**
 * Get a single token's USD price, with day-granularity caching.
 * Note: Jupiter only returns current spot prices, not historical.
 * For accurate tax reporting, historical prices would need a different data source.
 */
async function getTokenPriceUSD(
  mint: string,
  txDate: Date
): Promise<number | null> {
  const dateKey = txDate.toISOString().split("T")[0];
  const cacheKey = `${mint}:${dateKey}`;

  if (priceCache.has(cacheKey)) {
    const cached = priceCache.get(cacheKey)!;
    return cached > 0 ? cached : null;
  }

  const prices = await getJupiterPrices([mint]);
  const price = prices.get(mint);

  if (price && price > 0) {
    priceCache.set(cacheKey, price);
    return price;
  }

  priceCache.set(cacheKey, 0);
  return null;
}

/**
 * Clear the price cache
 */
export function clearHeliusPriceCache(): void {
  const size = priceCache.size;
  priceCache.clear();
  console.log(`[Helius Price] Cache cleared (had ${size} entries)`);
}

// ============================================================
// Helper functions
// ============================================================

/**
 * Get Solscan explorer URL for a transaction
 */
function getExplorerUrl(signature: string): string {
  return `https://solscan.io/tx/${signature}`;
}

/**
 * Convert lamports to SOL
 */
function lamportsToSol(lamports: number): number {
  return lamports / 1e9;
}

/**
 * Map Helius transaction type to our type
 */
function mapTransactionType(
  heliusType: string,
  walletAddress: string,
  tx: HeliusEnhancedTransaction
): string {
  const typeUpper = heliusType?.toUpperCase() || "";

  if (typeUpper === "SWAP") return "Swap";
  if (typeUpper === "TRANSFER") {
    // Determine direction from native/token transfers
    return determineTransferDirection(walletAddress, tx);
  }
  if (typeUpper === "NFT_SALE" || typeUpper === "NFT_LISTING") {
    return determineTransferDirection(walletAddress, tx);
  }
  if (typeUpper === "NFT_MINT" || typeUpper === "COMPRESSED_NFT_MINT") return "Receive";
  if (typeUpper === "COMPRESSED_NFT_TRANSFER" || typeUpper === "NFT_TRANSFER") {
    return determineTransferDirection(walletAddress, tx);
  }
  if (typeUpper === "STAKE" || typeUpper === "STAKE_SOL") return "Stake";
  if (typeUpper === "UNSTAKE" || typeUpper === "UNSTAKE_SOL") return "Unstake";
  if (typeUpper === "BURN" || typeUpper === "BURN_NFT") return "Burn";
  if (typeUpper === "TOKEN_MINT") return "Receive";
  if (typeUpper === "UNKNOWN") {
    return determineTransferDirection(walletAddress, tx);
  }

  return determineTransferDirection(walletAddress, tx);
}

/**
 * Determine if this is a Send or Receive based on transfer directions
 */
function determineTransferDirection(
  walletAddress: string,
  tx: HeliusEnhancedTransaction
): string {
  const wallet = walletAddress;

  // Check native transfers
  if (tx.nativeTransfers && tx.nativeTransfers.length > 0) {
    const sent = tx.nativeTransfers.some(
      (t) => t.fromUserAccount === wallet && t.toUserAccount !== wallet && t.amount > 0
    );
    const received = tx.nativeTransfers.some(
      (t) => t.toUserAccount === wallet && t.fromUserAccount !== wallet && t.amount > 0
    );
    if (sent && !received) return "Send";
    if (received && !sent) return "Receive";
  }

  // Check token transfers
  if (tx.tokenTransfers && tx.tokenTransfers.length > 0) {
    const sent = tx.tokenTransfers.some(
      (t) => t.fromUserAccount === wallet && t.toUserAccount !== wallet
    );
    const received = tx.tokenTransfers.some(
      (t) => t.toUserAccount === wallet && t.fromUserAccount !== wallet
    );
    if (sent && !received) return "Send";
    if (received && !sent) return "Receive";
  }

  // If fee payer is our wallet, likely a Send
  if (tx.feePayer === wallet) return "Send";

  return "Transfer";
}

// ============================================================
// Main transaction fetching
// ============================================================

/**
 * Fetch Solana wallet transaction history from Helius Enhanced Transactions API.
 * Returns fully populated WalletTransaction objects with USD values.
 */
export async function getSolanaWalletTransactions(
  walletAddress: string,
  startTime?: number,
  endTime?: number
): Promise<WalletTransaction[]> {
  if (!HELIUS_API_KEY) {
    throw new Error("HELIUS_API_KEY environment variable is not set");
  }

  if (!isValidSolanaAddress(walletAddress)) {
    throw new Error(`Invalid Solana address: ${walletAddress}`);
  }

  console.log(`[Helius] ====== Starting fetch for ${walletAddress} on Solana ======`);
  if (startTime) console.log(`[Helius] Start time: ${new Date(startTime).toISOString()}`);
  if (endTime) console.log(`[Helius] End time: ${new Date(endTime).toISOString()}`);

  const transactions: WalletTransaction[] = [];
  let beforeSignature: string | undefined;
  let pageCount = 0;
  const maxPages = 50;
  let totalRawTx = 0;

  try {
    // Step 1: Fetch all raw transactions from Helius
    console.log(`[Helius] Step 1: Fetching transaction history from API...`);

    do {
      pageCount++;
      const params: Record<string, any> = {
        "api-key": HELIUS_API_KEY,
        limit: 100,
      };

      if (beforeSignature) params.before = beforeSignature;

      console.log(
        `[Helius] Fetching page ${pageCount}${beforeSignature ? " (before: " + beforeSignature.slice(0, 20) + "...)" : ""}...`
      );

      const response = await axios.get(
        `${HELIUS_BASE_URL}/v0/addresses/${walletAddress}/transactions`,
        {
          params,
          timeout: 30000,
        }
      );

      const results: HeliusEnhancedTransaction[] = response.data || [];
      totalRawTx += results.length;

      console.log(`[Helius] Page ${pageCount}: ${results.length} transactions received`);

      if (results.length === 0) break;

      for (const tx of results) {
        const txTimestamp = tx.timestamp * 1000; // Convert to milliseconds

        // Time-based filtering
        if (startTime && txTimestamp < startTime) {
          // Transactions are in reverse chronological order;
          // once we pass startTime, we can stop
          console.log(`[Helius] Reached startTime cutoff, stopping pagination`);
          beforeSignature = undefined; // Signal to stop
          break;
        }
        if (endTime && txTimestamp > endTime) {
          continue; // Skip transactions after endTime
        }

        const timestamp = new Date(txTimestamp);
        const txType = mapTransactionType(tx.type, walletAddress, tx);
        const isSwap = txType === "Swap" || tx.events?.swap;

        // Calculate fee in SOL
        const feeInSol = lamportsToSol(tx.fee || 0);

        // Process swap events
        if (isSwap && tx.events?.swap) {
          const swap = tx.events.swap;
          processSwapTransaction(transactions, tx, swap, walletAddress, timestamp, feeInSol);
          continue;
        }

        // Process native SOL transfers
        let hasTransfers = false;
        if (tx.nativeTransfers && tx.nativeTransfers.length > 0) {
          for (const transfer of tx.nativeTransfers) {
            // Only process transfers involving our wallet
            if (transfer.fromUserAccount !== walletAddress && transfer.toUserAccount !== walletAddress) {
              continue;
            }
            // Skip zero-amount transfers (e.g., rent)
            if (transfer.amount <= 0) continue;
            // Skip self-transfers
            if (transfer.fromUserAccount === walletAddress && transfer.toUserAccount === walletAddress) {
              continue;
            }

            const isIncoming = transfer.toUserAccount === walletAddress;
            const solAmount = lamportsToSol(transfer.amount);

            transactions.push({
              id: `${tx.signature}-native-${transfer.fromUserAccount}-${transfer.toUserAccount}`,
              type: isIncoming ? "Receive" : "Send",
              asset_symbol: "SOL",
              asset_chain: "solana",
              amount_value: new Decimal(solAmount),
              price_per_unit: null,
              value_usd: new Decimal(0),
              fee_usd: !isIncoming && feeInSol > 0 ? new Decimal(feeInSol) : null,
              tx_timestamp: timestamp,
              source: "Solana Wallet",
              source_type: "wallet",
              tx_hash: tx.signature,
              wallet_address: walletAddress,
              counterparty_address: isIncoming ? transfer.fromUserAccount : transfer.toUserAccount,
              chain: "solana",
              block_number: tx.slot,
              explorer_url: getExplorerUrl(tx.signature),
              notes: tx.source !== "SYSTEM_PROGRAM" ? `Source: ${tx.source}` : undefined,
            });
            hasTransfers = true;
          }
        }

        // Process SPL token transfers
        if (tx.tokenTransfers && tx.tokenTransfers.length > 0) {
          for (const transfer of tx.tokenTransfers) {
            // Only process transfers involving our wallet
            if (transfer.fromUserAccount !== walletAddress && transfer.toUserAccount !== walletAddress) {
              continue;
            }
            if (transfer.tokenAmount <= 0) continue;
            // Skip self-transfers
            if (transfer.fromUserAccount === walletAddress && transfer.toUserAccount === walletAddress) {
              continue;
            }

            const isIncoming = transfer.toUserAccount === walletAddress;

            transactions.push({
              id: `${tx.signature}-token-${transfer.mint}-${transfer.fromUserAccount}`,
              type: isIncoming ? "Receive" : "Send",
              asset_symbol: transfer.mint.slice(0, 6) + "...",
              asset_address: transfer.mint,
              asset_chain: "solana",
              amount_value: new Decimal(transfer.tokenAmount),
              price_per_unit: null,
              value_usd: new Decimal(0),
              fee_usd: null,
              tx_timestamp: timestamp,
              source: "Solana Wallet",
              source_type: "wallet",
              tx_hash: tx.signature,
              wallet_address: walletAddress,
              counterparty_address: isIncoming ? transfer.fromUserAccount : transfer.toUserAccount,
              chain: "solana",
              block_number: tx.slot,
              explorer_url: getExplorerUrl(tx.signature),
              notes: tx.source !== "SYSTEM_PROGRAM" ? `Source: ${tx.source}` : undefined,
            });
            hasTransfers = true;
          }
        }

        // If no transfers were processed but the tx has a known type, add a record
        if (!hasTransfers && txType !== "Transfer") {
          transactions.push({
            id: `${tx.signature}-main`,
            type: txType,
            asset_symbol: "SOL",
            asset_chain: "solana",
            amount_value: new Decimal(0),
            price_per_unit: null,
            value_usd: new Decimal(0),
            fee_usd: feeInSol > 0 ? new Decimal(feeInSol) : null,
            tx_timestamp: timestamp,
            source: "Solana Wallet",
            source_type: "wallet",
            tx_hash: tx.signature,
            wallet_address: walletAddress,
            chain: "solana",
            block_number: tx.slot,
            explorer_url: getExplorerUrl(tx.signature),
            notes: tx.description || (tx.source !== "SYSTEM_PROGRAM" ? `Source: ${tx.source}` : undefined),
          });
        }
      }

      // Update cursor for next page
      if (results.length > 0) {
        beforeSignature = results[results.length - 1].signature;
      } else {
        break;
      }
    } while (beforeSignature && pageCount < maxPages);

    console.log(
      `[Helius] Step 1 complete: ${totalRawTx} raw tx fetched, ${transactions.length} valid transactions parsed across ${pageCount} pages`
    );

    // Step 2: Enrich with USD prices
    console.log(`[Helius] Step 2: Looking up USD prices for ${transactions.length} transactions...`);
    await enrichSolanaTransactionsWithPrices(transactions);

    // Sort by timestamp
    transactions.sort((a, b) => a.tx_timestamp.getTime() - b.tx_timestamp.getTime());

    console.log(`[Helius] ====== Fetch complete: ${transactions.length} transactions for Solana ======`);
    return transactions;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const message = error.response?.data?.message || error.response?.data?.error || error.message;

      console.error(`[Helius] API error: status=${status}, message=${message}`);

      if (status === 401 || status === 403) {
        throw new Error("Invalid Helius API key. Check HELIUS_API_KEY environment variable.");
      } else if (status === 429) {
        throw new Error("Helius API rate limit exceeded. Please try again later.");
      } else {
        throw new Error(`Helius API error (${status}): ${message}`);
      }
    }
    console.error(`[Helius] Unexpected error:`, error);
    throw error;
  }
}

/**
 * Process a swap transaction from Helius swap events
 */
function processSwapTransaction(
  transactions: WalletTransaction[],
  tx: HeliusEnhancedTransaction,
  swap: HeliusSwapEvent,
  walletAddress: string,
  timestamp: Date,
  feeInSol: number
): void {
  // Determine what was sent (input) and received (output)
  let outSymbol = "SOL";
  let outAmount = 0;
  let outMint: string | undefined;
  let inSymbol = "SOL";
  let inAmount = 0;
  let inMint: string | undefined;

  // Process native input
  if (swap.nativeInput && parseInt(swap.nativeInput.amount) > 0) {
    outSymbol = "SOL";
    outAmount = lamportsToSol(parseInt(swap.nativeInput.amount));
    outMint = SOL_MINT;
  }

  // Process token inputs
  if (swap.tokenInputs && swap.tokenInputs.length > 0) {
    const input = swap.tokenInputs[0];
    outMint = input.mint;
    outSymbol = input.mint.slice(0, 6) + "...";
    const rawAmount = parseInt(input.rawTokenAmount.tokenAmount);
    outAmount = rawAmount / Math.pow(10, input.rawTokenAmount.decimals);
  }

  // Process native output
  if (swap.nativeOutput && parseInt(swap.nativeOutput.amount) > 0) {
    inSymbol = "SOL";
    inAmount = lamportsToSol(parseInt(swap.nativeOutput.amount));
    inMint = SOL_MINT;
  }

  // Process token outputs
  if (swap.tokenOutputs && swap.tokenOutputs.length > 0) {
    const output = swap.tokenOutputs[0];
    inMint = output.mint;
    inSymbol = output.mint.slice(0, 6) + "...";
    const rawAmount = parseInt(output.rawTokenAmount.tokenAmount);
    inAmount = rawAmount / Math.pow(10, output.rawTokenAmount.decimals);
  }

  transactions.push({
    id: `${tx.signature}-swap`,
    type: "Swap",
    asset_symbol: outSymbol,
    asset_address: outMint !== SOL_MINT ? outMint : undefined,
    asset_chain: "solana",
    amount_value: new Decimal(outAmount),
    price_per_unit: null,
    value_usd: new Decimal(0),
    fee_usd: feeInSol > 0 ? new Decimal(feeInSol) : null,
    tx_timestamp: timestamp,
    source: "Solana Wallet",
    source_type: "wallet",
    tx_hash: tx.signature,
    wallet_address: walletAddress,
    chain: "solana",
    block_number: tx.slot,
    explorer_url: getExplorerUrl(tx.signature),
    notes: `Swap via ${tx.source}`,
    incoming_asset_symbol: inSymbol,
    incoming_amount_value: new Decimal(inAmount),
    incoming_value_usd: new Decimal(0),
  });
}

/**
 * Enrich Solana transactions with USD prices from Jupiter
 */
async function enrichSolanaTransactionsWithPrices(
  transactions: WalletTransaction[]
): Promise<void> {
  if (transactions.length === 0) return;

  // Collect unique mints that need pricing
  const mintsToPrice = new Set<string>();
  mintsToPrice.add(SOL_MINT); // Always need SOL price

  for (const tx of transactions) {
    if (tx.asset_address) {
      mintsToPrice.add(tx.asset_address);
    }
    if (tx.incoming_asset_symbol && tx.incoming_asset_symbol !== "SOL") {
      // Find mint from other transactions with same symbol
      const mintTx = transactions.find(
        (t) => t.asset_address && t.asset_symbol === tx.incoming_asset_symbol
      );
      if (mintTx?.asset_address) {
        mintsToPrice.add(mintTx.asset_address);
      }
    }
  }

  console.log(
    `[Helius Price] Fetching prices for ${mintsToPrice.size} unique mints from Jupiter...`
  );

  // Fetch all prices in one batch
  const prices = await getJupiterPrices([...mintsToPrice]);
  const solPrice = prices.get(SOL_MINT) || 0;

  console.log(
    `[Helius Price] Got ${prices.size}/${mintsToPrice.size} prices (SOL: $${solPrice.toFixed(2)})`
  );

  // Cache all fetched prices
  const today = new Date().toISOString().split("T")[0];
  for (const [mint, price] of prices) {
    priceCache.set(`${mint}:${today}`, price);
  }

  // Apply prices to transactions
  let priced = 0;
  let unpriced = 0;
  let feesConverted = 0;

  for (const tx of transactions) {
    // Determine the mint for this transaction
    const mint = tx.asset_address || (tx.asset_symbol === "SOL" ? SOL_MINT : null);
    const price = mint ? prices.get(mint) : null;

    if (price && price > 0) {
      const amountNum = parseFloat(tx.amount_value.toString());
      tx.price_per_unit = new Decimal(price);
      tx.value_usd = new Decimal(amountNum * price);
      priced++;
    } else {
      unpriced++;
    }

    // Convert fee from SOL to USD
    if (tx.fee_usd !== null && solPrice > 0) {
      const feeInSol = parseFloat(tx.fee_usd.toString());
      tx.fee_usd = new Decimal(feeInSol * solPrice);
      feesConverted++;
    }

    // Price incoming swap assets
    if (tx.incoming_amount_value) {
      // Find mint for incoming asset
      let incomingMint: string | null = null;
      if (tx.incoming_asset_symbol === "SOL") {
        incomingMint = SOL_MINT;
      } else {
        // Look for mint in other transactions
        const mintTx = transactions.find(
          (t) => t.asset_address && t.asset_symbol === tx.incoming_asset_symbol
        );
        incomingMint = mintTx?.asset_address || null;
      }

      if (incomingMint) {
        const inPrice = prices.get(incomingMint);
        if (inPrice && inPrice > 0) {
          const inAmount = parseFloat(tx.incoming_amount_value.toString());
          tx.incoming_value_usd = new Decimal(inAmount * inPrice);
        }
      }
    }
  }

  console.log(
    `[Helius Price] Enrichment complete: ${priced} priced, ${unpriced} unpriced, ${feesConverted} fees converted to USD`
  );
}
