import axios from "axios";
import { Decimal } from "@prisma/client/runtime/library";
import prisma from "./prisma";
import { getCategory } from "./transaction-categorizer";

// Set SYNC_VERBOSE=1 for per-page / per-token debug logs. Off by default so a full
// multi-chain sync stays well under Vercel's 256-line log limit; the concise per-stage
// summary lines always print regardless.
const VERBOSE = process.env.SYNC_VERBOSE === "1";

// Moralis API key from environment
const MORALIS_API_KEY = process.env.MORALIS_API_KEY;
const MORALIS_BASE_URL = "https://deep-index.moralis.io/api/v2.2";

// All chains supported by Moralis Wallet History API
// Uses the chain identifier accepted by the Moralis API (short name or hex chain ID)
export const SUPPORTED_CHAINS: Record<
  string,
  { name: string; chainParam: string; nativeToken: string; decimals: number; wrappedAddress: string }
> = {
  // --- Major L1s ---
  eth: {
    name: "Ethereum",
    chainParam: "eth",
    nativeToken: "ETH",
    decimals: 18,
    wrappedAddress: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  },
  polygon: {
    name: "Polygon",
    chainParam: "0x89",
    nativeToken: "POL",
    decimals: 18,
    wrappedAddress: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270",
  },
  bsc: {
    name: "BNB Chain",
    chainParam: "0x38",
    nativeToken: "BNB",
    decimals: 18,
    wrappedAddress: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
  },
  avalanche: {
    name: "Avalanche",
    chainParam: "0xa86a",
    nativeToken: "AVAX",
    decimals: 18,
    wrappedAddress: "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7",
  },
  fantom: {
    name: "Fantom",
    chainParam: "0xfa",
    nativeToken: "FTM",
    decimals: 18,
    wrappedAddress: "0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83",
  },
  cronos: {
    name: "Cronos",
    chainParam: "0x19",
    nativeToken: "CRO",
    decimals: 18,
    wrappedAddress: "0x5C7F8A570d578ED84E63fdFA7b1eE72dEae1AE23",
  },
  gnosis: {
    name: "Gnosis",
    chainParam: "0x64",
    nativeToken: "xDAI",
    decimals: 18,
    wrappedAddress: "0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d",
  },
  pulse: {
    name: "PulseChain",
    chainParam: "0x171",
    nativeToken: "PLS",
    decimals: 18,
    wrappedAddress: "0xA1077a294dDE1B09bB078844df40758a5D0f9a27",
  },
  // --- L2s / Rollups ---
  arbitrum: {
    name: "Arbitrum",
    chainParam: "0xa4b1",
    nativeToken: "ETH",
    decimals: 18,
    wrappedAddress: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
  },
  optimism: {
    name: "Optimism",
    chainParam: "0xa",
    nativeToken: "ETH",
    decimals: 18,
    wrappedAddress: "0x4200000000000000000000000000000000000006",
  },
  base: {
    name: "Base",
    chainParam: "0x2105",
    nativeToken: "ETH",
    decimals: 18,
    wrappedAddress: "0x4200000000000000000000000000000000000006",
  },
  linea: {
    name: "Linea",
    chainParam: "0xe708",
    nativeToken: "ETH",
    decimals: 18,
    wrappedAddress: "0xe5D7C2a44FfDDf6b295A15c148167daaAf5Cf34f",
  },
  lisk: {
    name: "Lisk",
    chainParam: "0x46f",
    nativeToken: "ETH",
    decimals: 18,
    wrappedAddress: "0x4200000000000000000000000000000000000006",
  },
  // --- Moonbeam ecosystem ---
  moonbeam: {
    name: "Moonbeam",
    chainParam: "0x504",
    nativeToken: "GLMR",
    decimals: 18,
    wrappedAddress: "0xAcc15dC74880C9944775448304B263D191c6077F",
  },
  moonriver: {
    name: "Moonriver",
    chainParam: "0x505",
    nativeToken: "MOVR",
    decimals: 18,
    wrappedAddress: "0x98878B06940aE243284CA214f92Bb71a2b032B8A",
  },
  // --- Gaming / Specialty ---
  chiliz: {
    name: "Chiliz",
    chainParam: "0x15b38",
    nativeToken: "CHZ",
    decimals: 18,
    wrappedAddress: "0x677F7e16C7Dd57be1D4C8aD1244883214953DC47",
  },
  ronin: {
    name: "Ronin",
    chainParam: "0x7e4",
    nativeToken: "RON",
    decimals: 18,
    wrappedAddress: "0xe514d9DEB7966c8BE0ca922de8a064264eA6bcd4",
  },
  flow: {
    name: "Flow",
    chainParam: "0x2eb",
    nativeToken: "FLOW",
    decimals: 18,
    wrappedAddress: "0xd3bF53DAC106A0290B0483EcBC89d40FcC961f3e",
  },
  sei: {
    name: "Sei",
    chainParam: "0x531",
    nativeToken: "SEI",
    decimals: 18,
    wrappedAddress: "0xE30feDd158A2e3b13e9badaeABaFc5516e95e8C7",
  },
};

// ============================================================
// Moralis API response interfaces
// ============================================================

export interface MoralisTransaction {
  hash: string;
  nonce: string;
  transaction_index: string;
  from_address: string;
  to_address: string;
  value: string;
  gas: string;
  gas_price: string;
  receipt_gas_used: string;
  transaction_fee: string;
  block_timestamp: string;
  block_number: string;
  block_hash: string;
  category: string;
  summary: string;
  possible_spam: boolean;
  receipt_status?: string; // "1" = success, "0" = reverted/failed
  native_transfers?: MoralisNativeTransfer[];
  erc20_transfers?: MoralisERC20Transfer[];
  nft_transfers?: MoralisNFTTransfer[];
}

interface MoralisNativeTransfer {
  from_address: string;
  to_address: string;
  value: string;
  value_formatted: string;
  direction: string;
  internal_transaction: boolean;
  token_symbol: string;
  token_logo: string;
}

