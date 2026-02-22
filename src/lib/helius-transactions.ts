import axios from "axios";
import { Decimal } from "@prisma/client/runtime/library";
import type { WalletTransaction } from "./moralis-transactions";
import fs from "fs";
import path from "path";

// Helius API key from environment
const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
const HELIUS_BASE_URL = "https://api.helius.xyz";
// Native SOL mint address
const SOL_MINT = "So11111111111111111111111111111111111111112";

// Track incoming mints for swaps/NFT sales (tx_hash → mint address)
// Populated during processing, consumed during enrichment
const incomingMintMap = new Map<string, string>();

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
// Price cache and lookup via Helius DAS API
// ============================================================

// Cache prices: "mint:YYYY-MM-DD" -> price in USD
const priceCache = new Map<string, number>();

// Token metadata cache: mint -> { symbol, name }
const tokenMetadataCache = new Map<string, { symbol: string; name: string }>();

interface HeliusDASResult {
  prices: Map<string, number>;
  metadata: Map<string, { symbol: string; name: string }>;
}

/**
 * Get token prices AND metadata from Helius DAS API (getAssetBatch).
 * Returns price_per_token and symbol/name for each mint.
 * Uses the existing HELIUS_API_KEY — no extra API key needed.
 */
export async function getHeliusTokenData(mints: string[]): Promise<HeliusDASResult> {
  const prices = new Map<string, number>();
  const metadata = new Map<string, { symbol: string; name: string }>();
  if (mints.length === 0 || !HELIUS_API_KEY) return { prices, metadata };

  const uniqueMints = [...new Set(mints)];

  // Helius getAssetBatch supports up to 1000 IDs per call
  const chunkSize = 1000;

  for (let i = 0; i < uniqueMints.length; i += chunkSize) {
    const chunk = uniqueMints.slice(i, i + chunkSize);
    try {
      const response = await axios.post(
        `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`,
        {
          jsonrpc: "2.0",
          id: "price-lookup",
          method: "getAssetBatch",
          params: {
            ids: chunk,
          },
        },
        { timeout: 30000 }
      );

      const assets = response.data?.result;
      if (Array.isArray(assets)) {
        for (const asset of assets) {
          if (!asset) continue;
          const mint = asset?.id;
          if (!mint) continue;

          // Extract price
          const price = asset?.token_info?.price_info?.price_per_token;
          if (price && typeof price === "number" && price > 0) {
            prices.set(mint, price);
          }

          // Extract symbol and name from metadata
          const symbol =
            asset?.token_info?.symbol ||
            asset?.content?.metadata?.symbol ||
            null;
          const name =
            asset?.content?.metadata?.name ||
            asset?.token_info?.name ||
            null;

          if (symbol) {
            metadata.set(mint, { symbol, name: name || symbol });
            // Also cache for later lookups
            tokenMetadataCache.set(mint, { symbol, name: name || symbol });
          }
        }
      }

    } catch (error) {
      const msg = axios.isAxiosError(error) ? `${error.response?.status} - ${error.message}` : (error instanceof Error ? error.message : String(error));
      console.warn(`[Helius DAS] Batch error: ${msg}`);
    }
  }

  return { prices, metadata };
}

// Cache the full Jupiter token list (refreshed per sync)
let jupiterTokenMap: Map<string, string> | null = null;

export async function getJupiterTokenMap(): Promise<Map<string, string>> {
  if (jupiterTokenMap) return jupiterTokenMap;
  try {
    const response = await axios.get(
      "https://tokens.jup.ag/tokens?tags=verified,community",
      { timeout: 15000 }
    );
    const map = new Map<string, string>();
    for (const token of response.data) {
      if (token.address && token.symbol) {
        map.set(token.address, token.symbol);
      }
    }
    jupiterTokenMap = map;
    return map;
  } catch (error) {
    console.warn("[Jupiter] Failed to fetch token list:", error instanceof Error ? error.message : error);
    return new Map();
  }
}

/**
 * Resolve a mint address to a human-readable symbol.
 * Returns cached symbol or truncated mint as fallback.
 */
function resolveTokenSymbol(mint: string): string {
  if (mint === SOL_MINT) return "SOL";
  const cached = tokenMetadataCache.get(mint);
  if (cached) return cached.symbol;
  return mint.slice(0, 6) + "...";
}

/**
 * Clear the price cache
 */
