# Exchange Integrations Implementation

## Overview

This implementation adds automatic transaction syncing from centralized exchanges (Binance, Kraken, KuCoin, Gemini, Coinbase) via their APIs. Users can connect their exchange accounts and automatically import all transactions without manual CSV downloads.

## What Was Implemented

### 1. Exchange API Clients

**File**: `src/lib/exchange-clients.ts`

**Supported Exchanges**:
- **Binance** - API key + secret
- **Kraken** - API key + secret
- **KuCoin** - API key + secret + passphrase
- **Gemini** - API key + secret
- **Coinbase** - OAuth (already existed, enhanced)

**Features**:
- Secure API credential storage (encrypted)
- Transaction fetching with date range support
- Automatic transaction type detection (Buy, Sell, Swap, Send, Receive)
- Fee tracking
- Deposit/withdrawal history

### 2. API Endpoints

#### `POST /api/exchanges/connect`
Connect an exchange by storing encrypted API credentials.

**Request Body**:
```json
{
  "exchange": "binance",
  "apiKey": "your-api-key",
  "apiSecret": "your-api-secret",
  "apiPassphrase": "your-passphrase" // Only for KuCoin
}
```

**Response**:
```json
{
  "status": "success",
  "message": "Successfully connected to binance",
  "exchange": {
    "id": "...",
    "name": "binance",
    "isConnected": true,
    "lastSyncAt": null
  }
}
```

#### `POST /api/exchanges/sync`
Sync transactions from connected exchanges.

**Request Body**:
```json
{
  "exchangeId": "optional-exchange-id", // If omitted, syncs all
  "startTime": 1234567890000, // Optional: Unix timestamp in ms
  "endTime": 1234567890000    // Optional: Unix timestamp in ms
}
```

**Response**:
```json
{
  "status": "success",
  "message": "Synced 2 exchange(s)",
  "transactionsAdded": 150,
  "transactionsSkipped": 10,
  "errors": []
}
```

#### `GET /api/exchanges`
Get all connected exchanges for the current user.

#### `DELETE /api/exchanges?exchangeId=...`
Disconnect an exchange (removes credentials).

### 3. Database Schema Updates

**File**: `prisma/schema.prisma`

**Enhanced Exchange Model**:
```prisma
model Exchange {
  id            String   @id @default(cuid())
  name          String
  apiKey        String?  // Encrypted
  apiSecret     String?  // Encrypted
  apiPassphrase String?  // Encrypted (KuCoin)
  refreshToken  String?  // OAuth (Coinbase)
  accessToken   String?  // OAuth (temporary)
  tokenExpiresAt DateTime?
  isConnected   Boolean  @default(false)
  lastSyncAt    DateTime?
  userId        String
  // ...
}
```

### 4. UI Components

#### Accounts Page (`src/app/accounts/page.tsx`)
- Shows connected exchanges alongside wallets
- Displays connection status and last sync time
- "Sync" button for individual exchanges
- "Sync All Exchanges" button
- "Disconnect" button for exchanges

#### Wallet Connect Dialog (`src/components/wallet-connect-dialog.tsx`)
- Enhanced to support API key connections
- Shows API key/secret input fields for exchanges
- Special handling for KuCoin (requires passphrase)
- OAuth flow for Coinbase

### 5. Security Features

- **Encrypted Storage**: API keys are encrypted before storing in database
- **Rate Limiting**: API endpoints are rate limited
- **User Verification**: All operations verify user ownership
- **Credential Validation**: Tests API credentials before storing

## How It Works

### Connection Flow

1. **User clicks "Connect Binance"**:
   ```
   User → Wallet Connect Dialog → Enters API Key/Secret
   → POST /api/exchanges/connect
   → Validates credentials
   → Encrypts and stores
   → Returns success
   ```

2. **User clicks "Sync"**:
   ```
   User → Clicks Sync button
   → POST /api/exchanges/sync
   → Decrypts credentials
   → Calls exchange API
   → Fetches transactions
   → Stores in database
   → Updates lastSyncAt
   ```

### Coinbase OAuth Flow

1. User clicks "Connect Coinbase"
2. Redirects to Coinbase OAuth
3. User authorizes
4. Callback stores refresh token
5. Exchange connection created automatically

### Transaction Syncing

For each exchange:
1. Decrypt API credentials
2. Initialize exchange client
3. Fetch transactions (with date range if provided)
4. Check for duplicates
5. Store new transactions
6. Update `lastSyncAt` timestamp

## Supported Exchanges

### Binance
- **Connection**: API Key + Secret
- **Endpoints Used**:
  - `/api/v3/account` - Account info
  - `/api/v3/myTrades` - Trading history
  - `/sapi/v1/capital/deposit/hisrec` - Deposits
  - `/sapi/v1/capital/withdraw/history` - Withdrawals
- **Transaction Types**: Buy, Sell, Receive (deposits), Send (withdrawals)

### Kraken
- **Connection**: API Key + Secret
- **Endpoints Used**:
  - `/0/private/TradesHistory` - Trading history
- **Transaction Types**: Buy, Sell

### KuCoin
- **Connection**: API Key + Secret + Passphrase
- **Endpoints Used**:
  - `/api/v1/fills` - Trading history