interface MoralisERC20Transfer {
  token_name: string;
  token_symbol: string;
  token_logo: string;
  token_decimals: string;
  from_address: string;
  to_address: string;
  address: string; // contract address
  log_index: number;
  value: string;
  value_formatted: string;
  direction: string;
  possible_spam: boolean;
}

interface MoralisNFTTransfer {
  token_name: string;
  token_symbol: string;
  token_address: string;
  token_id: string;
  from_address: string;
  to_address: string;
  direction: string;
  amount: string;
  possible_spam: boolean;
  contract_type?: string; // ERC721 or ERC1155
}

// ============================================================
// Our standardized wallet transaction format
// ============================================================

export interface WalletTransaction {
  id: string;
  type: string;
  asset_symbol: string;
  asset_address?: string;
  asset_chain: string;
  amount_value: Decimal;
  price_per_unit: Decimal | null;
  value_usd: Decimal;
  fee_usd: Decimal | null;
  tx_timestamp: Date;
  source: string;
  source_type: string;
  status?: string; // "confirmed" | "failed" — from the on-chain receipt
  is_income?: boolean; // true for Moralis income categories (e.g. airdrop) — booked at FMV
  tx_hash: string;
  wallet_address: string;
  counterparty_address?: string;
  chain: string;
  block_number: number;
  explorer_url: string;
  notes?: string;
  // Swap fields
  incoming_asset_symbol?: string;
  incoming_asset_address?: string;
  incoming_amount_value?: Decimal;
  incoming_value_usd?: Decimal;
}

// ============================================================
// Price cache and lookup
// ============================================================

// Cache prices in memory to avoid redundant API calls during a single sync
// Key format: "chain:tokenAddress:YYYY-MM-DD" → price in USD
const priceCache = new Map<string, number>();

// Rate limit tracker for price API
let priceApiCallCount = 0;
const PRICE_API_RATE_LIMIT = 20; // max calls per second (Moralis free tier)
let lastPriceApiReset = Date.now();

async function rateLimitPriceApi(): Promise<void> {
  const now = Date.now();
  if (now - lastPriceApiReset > 1000) {
    priceApiCallCount = 0;
    lastPriceApiReset = now;
  }
  if (priceApiCallCount >= PRICE_API_RATE_LIMIT) {
    const waitMs = 1000 - (now - lastPriceApiReset) + 50;
    console.log(`[Moralis Price] Rate limit reached, waiting ${waitMs}ms`);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    priceApiCallCount = 0;
    lastPriceApiReset = Date.now();
  }
  priceApiCallCount++;
}

/**
 * Get historical token price from Moralis API.
 * Uses day-granularity caching to minimize API calls.
 * Returns price in USD, or null if unavailable.
 */
export async function getTokenPriceUSD(
  tokenAddress: string,
  chain: string, // Our internal chain key (e.g., "eth", "polygon")
  blockNumber: number,
  txDate: Date
): Promise<number | null> {
  const dateKey = txDate.toISOString().split("T")[0]; // YYYY-MM-DD
  const cacheKey = `${chain}:${tokenAddress.toLowerCase()}:${dateKey}`;

  // Check cache first
  if (priceCache.has(cacheKey)) {
    return priceCache.get(cacheKey)!;
  }

  // Resolve Moralis chain parameter
  const chainInfo = SUPPORTED_CHAINS[chain];
  const moralisChainParam = chainInfo?.chainParam || chain;

  try {
    await rateLimitPriceApi();

    const response = await axios.get(
      `${MORALIS_BASE_URL}/erc20/${tokenAddress}/price`,
      {
        headers: {
          "X-API-Key": MORALIS_API_KEY,
          Accept: "application/json",
        },
        params: {
          chain: moralisChainParam,
          to_block: blockNumber,
        },
        timeout: 10000,
      }
    );

    const price = response.data?.usdPrice || response.data?.usd_price || null;

    if (price !== null && price !== undefined && !isNaN(price)) {
      priceCache.set(cacheKey, price);
      if (VERBOSE) console.log(`[Moralis Price] ${tokenAddress.slice(0, 10)}… on ${chain} @${blockNumber}: $${price}`);
      return price;
    }

    if (VERBOSE) console.log(`[Moralis Price] No price for ${tokenAddress.slice(0, 10)}… on ${chain} @${blockNumber}`);
    priceCache.set(cacheKey, 0);
    return null;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      if (status === 404) {
        // Token not found in Moralis price index - common for obscure tokens
        if (VERBOSE) console.log(`[Moralis Price] Not in index: ${tokenAddress.slice(0, 10)}… on ${chain}`);
        priceCache.set(cacheKey, 0);
        return null;
      }
      if (status === 429) {
        if (VERBOSE) console.warn(`[Moralis Price] Rate limited: ${tokenAddress.slice(0, 10)}…`);
        return null;
      }
      if (VERBOSE) console.warn(`[Moralis Price] API error (${status}) for ${tokenAddress.slice(0, 10)}…: ${error.response?.data?.message || error.message}`);
    } else {
      if (VERBOSE) console.warn(`[Moralis Price] Error for ${tokenAddress.slice(0, 10)}…:`, error instanceof Error ? error.message : error);
    }
    priceCache.set(cacheKey, 0);
    return null;
  }
}

/**
 * Get native token price using the wrapped token contract address.
 */
export async function getNativeTokenPriceUSD(
  chain: string,
  blockNumber: number,
  txDate: Date
): Promise<number | null> {
  const chainInfo = SUPPORTED_CHAINS[chain];
  if (!chainInfo) return null;
  return getTokenPriceUSD(chainInfo.wrappedAddress, chain, blockNumber, txDate);
}

/**
 * Clear the price cache (useful between sync sessions)
 */
export function clearPriceCache(): void {
  const size = priceCache.size;
  priceCache.clear();
  priceApiCallCount = 0;
  console.log(`[Moralis Price] Cache cleared (had ${size} entries)`);
}

// ============================================================
// Helper functions
// ============================================================

/**
 * Get block explorer URL for a transaction
 */
