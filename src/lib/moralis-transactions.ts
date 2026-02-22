import axios from "axios";
import { Decimal } from "@prisma/client/runtime/library";

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

interface MoralisTransaction {
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
      console.log(
        `[Moralis Price] ${tokenAddress.slice(0, 10)}... on ${chain} at block ${blockNumber}: $${price}`
      );
      return price;
    }

    console.log(
      `[Moralis Price] No price data for ${tokenAddress.slice(0, 10)}... on ${chain} at block ${blockNumber}`
    );
    priceCache.set(cacheKey, 0);
    return null;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      if (status === 404) {
        // Token not found in Moralis price index - common for obscure tokens
        console.log(
          `[Moralis Price] Token not in price index: ${tokenAddress.slice(0, 10)}... on ${chain}`
        );
        priceCache.set(cacheKey, 0);
        return null;
      }
      if (status === 429) {
        console.warn(`[Moralis Price] Rate limited. Skipping price for ${tokenAddress.slice(0, 10)}...`);
        return null;
      }
      console.warn(
        `[Moralis Price] API error (${status}) for ${tokenAddress.slice(0, 10)}...: ${error.response?.data?.message || error.message}`
      );
    } else {
      console.warn(
        `[Moralis Price] Error fetching price for ${tokenAddress.slice(0, 10)}...:`,
        error instanceof Error ? error.message : error
      );
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
  console.log(`[Moralis] ====== Starting fetch for ${walletAddress} on ${chainInfo.name} (chain param: ${moralisChainParam}) ======`);
  if (startTime) console.log(`[Moralis] Start time: ${new Date(startTime).toISOString()}`);
  if (endTime) console.log(`[Moralis] End time: ${new Date(endTime).toISOString()}`);

  const transactions: WalletTransaction[] = [];
  let cursor: string | null = null;
  let pageCount = 0;
  const maxPages = 50;
  let totalRawTx = 0;
  let spamSkipped = 0;

  try {
    // Step 1: Fetch all raw transactions from Moralis
    console.log(`[Moralis] Step 1: Fetching transaction history from API...`);

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

      console.log(
        `[Moralis] Fetching page ${pageCount}${cursor ? " (cursor: " + cursor.slice(0, 20) + "...)" : ""}...`
      );

      const response = await axios.get(
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

      console.log(`[Moralis] Page ${pageCount}: ${results.length} raw transactions received`);

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

        // Post-process: detect swaps and wraps within a single on-chain tx
        const processed = postProcessTransaction(txRecords, tx, chain, walletAddress);
        transactions.push(...processed);
      }

      cursor = data.cursor || null;
    } while (cursor && pageCount < maxPages);

    console.log(
      `[Moralis] Step 1 complete: ${totalRawTx} raw tx fetched, ${spamSkipped} spam skipped, ${transactions.length} valid transactions parsed across ${pageCount} pages`
    );

    // Step 2: Enrich with USD prices
    console.log(`[Moralis] Step 2: Looking up USD prices for ${transactions.length} transactions...`);
    await enrichTransactionsWithPrices(transactions, chain);

    // Sort by timestamp
    transactions.sort((a, b) => a.tx_timestamp.getTime() - b.tx_timestamp.getTime());

    console.log(`[Moralis] ====== Fetch complete: ${transactions.length} transactions for ${chainInfo.name} ======`);
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

  console.log(
    `[Moralis Price] Need ${priceKeys.size} unique price lookups for ${transactions.length} transactions`
  );

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

    // Progress log every 10 lookups
    if (lookedUp % 10 === 0) {
      console.log(
        `[Moralis Price] Progress: ${lookedUp}/${priceKeys.size} lookups (${found} found, ${failed} failed)`
      );
    }
  }

  console.log(
    `[Moralis Price] Lookups complete: ${found}/${priceKeys.size} prices found, ${failed} unavailable`
  );

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
      console.log(`[Moralis] --- Starting chain: ${chainName} ---`);
      const transactions = await getWalletTransactions(walletAddress, chain, startTime, endTime);
      allTransactions.push(...transactions);
      chainResults.push({ chain: chainName, count: transactions.length });
      console.log(`[Moralis] --- ${chainName} complete: ${transactions.length} transactions ---`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(`[Moralis] --- ${chainName} FAILED: ${message} ---`);
      chainResults.push({ chain: chainName, count: 0, error: message });
    }
  }

  // Sort all transactions by timestamp
  allTransactions.sort((a, b) => a.tx_timestamp.getTime() - b.tx_timestamp.getTime());

  // Summary log
  console.log(`[Moralis] ====== Multi-chain fetch complete ======`);
  console.log(`[Moralis] Results by chain:`);
  for (const result of chainResults) {
    if (result.error) {
      console.log(`[Moralis]   ${result.chain}: FAILED - ${result.error}`);
    } else {
      console.log(`[Moralis]   ${result.chain}: ${result.count} transactions`);
    }
  }
  console.log(`[Moralis] Total: ${allTransactions.length} transactions across ${chains.length} chains`);

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
