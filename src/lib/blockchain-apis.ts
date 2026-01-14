import axios from "axios";
import { Decimal } from "@prisma/client/runtime/library";
import { cacheBlockchainTransactions, CacheKeys } from "./cache-helpers";

// API Configuration
const ETHERSCAN_API_BASE = "https://api.etherscan.io/api";
const SOLSCAN_API_BASE = "https://public-api.solscan.io";

// Get API keys from environment variables
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || "";
const SOLSCAN_API_KEY = process.env.SOLSCAN_API_KEY || "";

// Types for API responses
interface EtherscanTransaction {
  blockNumber: string;
  timeStamp: string;
  hash: string;
  from: string;
  to: string;
  value: string; // in Wei
  gas: string;
  gasPrice: string;
  gasUsed: string;
  isError: string;
  txreceipt_status: string;
  contractAddress?: string;
  tokenName?: string;
  tokenSymbol?: string;
  tokenDecimal?: string;
}

interface EtherscanResponse {
  status: string;
  message: string;
  result: EtherscanTransaction[];
}

interface SolscanTransaction {
  slot: number;
  blockTime: number;
  txHash: string;
  fee: number;
  status: string;
  lamport: number;
  signer: string[];
  parsedInstruction?: Array<{
    program: string;
    programId: string;
    parsed?: {
      type: string;
      info?: {
        source?: string;
        destination?: string;
        amount?: number;
        authority?: string;
        mint?: string;
        tokenAmount?: {
          amount: string;
          decimals: number;
          uiAmount: number;
          uiAmountString: string;
        };
      };
    };
  }>;
  tokenTransfers?: Array<{
    fromTokenAccount: string;
    toTokenAccount: string;
    fromUserAccount: string;
    toUserAccount: string;
    tokenAmount: number;
    mint: string;
    tokenSymbol?: string;
    tokenName?: string;
  }>;
}

interface SolscanResponse {
  success: boolean;
  data: SolscanTransaction[];
}

/**
 * Fetch Ethereum transactions for a wallet address
 * Handles rate limiting and pagination
 * Results are cached permanently (blockchain data never changes)
 */