function getExplorerUrl(chain: string, txHash: string): string {
  const explorers: Record<string, string> = {
    eth: `https://etherscan.io/tx/${txHash}`,
    polygon: `https://polygonscan.com/tx/${txHash}`,
    bsc: `https://bscscan.com/tx/${txHash}`,
    avalanche: `https://snowtrace.io/tx/${txHash}`,
    fantom: `https://ftmscan.com/tx/${txHash}`,
    arbitrum: `https://arbiscan.io/tx/${txHash}`,
    optimism: `https://optimistic.etherscan.io/tx/${txHash}`,
    base: `https://basescan.org/tx/${txHash}`,
    cronos: `https://cronoscan.com/tx/${txHash}`,
    gnosis: `https://gnosisscan.io/tx/${txHash}`,
    linea: `https://lineascan.build/tx/${txHash}`,
  };
  return explorers[chain] || `https://etherscan.io/tx/${txHash}`;
}

/**
 * Convert wei to token amount based on decimals
 */
function fromWei(value: string, decimals: number = 18): number {
  try {
    const num = BigInt(value);
    const divisor = BigInt(10 ** decimals);
    const wholePart = num / divisor;
    const fractionalPart = num % divisor;
    const fractionalStr = fractionalPart.toString().padStart(decimals, "0");
    return parseFloat(`${wholePart}.${fractionalStr}`);
  } catch {
    return 0;
  }
}

/**
 * Resolve the raw Moralis type to store in the DB.
 * Returns the Moralis category as-is (lowercase). Falls back to
 * direction-based "send"/"receive" if no category is provided.
 */
function resolveMoralisType(
  tx: MoralisTransaction,
  walletAddress: string
): string {
  const category = tx.category?.toLowerCase() || "";
  if (category) return category;

  // Direction-based fallback when Moralis provides no category
  const from = tx.from_address?.toLowerCase();
  const to = tx.to_address?.toLowerCase();
  const wallet = walletAddress.toLowerCase();
  if (from === wallet && to !== wallet) return "send";
  if (to === wallet && from !== wallet) return "receive";
  return "contract interaction";
}

/**
 * Post-process transactions from a single Moralis tx to detect swaps and wraps.
 * When a single on-chain tx has both outgoing and incoming token/native transfers,
 * it's likely a swap (DEX trade) or wrap/unwrap.
 */
function postProcessTransaction(
  txRecords: WalletTransaction[],
  tx: MoralisTransaction,
  chain: string,
  walletAddress: string
): WalletTransaction[] {
  if (txRecords.length < 2) return txRecords;

  const chainInfo = SUPPORTED_CHAINS[chain];
  if (!chainInfo) return txRecords;

  // Don't collapse a different-asset out+in pair into a taxable "token swap" when Moralis
  // tagged the tx as a non-swap DeFi/movement category — e.g. borrow (collateral out + loan
  // in), repay, or deposit/withdraw (token out + LP-receipt in). Those are non-taxable moves;
  // merging them would book a phantom disposal. ALSO skip for income categories (airdrop/
  // reward/claim): the inbound leg carries is_income and must stay a separate income record,
  // not be folded into a swap built from the outbound leg (which would drop is_income).
  // Leave the legs as direction-typed transfers/income.
  const cat = (tx.category || "").toLowerCase();
  const nonSwapCategories = new Set(["borrow", "repay", "deposit", "withdraw"]);
  if (nonSwapCategories.has(cat) || getCategory(cat) === "income") return txRecords;

  const wallet = walletAddress.toLowerCase();
  const outTypes = ["send", "token send", "nft send"];
  const inTypes = ["receive", "token receive", "nft receive"];
  const outgoing = txRecords.filter(
    (r) => outTypes.includes(r.type) && parseFloat(r.amount_value.toString()) > 0
  );
  const incoming = txRecords.filter(
    (r) => inTypes.includes(r.type) && parseFloat(r.amount_value.toString()) > 0
  );

  // Need at least one outgoing and one incoming to be a swap/wrap
  if (outgoing.length === 0 || incoming.length === 0) return txRecords;

  const outRecord = outgoing[0];
  const inRecord = incoming[0];
  const wrappedAddr = chainInfo.wrappedAddress.toLowerCase();

  // Detect WETH wrap: send native token, receive wrapped token (or vice versa)
  const outIsNative = !outRecord.asset_address;
  const inIsNative = !inRecord.asset_address;
  const outIsWrapped = outRecord.asset_address?.toLowerCase() === wrappedAddr;
  const inIsWrapped = inRecord.asset_address?.toLowerCase() === wrappedAddr;

  if (outIsNative && inIsWrapped) {
    // Wrap: ETH → WETH
    return [{
      ...outRecord,
      type: "wrap",
      notes: `Wrap ${chainInfo.nativeToken} → W${chainInfo.nativeToken}`,
      incoming_asset_symbol: inRecord.asset_symbol,
      incoming_amount_value: inRecord.amount_value,
      incoming_value_usd: inRecord.value_usd,
    }];
  }

  if (outIsWrapped && inIsNative) {
    // Unwrap: WETH → ETH
    return [{
      ...outRecord,
      type: "unwrap",
      notes: `Unwrap W${chainInfo.nativeToken} → ${chainInfo.nativeToken}`,
      incoming_asset_symbol: inRecord.asset_symbol,
      incoming_amount_value: inRecord.amount_value,
      incoming_value_usd: inRecord.value_usd,
    }];
  }

  // Detect swap: different tokens going out and coming in within the same tx
  // (Moralis category might not have caught it)
  const isSameAsset =
    outRecord.asset_symbol === inRecord.asset_symbol &&
    outRecord.asset_address?.toLowerCase() === inRecord.asset_address?.toLowerCase();

  if (!isSameAsset) {
    // This is a swap — merge into one Swap record
    // Keep all other records that aren't the primary out/in pair (e.g., fees, approvals)
    const otherRecords = txRecords.filter(
      (r) => r !== outRecord && r !== inRecord
    );

    const swapRecord: WalletTransaction = {
      ...outRecord,
      type: "token swap",
      notes: tx.summary || `Swap ${outRecord.asset_symbol} → ${inRecord.asset_symbol}`,
      incoming_asset_symbol: inRecord.asset_symbol,
      incoming_amount_value: inRecord.amount_value,
      incoming_value_usd: inRecord.value_usd,
    };

    return [swapRecord, ...otherRecords];
  }

  return txRecords;
}

