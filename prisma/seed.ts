import { PrismaClient, Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

const prisma = new PrismaClient();

// Mock transaction data (copied from frontend)
const allTransactions = [
  {
    id: 1,
    type: "Buy",
    asset: "Bitcoin",
    amount: "0.05 BTC",
    price: "$43,015.00",
    value: "$2,150.75", // Should be negative for Buy
    date: "2023-12-15T15:32:41Z",
    status: "Completed",
    exchange: "Coinbase",
  },
  {
    id: 2,
    type: "Sell",
    asset: "Ethereum",
    amount: "1.2 ETH",
    price: "$2,400.33",
    value: "$2,880.40",
    date: "2023-12-10T09:15:22Z",
    status: "Completed",
    exchange: "Kraken",
  },
  {
    id: 3,
    type: "Buy",
    asset: "Solana",
    amount: "12 SOL",
    price: "$112.24",
    value: "$1,346.88", // Should be negative for Buy
    date: "2023-12-05T18:45:32Z",
    status: "Completed",
    exchange: "Binance",
  },
  {
    id: 4,
    type: "Receive",
    asset: "Bitcoin",
    amount: "0.01 BTC",
    price: "$43,015.00", // Price might be irrelevant for receive
    value: "$430.15",
    date: "2023-12-01T11:22:15Z",
    status: "Completed",
    exchange: "External Wallet",
  },
  {
    id: 5,
    type: "Send",
    asset: "Ethereum",
    amount: "0.5 ETH",
    price: "$2,398.50", // Price might be irrelevant for send
    value: "$1,199.25", // Should be negative for Send
    date: "2023-11-28T14:55:38Z",
    status: "Completed",
    exchange: "External Wallet",
  },
  {
    id: 6,
    type: "Stake",
    asset: "Cardano",
    amount: "500 ADA",
    price: "$0.58",
    value: "$290.00", // Should likely be negative cost basis
    date: "2023-11-25T08:40:12Z",
    status: "Completed",
    exchange: "Binance", // Exchange might not be right term here? Staking platform
  },
   {
    id: 7,
    type: "Swap",
    asset: "USDC to ETH", // Asset description
    amount: "1000 USDC → 0.412 ETH", // Represents two amounts
    price: "1 USDC = 0.000412 ETH", // Price description
    value: "$1,000.00", // Represents value of asset OUT
    date: "2023-11-22T16:33:24Z",
    status: "Completed",
    exchange: "Uniswap", // Source Protocol
  },
  {
    id: 8,
    type: "Buy",
    asset: "Polygon",
    amount: "200 MATIC",
    price: "$0.98",
    value: "$196.00", // Should be negative for Buy
    date: "2023-11-18T10:12:45Z",
    status: "Completed",
    exchange: "Coinbase",
  },
   {
    id: 9,
    type: "Staking", // Or maybe "Stake Reward"? Need clarification
    asset: "Ethereum",
    amount: "1.5 ETH", // Is this amount staked or reward received?
    price: "$2,000.00",
    value: "$3,000.00", // If reward, this is income (+)
    date: "2023-11-20T12:00:00Z",
    status: "Completed",
    exchange: "StakingPool", // Source
  },
  {
    id: 10,
    type: "Bridge",
    asset: "Ethereum → Polygon", // Asset description
    amount: "0.8 ETH", // Amount sent
    price: "$1,800.00", // Price of ETH
    value: "$1,440.00", // Value sent, should be negative?
    date: "2023-11-19T09:00:00Z",
    status: "Completed",
    exchange: "Polygon Bridge", // Source Protocol
  },
   {
    id: 11,
    type: "Liquidity Providing", // Maybe "Add Liquidity"?
    asset: "ETH/USDC", // Asset description (Pair)
    amount: "0.2 LP", // Amount of LP tokens received
    price: "$200.00", // Price per LP token?
    value: "$40.00", // Cost basis? Should be negative?
    date: "2023-11-17T15:30:00Z",
    status: "Completed",
    exchange: "Uniswap", // Source Protocol
  },
   {
    id: 12,
    type: "NFT Purchase",
    asset: "CoolNFT #1234", // Asset Name
    amount: "1 NFT", // Amount + Symbol
    price: "$500.00", // Price paid
    value: "$500.00", // Cost basis, should be negative?
    date: "2023-11-15T14:00:00Z",
    status: "Completed",
    exchange: "OpenSea", // Source Marketplace
  },
   {
    id: 13,
    type: "DCA", // Treat as Buy
    asset: "Bitcoin",
    amount: "0.01 BTC",
    price: "$2,500.00", // Price seems wrong if amount is 0.01 BTC and value $25? Let's assume value is correct amount*price.
    value: "$25.00", // Cost basis, should be negative? Let's re-calc price = value/amount
    date: "2023-11-14T08:45:00Z",
    status: "Completed",
    exchange: "Crypto.com",
  },
   {
    id: 14,
    type: "Transfer",
    asset: "USDC",
    amount: "100 USDC",
    price: "$1.00", // Price irrelevant?
    value: "$100.00", // Value transferred. Sign depends on perspective (Send/Receive) - assume net zero for now?
    date: "2023-11-13T22:10:00Z",
    status: "Completed",
    exchange: "External Wallet", // Source/Destination context needed
  },
   {
    id: 15,
    type: "Swap",
    asset: "USDT → ETH", // Asset description
    amount: "200 USDT → 0.07 ETH", // Amounts in/out
    price: "1 USDT = 0.00035 ETH", // Price description
    value: "$200.00", // Value of asset OUT
    date: "2023-11-12T18:20:00Z",
    status: "Completed",
    exchange: "Uniswap",
  },
   {
    id: 16,
    type: "Zero Transaction",
    asset: "Solana",
    amount: "0 SOL",
    price: "$100.00", // Price irrelevant
    value: "$0.00",
    date: "2023-11-11T10:00:00Z",
    status: "Completed",
    exchange: "Binance",
  },
   {
    id: 17,
    type: "Spam Transaction",
    asset: "Unknown Token",
    amount: "0.0001 XYZ",
    price: "$0.0001",
    value: "$0.00000001",
    date: "2023-11-10T07:00:00Z",
    status: "Completed",
    exchange: "SpamNet", // Source?
  },
  {
    id: 18,
    type: "Buy",
    asset: "Chainlink",
    amount: "25 LINK",
    price: "$14.75",
    value: "$368.75", // Should be negative
    date: "2023-11-09T09:15:00Z",
    status: "Completed",
    exchange: "Binance",
  },
  {
    id: 19,
    type: "Sell",
    asset: "Dogecoin",
    amount: "1000 DOGE",
    price: "$0.085",
    value: "$85.00", // Should be positive
    date: "2023-11-08T14:30:00Z",
    status: "Completed",
    exchange: "Kraken",
  },
  {
    id: 20,
    type: "Buy",
    asset: "Avalanche",
    amount: "5 AVAX",
    price: "$18.50",
    value: "$92.50", // Should be negative
    date: "2023-11-07T11:22:00Z",
    status: "Completed",
    exchange: "Coinbase",
  },
  {
    id: 21,
    type: "Receive",
    asset: "Ripple",
    amount: "500 XRP",
    price: "$0.62", // Price irrelevant?
    value: "$310.00", // Should be positive
    date: "2023-11-06T16:45:00Z",
    status: "Completed",
    exchange: "External Wallet",
  },
  {
    id: 22,
    type: "Send",
    asset: "Polkadot",
    amount: "10 DOT",
    price: "$5.20", // Price irrelevant?
    value: "$52.00", // Should be negative
    date: "2023-11-05T08:12:00Z",
    status: "Completed",
    exchange: "External Wallet",
  },
   {
    id: 23,
    type: "Stake",
    asset: "Cosmos",
    amount: "15 ATOM",
    price: "$8.75",
    value: "$131.25", // Should be negative cost basis
    date: "2023-11-04T10:30:00Z",
    status: "Completed",
    exchange: "Keplr Wallet", // Source Wallet
  },
   {
    id: 24,
    type: "NFT Purchase",
    asset: "Bored Ape #5678",
    amount: "1 NFT",
    price: "$48,000.00",
    value: "$48,000.00", // Should be negative cost basis
    date: "2023-11-03T15:45:00Z",
    status: "Completed",
    exchange: "OpenSea",
  },
   {
    id: 25,
    type: "Swap",
    asset: "BTC → ETH",
    amount: "0.05 BTC → 0.75 ETH",
    price: "1 BTC = 15 ETH",
    value: "$2,250.00", // Value of asset OUT (BTC)
    date: "2023-11-02T13:20:00Z",
    status: "Completed",
    exchange: "1inch",
  },
   {
    id: 26,
    type: "Bridge",
    asset: "USDC → Optimism", // Asset description
    amount: "500 USDC", // Amount sent
    price: "$1.00", // Price of USDC
    value: "$500.00", // Value sent, should be negative?
    date: "2023-11-01T09:15:00Z",
    status: "Completed",
    exchange: "Optimism Bridge",
  },
   {
    id: 27,
    type: "DCA", // Treat as Buy
    asset: "Ethereum",
    amount: "0.1 ETH",
    price: "$1,950.00",
    value: "$195.00", // Should be negative
    date: "2023-10-31T07:00:00Z",
    status: "Completed",
    exchange: "Crypto.com",
  },
   {
    id: 28,
    type: "Liquidity Providing", // Add Liquidity
    asset: "BTC/USDC",
    amount: "0.01 LP",
    price: "$800.00", // Price per LP token?
    value: "$8.00", // Cost basis? Should be negative?
    date: "2023-10-30T14:25:00Z",
    status: "Completed",
    exchange: "Uniswap",
  },
  {
    id: 29,
    type: "Buy",
    asset: "Arbitrum",
    amount: "100 ARB",
    price: "$0.95",
    value: "$95.00", // Should be negative
    date: "2023-10-29T11:10:00Z",
    status: "Completed",
    exchange: "Binance",
  },
  {
    id: 30,
    type: "Sell",
    asset: "Shiba Inu",
    amount: "10000000 SHIB",
    price: "$0.00001",
    value: "$100.00", // Should be positive
    date: "2023-10-28T16:35:00Z",
    status: "Completed",
    exchange: "Kraken",
  },
  {
    id: 31,
    type: "Transfer",
    asset: "Bitcoin",
    amount: "0.02 BTC",
    price: "$42,000.00", // Price irrelevant?
    value: "$840.00", // Value transferred. Sign depends on perspective.
    date: "2023-10-27T08:45:00Z",
    status: "Completed",
    exchange: "External Wallet",
  },
   {
    id: 32,
    type: "Staking", // Stake reward?
    asset: "Polkadot",
    amount: "25 DOT", // Amount received?
    price: "$5.30",
    value: "$132.50", // Income (+)
    date: "2023-10-26T12:20:00Z",
    status: "Completed",
    exchange: "Kraken", // Source exchange
  },
  {
    id: 33,
    type: "Buy",
    asset: "Uniswap", // Asset Name (UNI token)
    amount: "20 UNI",
    price: "$4.75",
    value: "$95.00", // Should be negative
    date: "2023-10-25T10:05:00Z",
    status: "Completed",
    exchange: "Coinbase",
  },
   {
    id: 34,
    type: "Swap",
    asset: "SOL → USDC",
    amount: "5 SOL → 135 USDC",
    price: "1 SOL = 27 USDC",
    value: "$135.00", // Value of asset OUT (SOL)
    date: "2023-10-24T15:50:00Z",
    status: "Completed",
    exchange: "Jupiter",
  },
   {
    id: 35,
    type: "NFT Sale",
    asset: "CryptoKitty #4321",
    amount: "1 NFT",
    price: "$350.00", // Sale price
    value: "$350.00", // Proceeds (+)
    date: "2023-10-23T13:25:00Z",
    status: "Completed",
    exchange: "OpenSea",
  },
   {
    id: 36,
    type: "Bridge",
    asset: "ETH → Arbitrum", // Asset description
    amount: "0.5 ETH", // Amount sent
    price: "$1,900.00", // Price of ETH
    value: "$950.00", // Value sent, should be negative?
    date: "2023-10-22T11:15:00Z",
    status: "Completed",
    exchange: "Arbitrum Bridge",
  },
  {
    id: 37,
    type: "Receive",
    asset: "USDT",
    amount: "1000 USDT",
    price: "$1.00", // Price irrelevant?
    value: "$1,000.00", // Should be positive
    date: "2023-10-21T09:10:00Z",
    status: "Completed",
    exchange: "External Wallet",
  },
  {
    id: 38,
    type: "Zero Transaction",
    asset: "Cardano",
    amount: "0 ADA",
    price: "$0.52", // Price irrelevant
    value: "$0.00",
    date: "2023-10-20T14:30:00Z",
    status: "Completed",
    exchange: "Binance",
  },
  {
    id: 39,
    type: "DCA", // Treat as Buy
    asset: "Solana",
    amount: "1 SOL",
    price: "$27.50",
    value: "$27.50", // Should be negative
    date: "2023-10-19T08:00:00Z",
    status: "Completed",
    exchange: "Crypto.com",
  },
  {
    id: 40,
    type: "Buy",
    asset: "Aave",
    amount: "2 AAVE",
    price: "$75.20",
    value: "$150.40", // Should be negative
    date: "2023-10-18T11:45:00Z",
    status: "Completed",
    exchange: "Coinbase",
  },
  {
    id: 41,
    type: "Sell",
    asset: "Cosmos",
    amount: "10 ATOM",
    price: "$8.45",
    value: "$84.50", // Should be positive
    date: "2023-10-17T15:15:00Z",
    status: "Completed",
    exchange: "Kraken",
  },
  {
    id: 42,
    type: "Send",
    asset: "Bitcoin",
    amount: "0.005 BTC",
    price: "$41,500.00", // Price irrelevant?
    value: "$207.50", // Should be negative
    date: "2023-10-16T09:30:00Z",
    status: "Completed",
    exchange: "External Wallet",
  },
   {
    id: 43,
    type: "Stake",
    asset: "Ethereum",
    amount: "0.5 ETH",
    price: "$1,850.00",
    value: "$925.00", // Should be negative cost basis
    date: "2023-10-15T12:20:00Z",
    status: "Completed",
    exchange: "Lido", // Staking Protocol
  },
   {
    id: 44,
    type: "Liquidity Providing", // Add Liquidity
    asset: "ETH/MATIC", // Asset pair
    amount: "0.15 LP", // LP tokens received
    price: "$300.00", // Price per LP?
    value: "$45.00", // Cost basis? Should be negative?
    date: "2023-10-14T14:10:00Z",
    status: "Completed",
    exchange: "QuickSwap", // Protocol
  },
   {
    id: 45,
    type: "Spam Transaction",
    asset: "ScamToken",
    amount: "10000 SCAM",
    price: "$0.00001",
    value: "$0.10",
    date: "2023-10-13T10:05:00Z",
    status: "Completed",
    exchange: "Unknown", // Source
  },
  {
    id: 46,
    type: "Buy",
    asset: "Chainlink",
    amount: "10 LINK",
    price: "$13.20",
    value: "$132.00", // Should be negative
    date: "2023-10-12T13:45:00Z",
    status: "Completed",
    exchange: "Binance",
  },
  {
    id: 47,
    type: "Transfer",
    asset: "Polkadot",
    amount: "5 DOT",
    price: "$5.15", // Price irrelevant?
    value: "$25.75", // Value transferred. Sign depends on perspective.
    date: "2023-10-11T09:55:00Z",
    status: "Completed",
    exchange: "External Wallet",
  },
   {
    id: 48,
    type: "Swap",
    asset: "AVAX → BTC",
    amount: "10 AVAX → 0.005 BTC",
    price: "1 AVAX = 0.0005 BTC",
    value: "$210.00", // Value of asset OUT (AVAX)
    date: "2023-10-10T15:35:00Z",
    status: "Completed",
    exchange: "TraderJoe", // Protocol
  },
   {
    id: 49,
    type: "NFT Purchase",
    asset: "Art Block #7890",
    amount: "1 NFT",
    price: "$800.00",
    value: "$800.00", // Should be negative cost basis
    date: "2023-10-09T11:20:00Z",
    status: "Completed",
    exchange: "OpenSea",
  },
   {
    id: 50,
    type: "DCA", // Treat as Buy
    asset: "Bitcoin",
    amount: "0.01 BTC",
    price: "$42,500.00",
    value: "$425.00", // Should be negative
    date: "2023-10-08T08:00:00Z",
    status: "Completed",
    exchange: "Crypto.com",
  },
];


// Helper function to safely parse numbers from strings (handling $, ,, etc.)
function parseDecimal(value: string | null | undefined): Decimal | null {
  if (value === null || value === undefined) return null;
  const cleaned = String(value).replace(/[$,]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : new Decimal(num);
}

// Helper function to parse amount and symbol from strings like "0.05 BTC"
function parseAmount(amountStr: string | null | undefined): { amount_value: Decimal | null, asset_symbol: string | null } {
    if (!amountStr) return { amount_value: null, asset_symbol: null };

    // Handle swap/bridge cases with arrows first
    if (amountStr.includes('→')) {
        // For swaps/bridges, take the first part as the primary amount/symbol
        amountStr = amountStr.split('→')[0].trim();
    }

    const parts = amountStr.trim().split(/\s+/);
    if (parts.length === 0) return { amount_value: null, asset_symbol: null };

    const valueStr = parts[0];
    const symbol = parts.length > 1 ? parts[1] : null; // Symbol might be missing

    const value = parseDecimal(valueStr);
    return { amount_value: value, asset_symbol: symbol };
}

// Helper function to determine chain based on asset symbol or source
function determineChain(symbol: string | null, source: string | null): string | null {
  const sym = symbol?.toUpperCase();
  const src = source?.toLowerCase();

  if (sym === 'BTC') return 'Bitcoin';
  if (['ETH', 'USDC', 'USDT', 'LINK', 'AAVE', 'UNI', 'SHIB', 'LP'].includes(sym ?? '')) return 'Ethereum';
  if (sym === 'SOL') return 'Solana';
  if (sym === 'MATIC') return 'Polygon';
  if (sym === 'ADA') return 'Cardano';
  if (sym === 'DOGE') return 'Dogecoin';
  if (sym === 'AVAX') return 'Avalanche';
  if (sym === 'XRP') return 'Ripple';
  if (sym === 'DOT') return 'Polkadot';
  if (sym === 'ATOM') return 'Cosmos';
  if (sym === 'ARB') return 'Arbitrum';
  if (sym === 'NFT') { // Check source for NFT chain
      if (src?.includes('opensea') || src?.includes('ethereum')) return 'Ethereum';
      if (src?.includes('solana')) return 'Solana'; // Add other marketplaces if needed
  }
  // Add more rules as needed
  if (src?.includes('arbitrum')) return 'Arbitrum';
  if (src?.includes('optimism')) return 'Optimism';
  if (src?.includes('polygon')) return 'Polygon';
  if (src?.includes('binance')) return 'BSC'; // Assuming Binance means Binance Smart Chain here

  return null; // Default if unknown
}

// Helper function to determine source type
function determineSourceType(source: string | null): string | null {
    const src = source?.toLowerCase();
    if (!src) return null;

    if (['coinbase', 'kraken', 'binance', 'crypto.com'].includes(src)) return 'exchange';
    if (['external wallet', 'keplr wallet', 'metamask'].includes(src)) return 'wallet'; // Assuming metamask implies wallet
    if (['uniswap', 'polygon bridge', 'stakingpool', 'lido', '1inch', 'jupiter', 'quickswap', 'traderjoe', 'arbitrum bridge', 'optimism bridge'].includes(src)) return 'protocol';
    if (['opensea'].includes(src)) return 'marketplace';
    if (['spamnet', 'unknown'].includes(src)) return 'unknown';

    // Default guess
    if (src.includes('wallet')) return 'wallet';
    if (src.includes('bridge')) return 'protocol';
    if (src.includes('swap') || src.includes('pool')) return 'protocol';


    return null;
}

// Function to generate a fake transaction hash
function generateFakeTxHash(): string {
  const chars = 'abcdef0123456789';
  let hash = '0x';
  for (let i = 0; i < 64; i++) {
    hash += chars[Math.floor(Math.random() * chars.length)];
  }
  return hash;
}

// Function to generate a fake wallet address
function generateFakeWalletAddress(chain: string | null): string | null {
    const chars = 'abcdef0123456789';
    let address = '0x';
    if (chain?.toLowerCase() === 'bitcoin') {
         // Simple fake Bitcoin address (doesn't follow real format rules)
         address = '1';
         for (let i = 0; i < 33; i++) address += chars[Math.floor(Math.random() * 16)];
         return address;
    } else if (chain?.toLowerCase() === 'solana') {
        // Simple fake Solana address
        address = 'SoL';
        for (let i = 0; i < 41; i++) address += chars[Math.floor(Math.random() * 16)];
        return address;
    }
    // Default EVM-like
    for (let i = 0; i < 40; i++) {
        address += chars[Math.floor(Math.random() * 16)];
    }
    return address;
}

async function main() {
  console.log(`Start seeding ...`);

  const transactionsToCreate: Prisma.TransactionCreateManyInput[] = [];

  for (const tx of allTransactions) {
    const { amount_value, asset_symbol } = parseAmount(tx.amount);
    const value_usd_parsed = parseDecimal(tx.value);
    let price_per_unit = parseDecimal(tx.price);

    // Recalculate price for DCA case #13 if value and amount are reliable
    if (tx.id === 13 && amount_value && value_usd_parsed && value_usd_parsed.abs().gt(0)) {
        price_per_unit = value_usd_parsed.abs().dividedBy(amount_value.abs());
    }
    // Make price null for non-numeric price descriptions (swaps etc)
    if (tx.price && tx.price.includes('=')) {
        price_per_unit = null;
    }

    // Determine correct sign for value_usd
    let final_value_usd = value_usd_parsed;
    if (final_value_usd) {
        const typeLower = tx.type.toLowerCase();
        if (['buy', 'send', 'stake', 'dca', 'nft purchase', 'bridge', 'liquidity providing'].includes(typeLower)) {
             // These usually represent costs or outflows, make negative if not already
             if (final_value_usd.isPositive()) {
                 final_value_usd = final_value_usd.negated();
             }
        } else if (['sell', 'receive', 'staking', 'nft sale'].includes(typeLower)) {
            // These usually represent proceeds or inflows, make positive if not already
             if (final_value_usd.isNegative()) {
                 final_value_usd = final_value_usd.negated();
             }
        }
        // Keep Transfers and Swaps as potentially reported (often value of asset out), or assume net zero if needed.
        // Keep Zero/Spam as reported (likely zero or near-zero)
    }


    if (!amount_value || !asset_symbol || !final_value_usd) {
        console.warn(`Skipping transaction ID ${tx.id} due to parsing errors (Amount: ${amount_value}, Symbol: ${asset_symbol}, Value: ${final_value_usd})`);
        continue; // Skip if essential data couldn't be parsed
    }

    const chain = determineChain(asset_symbol, tx.exchange);
    const sourceType = determineSourceType(tx.exchange);

    const data: Prisma.TransactionCreateManyInput = {
      type: tx.type,
      subtype: ['Uniswap', 'Lido', '1inch', 'Jupiter', 'QuickSwap', 'TraderJoe'].includes(tx.exchange ?? '') ? tx.exchange : null,
      status: tx.status === 'Completed' ? 'confirmed' : tx.status.toLowerCase(),
      source: tx.exchange,
      source_type: sourceType,
      asset_symbol: asset_symbol, // Parsed symbol
      asset_address: null, // Add fake data if needed: generateFakeEVMAddress(),
      asset_chain: chain,
      amount_value: amount_value, // Parsed amount
      price_per_unit: price_per_unit, // Parsed price
      value_usd: final_value_usd, // Parsed and sign-adjusted value
      wallet_address: generateFakeWalletAddress(chain), // Fake data
      counterparty_address: tx.type === 'Swap' ? generateFakeWalletAddress(chain) : null, // Fake data for swaps
      tx_hash: generateFakeTxHash(), // Fake data
      chain: chain,
      block_number: BigInt(Math.floor(Date.now() / 1000) - Math.floor(Math.random() * 1000000)), // Fake data
      explorer_url: null, // Can construct fake later if needed
      tx_timestamp: new Date(tx.date), // Parsed date
      identified: tx.id % 3 !== 0, // Simple fake identified status
      notes: tx.asset.includes('→') ? `Original asset description: ${tx.asset}` : null,
    };
    transactionsToCreate.push(data);
  }

  console.log(`Prepared ${transactionsToCreate.length} transactions for seeding.`);

  // Delete existing transactions before seeding (optional, good for testing)
  // await prisma.transaction.deleteMany({});
  // console.log('Deleted existing transactions.');

  if (transactionsToCreate.length > 0) {
    const result = await prisma.transaction.createMany({
      data: transactionsToCreate,
      skipDuplicates: true, // Useful if tx_hash could clash, though unlikely with fake ones
    });
    console.log(`Created ${result.count} new transactions.`);
  } else {
    console.log('No transactions were prepared for seeding.');
  }

  console.log(`Seeding finished.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  }); 