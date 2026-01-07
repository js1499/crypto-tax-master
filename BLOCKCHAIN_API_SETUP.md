# Blockchain API Setup Guide

This guide explains how to set up API keys for fetching transaction history from Solana and Ethereum blockchains.

## Required API Keys

### 1. Etherscan API Key (Ethereum)

1. Go to [Etherscan.io](https://etherscan.io) and create a free account
2. Navigate to [API Key Management](https://etherscan.io/myapikey)
3. Click "+ Add" to create a new API key
4. Copy your API key

**Rate Limits:**
- Free tier: 5 calls/second
- For production, consider upgrading to a paid plan

### 2. Solscan API Key (Solana)

**Option A: Public API (Limited)**
- The public API has strict rate limits
- No API key required, but very limited

**Option B: Pro API (Recommended for Production)**
1. Go to [Solscan.io](https://solscan.io)
2. Sign up for a Pro account
3. Get your API key from the dashboard

**Note:** The public API endpoint structure may vary. For production use, you'll likely need the Pro API.

## Environment Variables

Add these to your `.env.local` file:

```env
ETHERSCAN_API_KEY=your_etherscan_api_key_here
SOLSCAN_API_KEY=your_solscan_api_key_here  # Optional, only needed for Pro API
```

## Usage

### Fetch Transactions via API

```bash
POST /api/transactions/fetch
Content-Type: application/json

{
  "address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",  # Ethereum address
  "chain": "ethereum"  # or "solana"
}
```

### Response

```json
{
  "status": "success",
  "message": "Fetched 150 transactions",
  "transactionsAdded": 150,
  "transactionsSkipped": 0,
  "totalTransactions": 150
}
```

## Supported Chains

- **Ethereum**: Full support via Etherscan API
  - Native ETH transfers
  - ERC-20 token transfers
  - Internal transactions
  - Contract interactions

- **Solana**: Support via Solscan API
  - Native SOL transfers
  - SPL token transfers
  - Program interactions

## Rate Limiting

Both APIs have rate limits:

- **Etherscan Free Tier**: 5 calls/second
- **Solscan Public**: Very limited (consider Pro API)

The implementation includes:
- Automatic pagination for large transaction histories
- Rate limit handling with delays between requests
- Error handling and retry logic

## Transaction Types Detected

The system automatically categorizes transactions:

- **Receive**: Incoming transfers
- **Send**: Outgoing transfers
- **Swap**: Token swaps/exchanges
- **Fee**: Transaction fees
- **Stake**: Staking transactions
- **Reward**: Staking rewards

## Notes

1. **Historical Prices**: The current implementation uses placeholder prices. For accurate tax calculations, you should integrate a historical price API like CoinGecko or CoinMarketCap.

2. **Transaction Fees**: Fees are automatically included in cost basis calculations for purchases and deducted from proceeds for sales.

3. **Duplicate Prevention**: The system automatically skips transactions that already exist in the database (matched by transaction hash).

4. **User Authentication**: All API endpoints require user authentication via Coinbase OAuth.

## Troubleshooting

### "Failed to fetch Ethereum transactions"
- Check your Etherscan API key is correct
- Verify you haven't exceeded rate limits
- Ensure the address format is correct (0x...)

### "Failed to fetch Solana transactions"
- Solscan public API may be rate-limited
- Consider upgrading to Solscan Pro API
- Verify the Solana address format is correct

### "No transactions found"
- The wallet address may not have any transactions
- Check the address is correct for the specified chain
- Some new wallets may not have transaction history yet