// ============================================================
// Main transaction fetching
// ============================================================

/**
 * Fetch wallet transaction history from Moralis API with price lookups.
 * Returns fully populated WalletTransaction objects with USD values.
 */
/**
 * GET a Moralis history page with retry + backoff on TRANSIENT failures (429, any 5xx
 * incl. 504, and network/timeout errors). Without this a single transient 504 on one
 * page throws out of the whole chain fetch and discards every page already fetched
 * (observed in prod: "Base FAILED: 504"). Non-transient errors (401 bad key, 400) throw
 * immediately.
 */
async function getMoralisWithRetry(
  url: string,
  config: Parameters<typeof axios.get>[1],
  maxRetries = 3,
): Promise<import("axios").AxiosResponse> {
  let attempt = 0;
  for (;;) {
    try {
      return await axios.get(url, config);
    } catch (err) {
      const status = axios.isAxiosError(err) ? err.response?.status : undefined;
      const transient = status === undefined || status === 429 || status >= 500;
      if (!transient || attempt >= maxRetries) throw err;
      attempt++;
      const backoffMs = Math.min(2000 * 2 ** (attempt - 1), 15000); // 2s, 4s, 8s…
      console.warn(`[Moralis] Page fetch failed (${status ?? "network/timeout"}); retry ${attempt}/${maxRetries} in ${backoffMs}ms`);
      await new Promise((r) => setTimeout(r, backoffMs));
    }
  }
}

/**
 * Map a Moralis on-chain receipt_status ("1" success, "0" reverted) to our status
 * string. Reverted/failed txns are stored as "failed" so the tax engine (which only
 * considers confirmed/completed/pending) never treats them as real transfers.
 */
export function moralisTxStatus(receiptStatus: string | undefined | null): "confirmed" | "failed" {
  return receiptStatus === "0" ? "failed" : "confirmed";
}

/**
 * Parse one Moralis /history page's raw results into WalletTransaction records.
 *
 * Pure (no network, no pricing) so it is shared by the full-history fetcher
 * ({@link getWalletTransactions}) and the bounded/resumable fetcher
 * ({@link getWalletTransactionsChunk}). Prices are left null / 0 here and filled by the
 * enrichment step. Returns the parsed records plus the spam count (for logging).
 */