export async function fetchEthereumTransactions(
  address: string,
  startBlock: number = 0,
  endBlock: number = 99999999
): Promise<EtherscanTransaction[]> {
  const cacheKey = CacheKeys.ethereumTransactions(address, startBlock, endBlock);

  return cacheBlockchainTransactions<EtherscanTransaction[]>(cacheKey, async () => {
    try {
      const allTransactions: EtherscanTransaction[] = [];

    // Fetch normal transactions (with pagination if needed)
    let page = 1;
    let hasMore = true;

    while (hasMore && page <= 10) {
      // Limit to 10 pages to avoid rate limits
      try {
        const normalTxResponse = await axios.get<EtherscanResponse>(
          ETHERSCAN_API_BASE,
          {
            params: {
              module: "account",
              action: "txlist",
              address,
              startblock: startBlock,
              endblock: endBlock,
              page,
              offset: 10000, // Max allowed per page
              sort: "asc",
              apikey: ETHERSCAN_API_KEY,
            },
            timeout: 30000,
          }
        );

        if (
          normalTxResponse.data.status === "1" &&
          normalTxResponse.data.result &&
          normalTxResponse.data.result.length > 0
        ) {
          allTransactions.push(...normalTxResponse.data.result);
          // If we got less than 10000, we've reached the end
          if (normalTxResponse.data.result.length < 10000) {
            hasMore = false;
          } else {
            page++;
            // Add delay to respect rate limits
            await new Promise((resolve) => setTimeout(resolve, 200));
          }
        } else {
          hasMore = false;
        }
      } catch (error) {
        console.error(`Error fetching page ${page} of Ethereum transactions:`, error);
        hasMore = false;
      }
    }

    // Fetch ERC-20 token transfers
    try {
      const tokenTxResponse = await axios.get<EtherscanResponse>(
        ETHERSCAN_API_BASE,
        {
          params: {
            module: "account",
            action: "tokentx",
            address,
            startblock: startBlock,
            endblock: endBlock,
            page: 1,
            offset: 10000,
            sort: "asc",
            apikey: ETHERSCAN_API_KEY,
          },
          timeout: 30000,
        }
      );

      if (tokenTxResponse.data.status === "1" && tokenTxResponse.data.result) {
        allTransactions.push(...tokenTxResponse.data.result);
      }
    } catch (error) {
      console.error("Error fetching token transactions:", error);
      // Continue even if token transactions fail
    }

    // Fetch internal transactions
    try {
      const internalTxResponse = await axios.get<EtherscanResponse>(
        ETHERSCAN_API_BASE,
        {
          params: {
            module: "account",
            action: "txlistinternal",
            address,
            startblock: startBlock,
            endblock: endBlock,
            page: 1,
            offset: 10000,
            sort: "asc",
            apikey: ETHERSCAN_API_KEY,
          },
          timeout: 30000,
        }
      );

      if (
        internalTxResponse.data.status === "1" &&
        internalTxResponse.data.result
      ) {
        allTransactions.push(...internalTxResponse.data.result);
      }
    } catch (error) {
      console.error("Error fetching internal transactions:", error);
      // Continue even if internal transactions fail
    }

      // Remove duplicates by hash and sort by timestamp
      const uniqueTransactions = Array.from(
        new Map(allTransactions.map((tx) => [tx.hash, tx])).values()
      ).sort((a, b) => parseInt(a.timeStamp) - parseInt(b.timeStamp));

      return uniqueTransactions;
    } catch (error) {
      console.error("Error fetching Ethereum transactions:", error);
      throw new Error(
        `Failed to fetch Ethereum transactions: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  });
}

/**
 * Fetch Solana transactions for a wallet address
 * Note: Solscan public API has rate limits. For production, consider using Pro API.
 * Results are cached permanently (blockchain data never changes)
 */
export async function fetchSolanaTransactions(
  address: string,
  limit: number = 1000
): Promise<SolscanTransaction[]> {
  const cacheKey = CacheKeys.solanaTransactions(address, limit);

  return cacheBlockchainTransactions<SolscanTransaction[]>(cacheKey, async () => {
    try {
      // Try Solscan public API first
      // Note: This endpoint structure may vary - adjust based on actual Solscan API docs
      const response = await axios.get<any>(
        `${SOLSCAN_API_BASE}/account/transactions`,
        {
          params: {
            account: address,
            limit,
          },
          headers: SOLSCAN_API_KEY
            ? {
                token: SOLSCAN_API_KEY,
              }
            : undefined,
          timeout: 30000, // 30 second timeout
        }
      );

      // Handle different response formats
      if (response.data?.data && Array.isArray(response.data.data)) {
        return response.data.data;
      } else if (Array.isArray(response.data)) {
        return response.data;
      } else if (response.data?.success && response.data?.data) {
        return response.data.data;
      }

      // If no data found, return empty array
      console.warn("No transaction data found in Solscan response");
      return [];
    } catch (error) {
      // If public API fails, try alternative endpoint or return empty
      console.error("Error fetching Solana transactions from Solscan:", error);
      
      // Alternative: Try using Solana RPC directly (would need @solana/web3.js)
      // For now, throw error to let caller handle it
      throw new Error(
        `Failed to fetch Solana transactions: ${
          error instanceof Error ? error.message : "Unknown error"
        }. Note: You may need a Solscan Pro API key for production use.`
      );
    }
  });
}

/**
 * Convert Wei to Ether
 */
function weiToEther(wei: string): number {
  return parseFloat(wei) / 1e18;
}

/**
 * Convert Lamports to SOL
 */
function lamportsToSol(lamports: number): number {
  return lamports / 1e9;
}

/**
 * Get ETH price at a given timestamp using CoinGecko API
 */
async function getEthPriceAtTimestamp(timestamp: number): Promise<number> {
  try {
    const { getHistoricalPriceAtTimestamp } = await import("@/lib/coingecko");
    const price = await getHistoricalPriceAtTimestamp("ETH", timestamp);
    if (price !== null) {
      return price;
    }
  } catch (error) {
    console.error("[Blockchain APIs] Error fetching ETH price from CoinGecko:", error);
  }
  // Fallback to default price if API fails
  return 2000;
}

/**
 * Get SOL price at a given timestamp using CoinGecko API
 */
async function getSolPriceAtTimestamp(timestamp: number): Promise<number> {
  try {
    const { getHistoricalPriceAtTimestamp } = await import("@/lib/coingecko");
    const price = await getHistoricalPriceAtTimestamp("SOL", timestamp);
    if (price !== null) {
      return price;
    }
  } catch (error) {
    console.error("[Blockchain APIs] Error fetching SOL price from CoinGecko:", error);
  }
  // Fallback to default price if API fails
  return 100;
}

/**
 * Get price for any cryptocurrency at a given timestamp using CoinGecko API
 */
async function getPriceAtTimestamp(
  symbol: string,
  timestamp: number
): Promise<number | null> {
  try {
    const { getHistoricalPriceAtTimestamp } = await import("@/lib/coingecko");
    return await getHistoricalPriceAtTimestamp(symbol, timestamp);
  } catch (error) {
    console.error(
      `[Blockchain APIs] Error fetching ${symbol} price from CoinGecko:`,
      error
    );
    return null;
  }
}

/**
 * Parse Ethereum transaction to our Transaction format
 */
export async function parseEthereumTransaction(
  tx: EtherscanTransaction,
  walletAddress: string
): Promise<{
  type: string;
  asset_symbol: string;
  amount_value: Decimal;
  value_usd: Decimal;
  price_per_unit: Decimal | null;
  fee_usd: Decimal | null;
  tx_timestamp: Date;
  tx_hash: string;
  chain: string;
  block_number: bigint;
  wallet_address: string;
  counterparty_address: string | null;
  status: string;
}> {
  const timestamp = parseInt(tx.timeStamp) * 1000;
  const date = new Date(timestamp);
  const isIncoming = tx.to.toLowerCase() === walletAddress.toLowerCase();
  const isOutgoing = tx.from.toLowerCase() === walletAddress.toLowerCase();

  // Determine transaction type
  let type = "Transfer";
  if (tx.contractAddress) {
    // Token transfer
    type = isIncoming ? "Receive" : "Send";
  } else if (tx.value && tx.value !== "0") {
    // Native ETH transfer
    type = isIncoming ? "Receive" : "Send";
  } else {
    // Contract interaction
    type = "Swap"; // Simplified - could be other contract calls
  }

  // Get asset symbol
  const assetSymbol = tx.tokenSymbol || "ETH";
  const amount = tx.tokenDecimal
    ? parseFloat(tx.value) / Math.pow(10, parseInt(tx.tokenDecimal))
    : weiToEther(tx.value);

  // Get price using CoinGecko API
  const timestamp = parseInt(tx.timeStamp);
  const price =
    assetSymbol === "ETH"
      ? await getEthPriceAtTimestamp(timestamp)
      : await getPriceAtTimestamp(assetSymbol, timestamp) ||
        (await getEthPriceAtTimestamp(timestamp)); // Fallback to ETH price if token not found
  const valueUsd = Math.abs(amount * price);

  // Calculate gas fee in USD
  // Gas fee = gasUsed * gasPrice (in Wei)
  let feeUsd = new Decimal(0);
  if (tx.gasUsed && tx.gasPrice && isOutgoing) {
    // Only charge fees to the sender
    const gasFeeWei = BigInt(tx.gasUsed) * BigInt(tx.gasPrice);
    const gasFeeEth = weiToEther(gasFeeWei.toString());
    const ethPrice = await getEthPriceAtTimestamp(timestamp);
    feeUsd = new Decimal(gasFeeEth * ethPrice);
  }

  // Determine value sign (negative for outgoing, positive for incoming)
  const valueUsdSigned = isOutgoing ? -valueUsd : valueUsd;

  return {
    type,
    asset_symbol: assetSymbol,
    amount_value: new Decimal(Math.abs(amount)),
    value_usd: new Decimal(valueUsdSigned),
    price_per_unit: new Decimal(price),
    fee_usd: feeUsd,
    tx_timestamp: date,
    tx_hash: tx.hash,
    chain: "ethereum",
    block_number: BigInt(tx.blockNumber),
    wallet_address: walletAddress,
    counterparty_address: isIncoming ? tx.from : tx.to,
    status: tx.isError === "0" && tx.txreceipt_status === "1" ? "confirmed" : "failed",
  };
}

/**
 * Parse Solana transaction to our Transaction format
 */
export async function parseSolanaTransaction(
  tx: SolscanTransaction,
  walletAddress: string
): Promise<
  Array<{
    type: string;
    asset_symbol: string;
    amount_value: Decimal;
    value_usd: Decimal;
    price_per_unit: Decimal | null;
    fee_usd: Decimal | null;
    tx_timestamp: Date;
    tx_hash: string;
    chain: string;
    block_number: bigint;
    wallet_address: string;
    counterparty_address: string | null;
    status: string;
  }>
> {
  const date = new Date(tx.blockTime * 1000);
  
  // Calculate transaction fee in USD (paid by the signer/wallet owner)
  const solPrice = await getSolPriceAtTimestamp(tx.blockTime);
  const feeInSol = lamportsToSol(tx.fee);
  const feeUsd = new Decimal(feeInSol * solPrice);
  
  const transactions: Array<{
    type: string;
    asset_symbol: string;
    amount_value: Decimal;
    value_usd: Decimal;
    price_per_unit: Decimal | null;
    fee_usd: Decimal | null;
    tx_timestamp: Date;
    tx_hash: string;
    chain: string;
    block_number: bigint;
    wallet_address: string;
    counterparty_address: string | null;
    status: string;
  }> = [];

  // Handle native SOL transfers
  if (tx.parsedInstruction) {
    for (const instruction of tx.parsedInstruction) {
      if (instruction.parsed?.type === "transfer") {
        const info = instruction.parsed.info;
        if (!info) continue;

        const isIncoming =
          info.destination?.toLowerCase() === walletAddress.toLowerCase();
        const isOutgoing =
          info.source?.toLowerCase() === walletAddress.toLowerCase();

        if (isIncoming || isOutgoing) {
          const amount = info.amount
            ? lamportsToSol(info.amount)
            : info.tokenAmount
            ? info.tokenAmount.uiAmount || 0
            : 0;

          const price = await getSolPriceAtTimestamp(tx.blockTime);
          const valueUsd = Math.abs(amount * price);
          const valueUsdSigned = isOutgoing ? -valueUsd : valueUsd;
          
          // Fee is only charged to outgoing transactions (sender pays fee)
          const transactionFee = isOutgoing ? feeUsd : new Decimal(0);

          transactions.push({
            type: isIncoming ? "Receive" : "Send",
            asset_symbol: "SOL",
            amount_value: new Decimal(Math.abs(amount)),
            value_usd: new Decimal(valueUsdSigned),
            price_per_unit: new Decimal(price),
            fee_usd: transactionFee,
            tx_timestamp: date,
            tx_hash: tx.txHash,
            chain: "solana",
            block_number: BigInt(tx.slot),
            wallet_address: walletAddress,
            counterparty_address: isIncoming
              ? info.source || null
              : info.destination || null,
            status: tx.status === "Success" ? "confirmed" : "failed",
          });
        }
      }
    }
  }

  // Handle token transfers
  if (tx.tokenTransfers) {
    for (const transfer of tx.tokenTransfers) {
      const isIncoming =
        transfer.toUserAccount.toLowerCase() === walletAddress.toLowerCase();
      const isOutgoing =
        transfer.fromUserAccount.toLowerCase() === walletAddress.toLowerCase();

      if (isIncoming || isOutgoing) {
        const amount = transfer.tokenAmount;
        const tokenSymbol = transfer.tokenSymbol || "UNKNOWN";
        // For tokens, fetch token price from CoinGecko
        const price =
          (await getPriceAtTimestamp(tokenSymbol, tx.blockTime)) || 0;
        const valueUsd = Math.abs(amount * price);
        const valueUsdSigned = isOutgoing ? -valueUsd : valueUsd;
        
        // Fee is only charged to outgoing transactions (sender pays fee)
        const transactionFee = isOutgoing ? feeUsd : new Decimal(0);

        transactions.push({
          type: isIncoming ? "Receive" : "Send",
          asset_symbol: tokenSymbol,
          amount_value: new Decimal(Math.abs(amount)),
          value_usd: new Decimal(valueUsdSigned),
          price_per_unit: new Decimal(price),
          fee_usd: transactionFee,
          tx_timestamp: date,
          tx_hash: tx.txHash,
          chain: "solana",
          block_number: BigInt(tx.slot),
          wallet_address: walletAddress,
          counterparty_address: isIncoming
            ? transfer.fromUserAccount
            : transfer.toUserAccount,
          status: tx.status === "Success" ? "confirmed" : "failed",
        });
      }
    }
  }

  // If no specific transfers found, create a fee transaction
  if (transactions.length === 0 && tx.fee > 0) {
    transactions.push({
      type: "Fee",
      asset_symbol: "SOL",
      amount_value: new Decimal(feeInSol),
      value_usd: new Decimal(-feeUsd.toNumber()), // Fees are negative
      price_per_unit: new Decimal(solPrice),
      fee_usd: feeUsd,
      tx_timestamp: date,
      tx_hash: tx.txHash,
      chain: "solana",
      block_number: BigInt(tx.slot),
      wallet_address: walletAddress,
      counterparty_address: null,
      status: tx.status === "Success" ? "confirmed" : "failed",
    });
  }

  return transactions;
}

/**
 * Fetch and parse all transactions for a wallet address
 */
export async function fetchWalletTransactions(
  address: string,
  chain: "ethereum" | "solana"
): Promise<
  Array<{
    type: string;
    asset_symbol: string;
    amount_value: Decimal;
    value_usd: Decimal;
    price_per_unit: Decimal | null;
    fee_usd: Decimal | null;
    tx_timestamp: Date;
    tx_hash: string;
    chain: string;
    block_number: bigint;
    wallet_address: string;
    counterparty_address: string | null;
    status: string;
  }>
> {
  if (chain === "ethereum") {
    const transactions = await fetchEthereumTransactions(address);
    const parsed = await Promise.all(
      transactions.map((tx) => parseEthereumTransaction(tx, address))
    );
    return parsed;
  } else if (chain === "solana") {
    const transactions = await fetchSolanaTransactions(address);
    const parsed = await Promise.all(
      transactions.flatMap((tx) => parseSolanaTransaction(tx, address))
    );
    return parsed;
  } else {
    throw new Error(`Unsupported chain: ${chain}`);
  }
}