- **Transaction Types**: Buy, Sell

### Gemini
- **Connection**: API Key + Secret
- **Endpoints Used**:
  - `/v1/mytrades` - Trading history
- **Transaction Types**: Buy, Sell

### Coinbase
- **Connection**: OAuth (refresh token)
- **Endpoints Used**:
  - `/v2/accounts` - Get accounts
  - `/v2/accounts/{id}/transactions` - Get transactions
- **Transaction Types**: Buy, Sell, Send, Receive, Swap

## API Key Setup Instructions

### Binance
1. Go to Binance → API Management
2. Create API Key
3. Enable "Enable Reading" permission
4. Copy API Key and Secret Key
5. **Important**: Only enable read permissions for security

### Kraken
1. Go to Kraken → Settings → API
2. Create API Key
3. Enable "Query Funds" and "Query Open Orders & Trades" permissions
4. Copy API Key and Private Key

### KuCoin
1. Go to KuCoin → API Management
2. Create API Key
3. Set permissions to "General" (read-only)
4. Copy API Key, Secret Key, and Passphrase

### Gemini
1. Go to Gemini → Settings → API
2. Create API Key
3. Enable "Auditor" permission (read-only)
4. Copy API Key and Secret

## Usage Examples

### Connect Exchange
```typescript
// User enters credentials in UI
// Calls: POST /api/exchanges/connect
{
  exchange: "binance",
  apiKey: "abc123",
  apiSecret: "secret456"
}
```

### Sync Transactions
```typescript
// User clicks "Sync" button
// Calls: POST /api/exchanges/sync
{
  exchangeId: "exchange-id", // Optional
  startTime: 1609459200000, // Optional: Jan 1, 2021
  endTime: 1640995200000    // Optional: Jan 1, 2022
}
```

### View Connected Exchanges
```typescript
// Automatically fetched on accounts page
// Calls: GET /api/exchanges
// Returns list of connected exchanges
```

## Error Handling

- **Invalid Credentials**: Returns 400 with error message
- **API Rate Limits**: Handled gracefully with retries
- **Network Errors**: Logged and reported to user
- **Duplicate Transactions**: Automatically skipped

## Security Considerations

### Current Implementation
- API keys encrypted using XOR (simple, not production-ready)
- Credentials stored in database (encrypted)
- Rate limiting on all endpoints
- User verification on all operations

### Production Recommendations
1. **Use Proper Encryption**: Replace XOR with AES-256-GCM
2. **Key Management**: Use AWS KMS, HashiCorp Vault, or similar
3. **Environment Variables**: Store encryption key in secure env var
4. **API Key Permissions**: Only request read-only permissions
5. **IP Whitelisting**: Encourage users to whitelist your server IP
6. **Token Rotation**: Implement automatic token refresh for OAuth

## Limitations

1. **Binance Trades**: Requires symbol, so we fetch deposits/withdrawals and attempt trades for common pairs
2. **Rate Limits**: Each exchange has different rate limits
3. **Historical Data**: Some exchanges limit how far back you can fetch
4. **Encryption**: Current XOR encryption is not production-ready

## Future Enhancements

1. **More Exchanges**: Add support for more exchanges (FTX, Bybit, etc.)
2. **Automatic Sync**: Background jobs to sync periodically
3. **Webhook Support**: Real-time transaction updates
4. **Better Error Messages**: More specific error handling
5. **Transaction Categorization**: Auto-categorize transaction types
6. **Price Updates**: Automatically fetch and update USD values

## Testing

### Test Connection
1. Create test API keys on exchange (read-only)
2. Connect via UI
3. Verify connection status shows "Connected"

### Test Sync
1. Connect exchange
2. Click "Sync" button
3. Verify transactions appear in transactions page
4. Check for duplicates (should be skipped)

### Test Disconnect
1. Click "Disconnect" on exchange
2. Verify exchange shows "Disconnected"
3. Verify credentials are removed

## Migration Required

After updating the schema, run:
```bash
npx prisma migrate dev --name add_exchange_fields
npx prisma generate
```

## Environment Variables

Add to `.env`:
```
ENCRYPTION_KEY=your-32-byte-hex-encryption-key
```

Generate a key:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## User Experience

1. **Connect Exchange**:
   - User goes to Accounts page
   - Clicks "Add Account"
   - Selects "Exchanges" tab
   - Clicks exchange (e.g., "Binance")
   - Enters API credentials
   - Clicks "Connect"
   - Exchange appears in list

2. **Sync Transactions**:
   - User sees connected exchange
   - Clicks "Sync" button
   - Transactions are fetched and imported
   - Toast notification shows success
   - Transactions appear in Transactions page

3. **Disconnect Exchange**:
   - User clicks "Disconnect" on exchange
   - Confirms action
   - Exchange is disconnected
   - Credentials are removed

## API Rate Limits

- **Connect**: 20 requests/minute (IP), 10 requests/minute (user)
- **Sync**: 10 requests/minute (IP), 5 requests/minute (user)
- **List**: 100 requests/minute (IP)

## Notes

- API keys are encrypted before storage
- Only read permissions are requested
- Duplicate transactions are automatically skipped
- Last sync time is tracked for each exchange
- Coinbase uses OAuth (no API keys needed)