function parseMoralisPage(
  results: MoralisTransaction[],
  chain: string,
  walletAddress: string,
  chainInfo: (typeof SUPPORTED_CHAINS)[string],
): { transactions: WalletTransaction[]; spamSkipped: number } {
  const transactions: WalletTransaction[] = [];
  let spamSkipped = 0;

  for (const tx of results) {
    // Skip spam transactions
    if (tx.possible_spam) {
      spamSkipped++;
      continue;
    }

    const txType = resolveMoralisType(tx, walletAddress);
    const blockNumber = parseInt(tx.block_number) || 0;
    const timestamp = new Date(tx.block_timestamp);

    // Calculate gas fee in native token units
    const feeWei = tx.transaction_fee || "0";
    const feeInNativeToken = fromWei(feeWei, chainInfo.decimals);

    // Moralis tags the whole tx with a category (e.g. "airdrop"). If that category maps to
    // income, flag the INBOUND legs as income so they book ordinary income at FMV (with a
    // cost-basis lot) instead of being transfer-skipped. Direction still drives the movement
    // type; the category is otherwise passed to postProcessTransaction (swap-merge guard).
    const txCategory = (tx.category || "").toLowerCase();
    const txIsIncome = getCategory(txCategory) === "income";

    // Collect records per-tx for post-processing (swap/wrap detection)
    const txRecords: WalletTransaction[] = [];

    // === Process native transfers ===
    if (tx.native_transfers && tx.native_transfers.length > 0) {
      for (const transfer of tx.native_transfers) {
        const amount = parseFloat(transfer.value_formatted || "0");
        if (amount === 0) continue;

        const isIncoming = transfer.direction === "receive";

        txRecords.push({
          id: `${tx.hash}-native-${transfer.from_address}-${transfer.to_address}`,
          type: isIncoming ? "receive" : "send",
          is_income: isIncoming && txIsIncome,
          asset_symbol: chainInfo.nativeToken,
          asset_chain: chain,
          amount_value: new Decimal(Math.abs(amount)),
          price_per_unit: null, // Filled in Step 2
          value_usd: new Decimal(0), // Filled in Step 2
          fee_usd: !isIncoming && feeInNativeToken > 0
            ? new Decimal(feeInNativeToken) // Temporarily store native amount; converted in Step 2
            : null,
          tx_timestamp: timestamp,
          source: `${chainInfo.name} Wallet`,
          source_type: "wallet",
          tx_hash: tx.hash,
          wallet_address: walletAddress,
          counterparty_address: isIncoming ? transfer.from_address : transfer.to_address,
          chain,
          block_number: blockNumber,
          explorer_url: getExplorerUrl(chain, tx.hash),
          notes: tx.summary || undefined,
        });
      }
    }

    // === Process ERC20 transfers ===
    if (tx.erc20_transfers && tx.erc20_transfers.length > 0) {
      for (const transfer of tx.erc20_transfers) {
        if (transfer.possible_spam) {
          spamSkipped++;
          continue;
        }

        const amount = parseFloat(transfer.value_formatted || "0");
        if (amount === 0) continue;

        const isIncoming = transfer.direction === "receive";

        txRecords.push({
          id: `${tx.hash}-erc20-${transfer.log_index}`,
          type: isIncoming ? "token receive" : "token send",
          is_income: isIncoming && txIsIncome,
          asset_symbol: transfer.token_symbol || "UNKNOWN",
          asset_address: transfer.address,
          asset_chain: chain,
          amount_value: new Decimal(Math.abs(amount)),
          price_per_unit: null, // Filled in Step 2
          value_usd: new Decimal(0), // Filled in Step 2
          fee_usd: null, // Gas fee is on the parent native tx
          tx_timestamp: timestamp,
          source: `${chainInfo.name} Wallet`,
          source_type: "wallet",
          tx_hash: tx.hash,
          wallet_address: walletAddress,
          counterparty_address: isIncoming ? transfer.from_address : transfer.to_address,
          chain,
          block_number: blockNumber,
          explorer_url: getExplorerUrl(chain, tx.hash),
          notes: transfer.token_name || transfer.token_symbol || undefined,
        });
      }
    }

    // === Process NFT transfers ===
    if (tx.nft_transfers && tx.nft_transfers.length > 0) {
      for (const transfer of tx.nft_transfers) {
        if (transfer.possible_spam) {
          spamSkipped++;
          continue;
        }

        const isIncoming = transfer.direction === "receive";
        const amount = parseInt(transfer.amount || "1");
        const contractType = transfer.contract_type || "ERC721";
        const collectionName = transfer.token_name || "Unknown Collection";
        const tokenId = transfer.token_id || "?";

        txRecords.push({
          id: `${tx.hash}-nft-${transfer.token_address}-${transfer.token_id}`,
          type: isIncoming ? "nft receive" : "nft send",
          asset_symbol: transfer.token_symbol || "NFT",
          asset_address: transfer.token_address,
          asset_chain: chain,
          amount_value: new Decimal(amount),
          price_per_unit: null, // NFT pricing is complex; left null
          value_usd: new Decimal(0), // NFTs need marketplace lookup for accurate pricing
          fee_usd: null,
          tx_timestamp: timestamp,
          source: `${chainInfo.name} Wallet`,
          source_type: "wallet",
          tx_hash: tx.hash,
          wallet_address: walletAddress,
          counterparty_address: isIncoming ? transfer.from_address : transfer.to_address,
          chain,
          block_number: blockNumber,
          explorer_url: getExplorerUrl(chain, tx.hash),
          notes: `NFT [${contractType}]: ${collectionName} #${tokenId}`,
        });
      }
    }

    // === Contract interactions with no decoded transfers ===
    if (
      (!tx.native_transfers || tx.native_transfers.length === 0) &&
      (!tx.erc20_transfers || tx.erc20_transfers.length === 0) &&
      (!tx.nft_transfers || tx.nft_transfers.length === 0)
    ) {
      const value = fromWei(tx.value || "0", chainInfo.decimals);
      if (value > 0 || !["send", "receive"].includes(txType)) {
        txRecords.push({
          id: `${tx.hash}-main`,
          type: txType,
          asset_symbol: chainInfo.nativeToken,
          asset_chain: chain,
          amount_value: new Decimal(Math.abs(value)),
          price_per_unit: null,
          value_usd: new Decimal(0),
          fee_usd: feeInNativeToken > 0 ? new Decimal(feeInNativeToken) : null,
          tx_timestamp: timestamp,
          source: `${chainInfo.name} Wallet`,
          source_type: "wallet",
          tx_hash: tx.hash,
          wallet_address: walletAddress,
          counterparty_address: tx.to_address,
          chain,
          block_number: blockNumber,
          explorer_url: getExplorerUrl(chain, tx.hash),
          notes: tx.summary || tx.category || undefined,
        });
      }
    }

    // Capture the tx's gas fee on exactly one record for ERC-20-only txns (a DEX
    // swap composed purely of erc20_transfers has no native-transfer record to
    // carry it, so gas was previously lost). Only when the synced wallet actually
    // PAID the gas (it is the tx sender) and no record already carries a fee (avoids
    // double-counting). Stored in native units; converted to USD in Step 2, then
    // deducted from proceeds on the outgoing/swap side by the tax engine.
    if (
      feeInNativeToken > 0 &&
      tx.from_address?.toLowerCase() === walletAddress.toLowerCase() &&
      !txRecords.some((r) => r.fee_usd != null)
    ) {
      const feeTarget =
        txRecords.find((r) => ["send", "token send", "nft send"].includes(r.type)) ||
        txRecords[0];
      if (feeTarget) feeTarget.fee_usd = new Decimal(feeInNativeToken);
    }

    // Post-process: detect swaps and wraps within a single on-chain tx
    const processed = postProcessTransaction(txRecords, tx, chain, walletAddress);
    // Stamp the on-chain receipt status so reverted/failed txns are excluded from
    // cost-basis/tax (the engine only considers confirmed/completed/pending).
    const txStatus = moralisTxStatus(tx.receipt_status);
    for (const r of processed) r.status = txStatus;
    transactions.push(...processed);
  }

  return { transactions, spamSkipped };
}