export function clearHeliusPriceCache(): void {
  const size = priceCache.size;
  priceCache.clear();
  tokenMetadataCache.clear();
  incomingMintMap.clear();
  jupiterTokenMap = null;
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
    return determineTransferDirection(walletAddress, tx);
  }
  if (typeUpper === "NFT_SALE" || typeUpper === "NFT_LISTING") {
    return "NFT Sale";
  }
  if (typeUpper === "NFT_MINT" || typeUpper === "COMPRESSED_NFT_MINT") return "Receive";
  if (typeUpper === "COMPRESSED_NFT_TRANSFER" || typeUpper === "NFT_TRANSFER") {
    return determineTransferDirection(walletAddress, tx);
  }
  if (typeUpper === "NFT_BID" || typeUpper === "NFT_CANCEL_LISTING" || typeUpper === "NFT_BID_CANCELLED") {
    return "NFT Activity";
  }
  if (typeUpper === "STAKE" || typeUpper === "STAKE_SOL") return "Stake";
  if (typeUpper === "UNSTAKE" || typeUpper === "UNSTAKE_SOL") return "Unstake";
  if (typeUpper === "BURN" || typeUpper === "BURN_NFT") return "Burn";
  if (typeUpper === "TOKEN_MINT") return "Receive";

  // DeFi types
  if (typeUpper === "ADD_LIQUIDITY" || typeUpper === "DEPOSIT") return "Deposit";
  if (typeUpper === "REMOVE_LIQUIDITY" || typeUpper === "WITHDRAW") return "Withdraw";
  if (typeUpper === "BORROW" || typeUpper === "BORROW_FOX" || typeUpper === "LOAN") return "Borrow";
  if (typeUpper === "REPAY_LOAN") return "Repay";
  if (typeUpper === "INIT_BANK" || typeUpper === "CREATE_POOL") return "DeFi Setup";
  if (typeUpper === "CLAIM_REWARDS" || typeUpper === "HARVEST") return "Reward";
  if (typeUpper === "CLOSE_POSITION") return "Withdraw";

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
// Raw Helius dump to CSV (for debugging / comparison)
// ============================================================

/**
 * Dump raw Helius enhanced transactions to a CSV file in public/dumps/.
 * Columns mirror the DB Transaction schema so the two can be compared
 * side-by-side. Values come straight from the Helius payload — no
 * type-mapping, price enrichment, or symbol resolution is applied.
 */