export async function getWalletTransactions(
  walletAddress: string,
  chain: string = "eth",
  startTime?: number,
  endTime?: number
): Promise<WalletTransaction[]> {
  if (!MORALIS_API_KEY) {
    throw new Error("MORALIS_API_KEY environment variable is not set");
  }

  const chainInfo = SUPPORTED_CHAINS[chain];
  if (!chainInfo) {
    throw new Error(
      `Unsupported chain: ${chain}. Supported: ${Object.keys(SUPPORTED_CHAINS).join(", ")}`
    );
  }

  const moralisChainParam = chainInfo.chainParam;
  const windowStr = startTime ? ` since ${new Date(startTime).toISOString().slice(0, 10)}` : " (full history)";
  console.log(`[Moralis] ${chainInfo.name}: fetching ${walletAddress.slice(0, 10)}…${windowStr}`);

  const transactions: WalletTransaction[] = [];
  let cursor: string | null = null;
  let pageCount = 0;
  // ~50k txns/chain safety bound (was 50 = 5k, which silently dropped the OLDEST
  // history in DESC order → later sells hit empty lots and booked 100% gains).
  // Truncation is now surfaced as a warning below instead of being silent.
  const maxPages = 500;
  let totalRawTx = 0;
  let spamSkipped = 0;
  const rawTransactions: MoralisTransaction[] = [];

  try {
    // Step 1: Fetch all raw transactions from Moralis
    do {
      pageCount++;
      const params: Record<string, any> = {
        chain: moralisChainParam,
        order: "DESC",
        limit: 100,
        include_internal_transactions: true,
      };

      if (cursor) params.cursor = cursor;
      if (startTime) params.from_date = new Date(startTime).toISOString();
      if (endTime) params.to_date = new Date(endTime).toISOString();

      if (VERBOSE) console.log(`[Moralis] Fetching page ${pageCount}${cursor ? " (cursor …)" : ""}`);

      const response = await getMoralisWithRetry(
        `${MORALIS_BASE_URL}/wallets/${walletAddress}/history`,
        {
          headers: {
            "X-API-Key": MORALIS_API_KEY,
            Accept: "application/json",
          },
          params,
          timeout: 30000,
        }
      );

      const data = response.data;
      const results: MoralisTransaction[] = data.result || [];
      totalRawTx += results.length;
      rawTransactions.push(...results); // faithful raw record for the audit dump

      if (VERBOSE) console.log(`[Moralis] Page ${pageCount}: ${results.length} raw`);

      const parsed = parseMoralisPage(results, chain, walletAddress, chainInfo);
      transactions.push(...parsed.transactions);
      spamSkipped += parsed.spamSkipped;

      cursor = data.cursor || null;
    } while (cursor && pageCount < maxPages);

    if (cursor && pageCount >= maxPages) {
      console.warn(
        `[Moralis] ⚠️ Page cap (${maxPages} pages ≈ ${maxPages * 100} txns) reached for ${walletAddress} on ${chainInfo.name}; OLDEST history beyond this was NOT fetched (DESC order). Older cost-basis lots may be missing.`
      );
    }

    console.log(
      `[Moralis] ${chainInfo.name}: ${totalRawTx} raw → ${transactions.length} parsed, ${spamSkipped} spam, ${pageCount} page(s)`
    );

    // Safety net: enforce the [startTime, endTime] window client-side (from_date/to_date is
    // sent per page, but this guards both bounds independently of Moralis semantics).
    if (startTime || endTime) {
      for (let i = transactions.length - 1; i >= 0; i--) {
        const ts = transactions[i].tx_timestamp.getTime();
        if ((startTime && ts < startTime) || (endTime && ts > endTime)) transactions.splice(i, 1);
      }
    }

    // Step 2: Enrich with USD prices
    await enrichTransactionsWithPrices(transactions, chain);

    // Sort by timestamp
    transactions.sort((a, b) => a.tx_timestamp.getTime() - b.tx_timestamp.getTime());

    // Persist raw payloads for the audit table. This is the legacy one-shot path (used by
    // csv-import); the resumable/chunk path dumps per chunk in the sync route.
    await dumpRawMoralisToDb(walletAddress, chain, rawTransactions);

    return transactions;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const message = error.response?.data?.message || error.message;

      console.error(`[Moralis] API error on ${chainInfo.name}: status=${status}, message=${message}`);

      if (status === 401) {
        throw new Error("Invalid Moralis API key. Check MORALIS_API_KEY environment variable.");
      } else if (status === 429) {
        throw new Error("Moralis API rate limit exceeded. Please try again later.");
      } else {
        throw new Error(`Moralis API error (${status}): ${message}`);
      }
    }
    console.error(`[Moralis] Unexpected error on ${chainInfo.name}:`, error);
    throw error;
  }
}

export interface ChainFetchChunk {
  transactions: WalletTransaction[];
  /** Moralis cursor for the NEXT page, or null when this chain is fully fetched. */
  nextCursor: string | null;
  pagesFetched: number;
  rawCount: number;
  spamSkipped: number;
  /** Raw Moralis payloads for this chunk (for the raw-audit dump). */
  rawTransactions: MoralisTransaction[];
}

/**
 * Fetch a BOUNDED slice of one chain's history (up to `maxPages` pages), resuming from
 * `cursor`, and price it inline (same coverage as {@link getWalletTransactions}). This is
 * how a very large wallet is synced: the caller runs many short requests, each fetching +
 * pricing + persisting one bounded chunk, resuming from the returned `nextCursor` (null =
 * chain exhausted). Bounding the pages keeps every request well under the serverless
 * timeout, and pricing stays in the chunk (rather than deferred to the Solana-centric
 * enrichment step) so EVM token coverage is not regressed. Pass `priceInline: false` to
 * skip pricing (fetch-only).
 */
export async function getWalletTransactionsChunk(
  walletAddress: string,
  chain: string,
  opts: {
    cursor?: string | null;
    startTime?: number;
    endTime?: number;
    maxPages?: number;
    priceInline?: boolean;
  } = {},
): Promise<ChainFetchChunk> {
  if (!MORALIS_API_KEY) {
    throw new Error("MORALIS_API_KEY environment variable is not set");
  }

  const chainInfo = SUPPORTED_CHAINS[chain];
  if (!chainInfo) {
    throw new Error(
      `Unsupported chain: ${chain}. Supported: ${Object.keys(SUPPORTED_CHAINS).join(", ")}`
    );
  }

  const moralisChainParam = chainInfo.chainParam;
  const maxPages = opts.maxPages ?? 60;
  const transactions: WalletTransaction[] = [];
  const rawTransactions: MoralisTransaction[] = [];
  let cursor: string | null = opts.cursor ?? null;
  let pagesFetched = 0;
  let rawCount = 0;
  let spamSkipped = 0;

  try {
    for (let page = 0; page < maxPages; page++) {
      const params: Record<string, any> = {
        chain: moralisChainParam,
        order: "DESC",
        limit: 100,
        include_internal_transactions: true,
      };
      // Moralis encodes the query window inside the cursor, so from_date/to_date are only
      // sent on the very first page of a fresh chain (before we have a cursor).
      if (cursor) {
        params.cursor = cursor;
      } else {
        if (opts.startTime) params.from_date = new Date(opts.startTime).toISOString();
        if (opts.endTime) params.to_date = new Date(opts.endTime).toISOString();
      }

      const response = await getMoralisWithRetry(
        `${MORALIS_BASE_URL}/wallets/${walletAddress}/history`,
        {
          headers: {
            "X-API-Key": MORALIS_API_KEY,
            Accept: "application/json",
          },
          params,
          timeout: 30000,
        }
      );

      pagesFetched++;
      const data = response.data;
      const results: MoralisTransaction[] = data.result || [];
      rawCount += results.length;
      rawTransactions.push(...results); // faithful raw record for the audit dump

      const parsed = parseMoralisPage(results, chain, walletAddress, chainInfo);
      transactions.push(...parsed.transactions);
      spamSkipped += parsed.spamSkipped;

      cursor = data.cursor || null;
      if (!cursor) break; // chain fully fetched
    }

    // Safety net: enforce the [startTime, endTime] window client-side too. This path relies
    // on Moralis preserving from_date in the cursor across pages; filtering here guards both
    // bounds independently of cursor internals (mirrors the Helius path).
    if (opts.startTime || opts.endTime) {
      const s = opts.startTime;
      const e = opts.endTime;
      for (let i = transactions.length - 1; i >= 0; i--) {
        const ts = transactions[i].tx_timestamp.getTime();
        if ((s && ts < s) || (e && ts > e)) transactions.splice(i, 1);
      }
    }

    // Price this chunk inline (unless disabled) so each persisted chunk is self-contained
    // and EVM token coverage matches the full-history fetcher.
    if (opts.priceInline !== false) {
      await enrichTransactionsWithPrices(transactions, chain);
    }

    // Ascending within the chunk so downstream ordering is stable.
    transactions.sort((a, b) => a.tx_timestamp.getTime() - b.tx_timestamp.getTime());

    console.log(
      `[Moralis] ${chainInfo.name} chunk: ${rawCount} raw → ${transactions.length} parsed, ${spamSkipped} spam, ${pagesFetched} page(s)${cursor ? " (more pending)" : " (chain complete)"}`
    );

    return { transactions, nextCursor: cursor, pagesFetched, rawCount, spamSkipped, rawTransactions };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const message = error.response?.data?.message || error.message;
      console.error(`[Moralis] API error on ${chainInfo.name} chunk: status=${status}, message=${message}`);
      if (status === 401) {
        throw new Error("Invalid Moralis API key. Check MORALIS_API_KEY environment variable.");
      } else if (status === 429) {
        throw new Error("Moralis API rate limit exceeded. Please try again later.");
      }
      throw new Error(`Moralis API error (${status}): ${message}`);
    }
    console.error(`[Moralis] Unexpected error on ${chainInfo.name} chunk:`, error);
    throw error;
  }
}

/**
 * Persist raw Moralis wallet-history payloads to moralis_raw_transactions so we can compare
 * exactly what Moralis returned (category, transfers, spam flag) against how we categorized
 * it and the cost basis / P&L we computed. One row per on-chain tx per wallet+chain (unique
 * key → re-syncs don't duplicate). Non-fatal on error.
 */
export async function dumpRawMoralisToDb(
  walletAddress: string,
  chain: string,
  rawTransactions: MoralisTransaction[],
): Promise<void> {
  if (!rawTransactions || rawTransactions.length === 0) return;
  try {
    // Dedupe by hash within this batch (createMany can't skip in-batch dups before insert;
    // the table's unique key handles cross-sync dups via skipDuplicates).
    const seen = new Set<string>();
    const rows = [];
    for (const tx of rawTransactions) {
      if (!tx.hash || seen.has(tx.hash)) continue;
      seen.add(tx.hash);
      // Guard conversions so one malformed row can't fail (and drop) the whole createMany
      // chunk: skip a row with an unparseable timestamp; null a non-numeric block_number.
      const ts = new Date(tx.block_timestamp);
      if (isNaN(ts.getTime())) continue;
      const blockNumber = /^\d+$/.test(String(tx.block_number)) ? BigInt(tx.block_number) : null;
      rows.push({
        wallet_address: walletAddress,
        chain,
        moralis_category: tx.category || null,
        tx_hash: tx.hash,
        block_number: blockNumber,
        tx_timestamp: ts,
        from_address: tx.from_address || null,
        to_address: tx.to_address || null,
        summary: tx.summary || null,
        possible_spam: !!tx.possible_spam,
        receipt_status: tx.receipt_status || null,
        fee_wei: tx.transaction_fee || null,
        native_transfers_count: tx.native_transfers?.length || 0,
        erc20_transfers_count: tx.erc20_transfers?.length || 0,
        nft_transfers_count: tx.nft_transfers?.length || 0,
        raw_payload: tx as any,
      });
    }

    const chunkSize = 500;
    let inserted = 0;
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      const result = await prisma.moralisRawTransaction.createMany({
        data: chunk,
        skipDuplicates: true,
      });
      inserted += result.count;
    }
    console.log(`[Moralis] Raw dump saved: ${inserted} rows for ${walletAddress.slice(0, 8)}… (${chain})`);
  } catch (err) {
    console.warn("[Moralis] Failed to write raw dump to DB:", err);
  }
}

/**
 * Enrich an array of transactions with USD price data.
 * Groups by (token, date) to minimize API calls.
 */