function dumpRawHeliusToCsv(
  walletAddress: string,
  rawTransactions: HeliusEnhancedTransaction[]
): void {
  try {
    const dumpsDir = path.join(process.cwd(), "public", "dumps");
    fs.mkdirSync(dumpsDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const shortAddr = walletAddress.slice(0, 8);
    const filePath = path.join(dumpsDir, `helius-raw-${shortAddr}-${timestamp}.csv`);

    const csvHeader = [
      "type",
      "source",
      "asset_symbol",
      "amount_value",
      "price_per_unit",
      "value_usd",
      "fee_usd",
      "tx_timestamp",
      "tx_hash",
      "wallet_address",
      "counterparty_address",
      "chain",
      "block_number",
      "description",
      "native_transfers_count",
      "token_transfers_count",
      "has_swap_event",
      "has_nft_event",
    ].join(",");

    const csvRows: string[] = [];

    for (const tx of rawTransactions) {
      const esc = (val: string) => {
        if (val.includes(",") || val.includes('"') || val.includes("\n")) {
          return `"${val.replace(/"/g, '""')}"`;
        }
        return val;
      };

      const feeInSol = lamportsToSol(tx.fee || 0);
      const txDate = new Date(tx.timestamp * 1000).toISOString();

      // Flatten native transfers to summarise the primary asset movement
      let nativeAmount = 0;
      let counterparty = "";
      if (tx.nativeTransfers && tx.nativeTransfers.length > 0) {
        for (const nt of tx.nativeTransfers) {
          if (nt.fromUserAccount === walletAddress && nt.toUserAccount !== walletAddress) {
            nativeAmount -= lamportsToSol(nt.amount);
            if (!counterparty) counterparty = nt.toUserAccount;
          } else if (nt.toUserAccount === walletAddress && nt.fromUserAccount !== walletAddress) {
            nativeAmount += lamportsToSol(nt.amount);
            if (!counterparty) counterparty = nt.fromUserAccount;
          }
        }
      }

      // If there are token transfers, pick the first one involving our wallet
      let tokenSymbol = "";
      let tokenAmount = 0;
      let tokenMint = "";
      if (tx.tokenTransfers && tx.tokenTransfers.length > 0) {
        for (const tt of tx.tokenTransfers) {
          if (tt.fromUserAccount === walletAddress || tt.toUserAccount === walletAddress) {
            tokenMint = tt.mint;
            tokenSymbol = tt.mint; // raw mint, no resolution
            tokenAmount = tt.toUserAccount === walletAddress ? tt.tokenAmount : -tt.tokenAmount;
            if (!counterparty) {
              counterparty = tt.toUserAccount === walletAddress ? tt.fromUserAccount : tt.toUserAccount;
            }
            break;
          }
        }
      }

      // Choose asset: prefer token transfer data, fall back to SOL native
      const assetSymbol = tokenSymbol || "SOL";
      const amount = tokenSymbol ? tokenAmount : nativeAmount;

      csvRows.push(
        [
          esc(tx.type || ""),
          esc(tx.source || ""),
          esc(assetSymbol),
          amount,
          "", // price_per_unit — not in raw Helius payload
          "", // value_usd — not in raw Helius payload
          feeInSol,
          esc(txDate),
          esc(tx.signature),
          esc(walletAddress),
          esc(counterparty),
          "solana",
          tx.slot,
          esc(tx.description || ""),
          tx.nativeTransfers?.length || 0,
          tx.tokenTransfers?.length || 0,
          tx.events?.swap ? "true" : "false",
          tx.events?.nft ? "true" : "false",
        ].join(",")
      );
    }

    const csv = [csvHeader, ...csvRows].join("\n");
    fs.writeFileSync(filePath, csv, "utf-8");
    console.log(`[Helius] Raw dump written: ${filePath} (${rawTransactions.length} rows)`);
  } catch (err) {
    // Non-fatal — log and continue
    console.warn("[Helius] Failed to write raw CSV dump:", err);
  }
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

  // Clear tracking maps for fresh sync
  incomingMintMap.clear();

  console.log(`[Helius] Fetching ${walletAddress}${startTime ? ` from ${new Date(startTime).toISOString()}` : ""}${endTime ? ` to ${new Date(endTime).toISOString()}` : ""}`);

  const transactions: WalletTransaction[] = [];
  const rawHeliusTransactions: HeliusEnhancedTransaction[] = [];
  let beforeSignature: string | undefined;
  let pageCount = 0;
  const maxPages = 500; // Safety valve only — loop terminates naturally via empty results, startTime cutoff, or retry exhaustion
  let totalRawTx = 0;
  const maxRetries = 3;

  let paginationDone = false;

  while (!paginationDone && pageCount < maxPages) {
    pageCount++;
    const params: Record<string, any> = {
      "api-key": HELIUS_API_KEY,
      limit: 100,
    };

    if (beforeSignature) params.before = beforeSignature;

    let results: HeliusEnhancedTransaction[] | null = null;

    // Retry loop for transient errors (504, 502, 503, network timeouts)
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await axios.get(
          `${HELIUS_BASE_URL}/v0/addresses/${walletAddress}/transactions`,
          {
            params,
            timeout: 30000,
          }
        );
        results = response.data || [];
        break; // Success — exit retry loop
      } catch (error) {
        if (axios.isAxiosError(error)) {
          const status = error.response?.status;
          const message = error.response?.data?.message || error.response?.data?.error || error.message;

          // Non-retryable errors — fail immediately
          if (status === 401 || status === 403) {
            throw new Error("Invalid Helius API key. Check HELIUS_API_KEY environment variable.");
          }

          // Retryable errors: 429 (rate limit), 502, 503, 504, network timeouts
          const isRetryable = !status || status === 429 || status === 502 || status === 503 || status === 504;

          if (isRetryable && attempt < maxRetries) {
            // Exponential backoff: 2s, 4s, 8s
            const backoffMs = Math.pow(2, attempt) * 1000;
            console.warn(`[Helius] Page ${pageCount} attempt ${attempt}/${maxRetries} failed (${status || "timeout"}): ${message}. Retrying in ${backoffMs / 1000}s...`);
            await new Promise(resolve => setTimeout(resolve, backoffMs));
            continue;
          }

          // Final attempt failed — log and break out with partial results
          console.error(`[Helius] Page ${pageCount} failed after ${maxRetries} attempts (${status}): ${message}`);
        } else {
          console.error(`[Helius] Unexpected error on page ${pageCount}:`, error);
        }

        // All retries exhausted — stop pagination but keep what we have
        console.warn(`[Helius] Stopping pagination after ${pageCount - 1} successful pages. ${transactions.length} transactions collected so far will be saved.`);
        paginationDone = true;
        break;
      }
    }

    // If retries exhausted (results is null), stop pagination
    if (results === null) break;

    totalRawTx += results.length;
    rawHeliusTransactions.push(...results);
    if (results.length === 0) break;

    // Log progress every 50 pages to stay within log limits
    if (pageCount % 50 === 0) {
      console.log(`[Helius] Progress: page ${pageCount}, ${totalRawTx} raw tx so far`);
    }

    for (const tx of results) {
      const txTimestamp = tx.timestamp * 1000; // Convert to milliseconds

      // Time-based filtering
      if (startTime && txTimestamp < startTime) {
        paginationDone = true;
        break;
      }
      if (endTime && txTimestamp > endTime) {
        continue; // Skip transactions after endTime
      }

      const timestamp = new Date(txTimestamp);
      const txType = mapTransactionType(tx.type, walletAddress, tx);
      const isSwap = txType === "Swap" || tx.events?.swap;
      const isNftSale = tx.type?.toUpperCase() === "NFT_SALE" && tx.events?.nft;

      // Calculate fee in SOL
      const feeInSol = lamportsToSol(tx.fee || 0);

      // Process NFT sale events (with events.nft data)
      if (isNftSale && tx.events?.nft) {
        processNftSaleTransaction(transactions, tx, tx.events.nft, walletAddress, timestamp, feeInSol);
        continue;
      }

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

          const subTxId = `${tx.signature}-native-${transfer.fromUserAccount.slice(0, 8)}-${transfer.toUserAccount.slice(0, 8)}`;
          transactions.push({
            id: subTxId,
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
            tx_hash: subTxId,
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

          const tokenSubTxId = `${tx.signature}-token-${transfer.mint.slice(0, 8)}-${transfer.fromUserAccount.slice(0, 8)}`;
          transactions.push({
            id: tokenSubTxId,
            type: isIncoming ? "Receive" : "Send",
            asset_symbol: resolveTokenSymbol(transfer.mint),
            asset_address: transfer.mint,
            asset_chain: "solana",
            amount_value: new Decimal(transfer.tokenAmount),
            price_per_unit: null,
            value_usd: new Decimal(0),
            fee_usd: null,
            tx_timestamp: timestamp,
            source: "Solana Wallet",
            source_type: "wallet",
            tx_hash: tokenSubTxId,
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
        const mainSubTxId = `${tx.signature}-main`;
        transactions.push({
          id: mainSubTxId,
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
          tx_hash: mainSubTxId,
          wallet_address: walletAddress,
          chain: "solana",
          block_number: tx.slot,
          explorer_url: getExplorerUrl(tx.signature),
          notes: tx.description || (tx.source !== "SYSTEM_PROGRAM" ? `Source: ${tx.source}` : undefined),
        });
      }
    }

    // Update cursor for next page
    if (!paginationDone && results.length > 0) {
      beforeSignature = results[results.length - 1].signature;

      // Small delay between pages to avoid overwhelming the API
      await new Promise(resolve => setTimeout(resolve, 200));
    } else {
      break;
    }
  }

  console.log(`[Helius] Fetched ${totalRawTx} raw tx → ${transactions.length} records across ${pageCount} pages`);

  // Dump raw Helius payload to CSV for comparison with DB
  if (rawHeliusTransactions.length > 0) {
    dumpRawHeliusToCsv(walletAddress, rawHeliusTransactions);
  }

  // Enrich with USD prices (even for partial results)
  if (transactions.length > 0) {
    await enrichSolanaTransactionsWithPrices(transactions);
  }

  // Sort by timestamp
  transactions.sort((a, b) => a.tx_timestamp.getTime() - b.tx_timestamp.getTime());
  return transactions;
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
    outSymbol = resolveTokenSymbol(input.mint);
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
    inSymbol = resolveTokenSymbol(output.mint);
    const rawAmount = parseInt(output.rawTokenAmount.tokenAmount);
    inAmount = rawAmount / Math.pow(10, output.rawTokenAmount.decimals);
  }

  const swapSubTxId = `${tx.signature}-swap`;

  // Track incoming mint for enrichment
  if (inMint) {
    incomingMintMap.set(swapSubTxId, inMint);
  }

  transactions.push({
    id: swapSubTxId,
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
    tx_hash: swapSubTxId,
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
 * Process an NFT sale transaction from Helius events.nft data.
 * Captures seller, buyer, sale amount (SOL), and NFT mint(s).
 */
function processNftSaleTransaction(
  transactions: WalletTransaction[],
  tx: HeliusEnhancedTransaction,
  nftEvent: NonNullable<HeliusEnhancedTransaction["events"]>["nft"],
  walletAddress: string,
  timestamp: Date,
  feeInSol: number
): void {
  if (!nftEvent) return;

  const seller = nftEvent.seller || "";
  const buyer = nftEvent.buyer || "";
  const saleAmountLamports = nftEvent.amount || 0;
  const saleAmountSol = lamportsToSol(saleAmountLamports);
  const nfts = nftEvent.nfts || [];
  const isSeller = seller === walletAddress;
  const isBuyer = buyer === walletAddress;

  // Build NFT description
  const nftList = nfts
    .map((n) => resolveTokenSymbol(n.mint))
    .join(", ");
  const nftNote = nfts.length > 0 ? `NFT: ${nftList}` : "NFT Sale";

  if (isSeller) {
    // We sold an NFT — record the SOL proceeds as incoming
    const subTxId = `${tx.signature}-nftsale-seller`;
    incomingMintMap.set(subTxId, SOL_MINT);
    transactions.push({
      id: subTxId,
      type: "NFT Sale",
      asset_symbol: nfts.length > 0 ? resolveTokenSymbol(nfts[0].mint) : "NFT",
      asset_address: nfts.length > 0 ? nfts[0].mint : undefined,
      asset_chain: "solana",
      amount_value: new Decimal(nfts.length || 1),
      price_per_unit: saleAmountSol > 0 ? new Decimal(saleAmountSol) : null,
      value_usd: new Decimal(0), // Will be enriched with SOL price later
      fee_usd: feeInSol > 0 ? new Decimal(feeInSol) : null,
      tx_timestamp: timestamp,
      source: "Solana Wallet",
      source_type: "wallet",
      tx_hash: subTxId,
      wallet_address: walletAddress,
      counterparty_address: buyer,
      chain: "solana",
      block_number: tx.slot,
      explorer_url: getExplorerUrl(tx.signature),
      notes: `${nftNote} — Sold for ${saleAmountSol.toFixed(4)} SOL via ${tx.source}`,
      incoming_asset_symbol: "SOL",
      incoming_amount_value: new Decimal(saleAmountSol),
      incoming_value_usd: new Decimal(0), // Enriched in Step 2
    });
  } else if (isBuyer) {
    // We bought an NFT — record the SOL spent as outgoing
    const subTxId = `${tx.signature}-nftsale-buyer`;
    if (nfts.length > 0) {
      incomingMintMap.set(subTxId, nfts[0].mint);
    }
    transactions.push({
      id: subTxId,
      type: "NFT Sale",
      asset_symbol: "SOL",
      asset_chain: "solana",
      amount_value: new Decimal(saleAmountSol),
      price_per_unit: null,
      value_usd: new Decimal(0),
      fee_usd: feeInSol > 0 ? new Decimal(feeInSol) : null,
      tx_timestamp: timestamp,
      source: "Solana Wallet",
      source_type: "wallet",
      tx_hash: subTxId,
      wallet_address: walletAddress,
      counterparty_address: seller,
      chain: "solana",
      block_number: tx.slot,
      explorer_url: getExplorerUrl(tx.signature),
      notes: `${nftNote} — Bought for ${saleAmountSol.toFixed(4)} SOL via ${tx.source}`,
      incoming_asset_symbol: nfts.length > 0 ? resolveTokenSymbol(nfts[0].mint) : "NFT",
      incoming_amount_value: new Decimal(nfts.length || 1),
      incoming_value_usd: new Decimal(0),
    });
  } else {
    // Neither buyer nor seller (shouldn't happen, but handle gracefully)
    const subTxId = `${tx.signature}-nftsale`;
    transactions.push({
      id: subTxId,
      type: "NFT Sale",
      asset_symbol: nfts.length > 0 ? resolveTokenSymbol(nfts[0].mint) : "NFT",
      asset_address: nfts.length > 0 ? nfts[0].mint : undefined,
      asset_chain: "solana",
      amount_value: new Decimal(saleAmountSol),
      price_per_unit: null,
      value_usd: new Decimal(0),
      fee_usd: feeInSol > 0 ? new Decimal(feeInSol) : null,
      tx_timestamp: timestamp,
      source: "Solana Wallet",
      source_type: "wallet",
      tx_hash: subTxId,
      wallet_address: walletAddress,
      chain: "solana",
      block_number: tx.slot,
      explorer_url: getExplorerUrl(tx.signature),
      notes: `${nftNote} — ${saleAmountSol.toFixed(4)} SOL via ${tx.source}`,
    });
  }
}

/**
 * Enrich Solana transactions with USD prices from Helius DAS API
 */
async function enrichSolanaTransactionsWithPrices(
  transactions: WalletTransaction[]
): Promise<void> {
  if (transactions.length === 0) return;

  // Collect unique mints that need pricing + metadata
  const mintsToPrice = new Set<string>();
  mintsToPrice.add(SOL_MINT); // Always need SOL price

  for (const tx of transactions) {
    if (tx.asset_address) {
      mintsToPrice.add(tx.asset_address);
    }
    // Add incoming mints tracked during processing
    const incomingMint = incomingMintMap.get(tx.tx_hash);
    if (incomingMint) {
      mintsToPrice.add(incomingMint);
    }
  }

  // Fetch all prices AND metadata in one batch via Helius DAS
  const { prices, metadata } = await getHeliusTokenData([...mintsToPrice]);
  const solPrice = prices.get(SOL_MINT) || 0;

  // Post-resolve: update any truncated mint-based symbols to real names
  // Pass 1: Resolve asset_symbol from asset_address
  for (const tx of transactions) {
    if (tx.asset_address && tx.asset_symbol.endsWith("...")) {
      const meta = metadata.get(tx.asset_address);
      if (meta) {
        tx.asset_symbol = meta.symbol;
      }
    }
  }
  // Pass 2: Resolve incoming_asset_symbol using tracked incoming mints
  for (const tx of transactions) {
    if (tx.incoming_asset_symbol && tx.incoming_asset_symbol.endsWith("...")) {
      const incMint = incomingMintMap.get(tx.tx_hash);
      if (incMint) {
        const meta = metadata.get(incMint);
        if (meta) {
          tx.incoming_asset_symbol = meta.symbol;
        }
      }
    }
  }

  // Pass 3: Jupiter fallback for still-unresolved symbols
  const stillUnresolved = transactions.filter(
    tx => tx.asset_symbol.endsWith("...") ||
          (tx.incoming_asset_symbol && tx.incoming_asset_symbol.endsWith("..."))
  );
  if (stillUnresolved.length > 0) {
    const jupiterMap = await getJupiterTokenMap();
    for (const tx of transactions) {
      if (tx.asset_address && tx.asset_symbol.endsWith("...")) {
        const sym = jupiterMap.get(tx.asset_address);
        if (sym) {
          tx.asset_symbol = sym;
          tokenMetadataCache.set(tx.asset_address, { symbol: sym, name: sym });
        }
      }
      if (tx.incoming_asset_symbol?.endsWith("...")) {
        const incMint = incomingMintMap.get(tx.tx_hash);
        if (incMint) {
          const sym = jupiterMap.get(incMint);
          if (sym) tx.incoming_asset_symbol = sym;
        }
      }
    }
  }

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

    // Price incoming swap/sale assets
    if (tx.incoming_amount_value) {
      // Use the tracked incoming mint directly
      let incMint: string | null = incomingMintMap.get(tx.tx_hash) || null;
      if (!incMint && tx.incoming_asset_symbol === "SOL") {
        incMint = SOL_MINT;
      }

      if (incMint) {
        const inPrice = prices.get(incMint);
        if (inPrice && inPrice > 0) {
          const inAmount = parseFloat(tx.incoming_amount_value.toString());
          tx.incoming_value_usd = new Decimal(inAmount * inPrice);
        }
      }
    }
  }

  console.log(`[Helius] DAS enrichment: ${prices.size}/${mintsToPrice.size} mints priced (SOL $${solPrice.toFixed(2)}), ${priced} tx priced, ${unpriced} unpriced, ${feesConverted} fees converted`);
}