async function enrichTransactionsWithPrices(
  transactions: WalletTransaction[],
  chain: string
): Promise<void> {
  if (transactions.length === 0) return;

  const chainInfo = SUPPORTED_CHAINS[chain];
  if (!chainInfo) return;

  // Collect unique (tokenAddress, date) pairs to minimize price lookups
  const priceKeys = new Map<
    string,
    { tokenAddress: string; blockNumber: number; date: Date; isNative: boolean }
  >();

  for (const tx of transactions) {
    const dateKey = tx.tx_timestamp.toISOString().split("T")[0];
    const isNative = !tx.asset_address;
    const tokenAddress = isNative ? chainInfo.wrappedAddress : tx.asset_address!;
    const key = `${tokenAddress.toLowerCase()}:${dateKey}`;

    if (!priceKeys.has(key)) {
      priceKeys.set(key, {
        tokenAddress,
        blockNumber: tx.block_number,
        date: tx.tx_timestamp,
        isNative,
      });
    }
  }

  if (VERBOSE) console.log(`[Moralis Price] ${priceKeys.size} unique lookups for ${transactions.length} tx`);

  // Fetch prices for each unique token+date
  // Note: getTokenPriceUSD handles chainParam resolution internally
  const prices = new Map<string, number>(); // key → USD price
  let lookedUp = 0;
  let found = 0;
  let failed = 0;

  for (const [key, info] of priceKeys) {
    lookedUp++;
    const price = await getTokenPriceUSD(
      info.tokenAddress,
      chain, // internal key — getTokenPriceUSD resolves to chainParam
      info.blockNumber,
      info.date
    );

    if (price !== null && price > 0) {
      prices.set(key, price);
      found++;
    } else {
      failed++;
    }

    // Progress log every 50 lookups (verbose only)
    if (VERBOSE && lookedUp % 50 === 0) {
      console.log(`[Moralis Price] ${lookedUp}/${priceKeys.size} (${found} found, ${failed} failed)`);
    }
  }

  console.log(`[Moralis Price] ${chain}: priced ${found}/${priceKeys.size} tokens (${failed} unavailable)`);

  // Now apply prices to all transactions
  let priced = 0;
  let unpriced = 0;

  // Also look up native token price for fee conversion
  // We'll collect the native price per date
  const nativePriceByDate = new Map<string, number>();

  for (const tx of transactions) {
    const dateKey = tx.tx_timestamp.toISOString().split("T")[0];
    const isNative = !tx.asset_address;
    const tokenAddress = isNative ? chainInfo.wrappedAddress : tx.asset_address!;
    const key = `${tokenAddress.toLowerCase()}:${dateKey}`;

    const price = prices.get(key);

    if (price && price > 0) {
      const amountNum = parseFloat(tx.amount_value.toString());
      tx.price_per_unit = new Decimal(price);
      tx.value_usd = new Decimal(amountNum * price);
      priced++;
    } else {
      // value_usd stays 0, price_per_unit stays null
      unpriced++;
    }

    // Cache native price for fee conversion
    if (isNative && price && price > 0) {
      nativePriceByDate.set(dateKey, price);
    }
  }

  // Get native price for fee conversion if not already cached
  for (const tx of transactions) {
    const dateKey = tx.tx_timestamp.toISOString().split("T")[0];
    if (!nativePriceByDate.has(dateKey)) {
      const nativeKey = `${chainInfo.wrappedAddress.toLowerCase()}:${dateKey}`;
      const nativePrice = prices.get(nativeKey);
      if (nativePrice && nativePrice > 0) {
        nativePriceByDate.set(dateKey, nativePrice);
      }
    }
  }

  // Convert fee_usd from native token amount to actual USD
  let feesConverted = 0;
  for (const tx of transactions) {
    if (tx.fee_usd !== null) {
      const dateKey = tx.tx_timestamp.toISOString().split("T")[0];
      const nativePrice = nativePriceByDate.get(dateKey);

      if (nativePrice && nativePrice > 0) {
        const feeInNative = parseFloat(tx.fee_usd.toString());
        tx.fee_usd = new Decimal(feeInNative * nativePrice);
        feesConverted++;
      } else {
        // Can't convert fee to USD without native token price — look it up
        const price = await getNativeTokenPriceUSD(chain, tx.block_number, tx.tx_timestamp);
        if (price && price > 0) {
          const feeInNative = parseFloat(tx.fee_usd.toString());
          tx.fee_usd = new Decimal(feeInNative * price);
          nativePriceByDate.set(dateKey, price);
          feesConverted++;
        } else {
          // Leave fee as native token amount (better than nothing)
          console.log(
            `[Moralis Price] Could not convert fee to USD for tx ${tx.tx_hash.slice(0, 10)}... — left as ${chainInfo.nativeToken} amount`
          );
        }
      }
    }
  }

  console.log(
    `[Moralis Price] Enrichment complete: ${priced} priced, ${unpriced} unpriced, ${feesConverted} fees converted to USD`
  );
}

// ============================================================
// Multi-chain fetching
// ============================================================

/**
 * Fetch wallet transactions across multiple chains with price enrichment.
 */
export async function getWalletTransactionsAllChains(
  walletAddress: string,
  chains: string[] = ["eth", "polygon", "bsc", "arbitrum", "optimism", "base"],
  startTime?: number,
  endTime?: number
): Promise<WalletTransaction[]> {
  console.log(
    `[Moralis] ====== Multi-chain fetch: ${walletAddress} across ${chains.length} chains (${chains.join(", ")}) ======`
  );

  const allTransactions: WalletTransaction[] = [];
  const chainResults: { chain: string; count: number; error?: string }[] = [];

  for (const chain of chains) {
    const chainInfo = SUPPORTED_CHAINS[chain];
    const chainName = chainInfo?.name || chain;

    try {
      const transactions = await getWalletTransactions(walletAddress, chain, startTime, endTime);
      allTransactions.push(...transactions);
      chainResults.push({ chain: chainName, count: transactions.length });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(`[Moralis] --- ${chainName} FAILED: ${message} ---`);
      chainResults.push({ chain: chainName, count: 0, error: message });
    }
  }

  // Sort all transactions by timestamp
  allTransactions.sort((a, b) => a.tx_timestamp.getTime() - b.tx_timestamp.getTime());

  // Summary log (one line: per-chain counts + any failures)
  const perChain = chainResults
    .map((r) => (r.error ? `${r.chain}=FAILED` : `${r.chain}=${r.count}`))
    .join(", ");
  console.log(`[Moralis] Multi-chain total ${allTransactions.length} across ${chains.length}: ${perChain}`);

  return allTransactions;
}

// ============================================================
// Utilities
// ============================================================

/**
 * Validate EVM wallet address format
 */
export function isValidEthAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}
