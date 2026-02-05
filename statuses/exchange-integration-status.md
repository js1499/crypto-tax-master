# Exchange Integration Analysis - Complete Results

**Analysis Date:** February 5, 2026
**Analysis Method:** 6 parallel agents analyzing each exchange integration in depth

---

## Executive Summary

| Exchange | Status | Usability | Critical Issues |
|----------|--------|-----------|-----------------|
| **Coinbase** | 65% Complete | **BEST** - Functional but fragile | Tokens unencrypted, no pagination (100 limit), no fee data |
| **KuCoin** | 70% Complete | Partial | No pagination (200 limit), no deposits/withdrawals |
| **Kraken** | 45-50% Complete | **BROKEN** | Wrong USD calculations (fees/costs in quote currency), only trades |
| **Binance** | 30% Complete | **BROKEN** | No trade fetching - only deposits/withdrawals |
| **Gemini** | 10% Complete | **BROKEN** | Missing nonce, wrong payload encoding, untested template |

---

## Global Issue Affecting ALL Exchanges

### ENCRYPTION_KEY Bug (CRITICAL)

**Location:** `/src/lib/exchange-clients.ts` and `/src/app/api/exchanges/connect/route.ts`

```typescript
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString("hex");
```

**Problem:** If `ENCRYPTION_KEY` environment variable is not set, a random key is generated on EVERY request. This means credentials encrypted in one request cannot be decrypted in another.

**Impact:** ALL exchange connections will break across serverless function invocations.

**Fix Required:** Make `ENCRYPTION_KEY` a required environment variable and throw an error if not set.

---

## Detailed Analysis by Exchange

---

## 1. Coinbase (OAuth) - BEST INTEGRATION

**Status: 65% Complete - Functional but Fragile**

### What Works

- OAuth 2.0 flow with proper CSRF state token protection
- Token exchange with Coinbase authorization server
- Account enumeration via `/v2/accounts`
- Transaction fetching via `/v2/accounts/{id}/transactions`
- Transaction type mapping:
  - `buy` → `Buy`
  - `sell` → `Sell`
  - `send` → `Send`
  - `receive` → `Receive`
  - `exchange` → `Swap`
- Proper scopes requested: `wallet:accounts:read`, `wallet:transactions:read`, `wallet:user:read`, `offline_access`
- Error handling continues with other accounts if one fails

### Critical Issues

| Issue | Severity | Impact | Location |
|-------|----------|--------|----------|
| Tokens stored in PLAINTEXT | CRITICAL | Security vulnerability - DB compromise exposes live OAuth tokens | `/src/app/api/auth/coinbase/callback/route.ts` |
| Token refresh not persisted | HIGH | Refreshed tokens not saved back to database, will degrade over time | `/src/lib/coinbase-transactions.ts` |
| No pagination | HIGH | Only fetches first 100 transactions per account | `/src/lib/coinbase-transactions.ts:49` |
| Fee data always null | HIGH | `fee_usd: null` - inaccurate tax calculations | `/src/lib/coinbase-transactions.ts:85` |
| Dead endpoint | MEDIUM | `/api/coinbase/accounts` reads from non-existent `coinbase_tokens` cookie | `/src/app/api/coinbase/accounts/route.ts` |
| Race condition on token refresh | MEDIUM | Multiple simultaneous syncs could corrupt tokens | Multiple files |

### Code Issues

**Token Not Encrypted (unlike other exchanges):**
```typescript
// In callback/route.ts - tokens stored in PLAINTEXT
await prisma.exchange.upsert({
  update: {
    refreshToken: tokens.refresh_token,  // NOT ENCRYPTED!
    accessToken: tokens.access_token,    // NOT ENCRYPTED!
  }
});

// Compare to other exchanges which use:
apiKey: encryptApiKey(apiKey, ENCRYPTION_KEY)
```

**No Pagination:**
```typescript
// Only fetches first 100 transactions per account
const params: any = { limit: 100 };
// No cursor/pagination tracking to get more
```

### Recommendations

1. **Immediate:** Encrypt Coinbase tokens using same `encryptApiKey()` function
2. **Immediate:** Add token update to sync endpoint after refresh
3. **High:** Implement pagination loop using cursor
4. **High:** Fetch fee data from transaction details endpoint
5. **Medium:** Add re-authorization flow for broken tokens

---

## 2. KuCoin (API Key + Secret + Passphrase) - PARTIAL

**Status: 70% Complete - Not Production Ready**

### What Works

- 3-factor authentication (API key + secret + passphrase)
- Correct HMAC-SHA256 signature generation
- Proper headers: `KC-API-KEY`, `KC-API-SIGN`, `KC-API-TIMESTAMP`, `KC-API-PASSPHRASE`, `KC-API-KEY-VERSION: 2`
- Basic fill/trade fetching via `/api/v1/fills`
- Buy/Sell type detection from `trade.side`
- Credential encryption with AES-256-GCM

### Critical Issues

| Issue | Severity | Impact | Location |
|-------|----------|--------|----------|
| No pagination | CRITICAL | Only fetches first 200 fills - users with more trades lose data | `/src/lib/exchange-clients.ts:313` |
| No connection test | HIGH | Invalid credentials accepted without validation | `/src/app/api/exchanges/connect/route.ts:101-109` |
| No deposit/withdrawal endpoints | HIGH | Missing `/api/v1/deposits` and `/api/v1/withdrawals` - critical tax data missing | Missing implementation |
| Assumes USD values | HIGH | `trade.funds` treated as USD but is quote currency - wrong for BTC-KCS, ETH-BNB pairs | `/src/lib/exchange-clients.ts:330` |
| No response code validation | MEDIUM | KuCoin returns `code: "200000"` for success - not checked | `/src/lib/exchange-clients.ts:319` |
| Silent failures | MEDIUM | Errors return empty array with no user feedback | `/src/lib/exchange-clients.ts:337-340` |

### Code Issues

**No Pagination:**
```typescript
// Only fetches first page of 200 results
const params: Record<string, string> = {
  pageSize: "200",  // Hardcoded, no loop for additional pages
};
// KuCoin response includes totalNum but it's never checked
```

**No Connection Validation:**
```typescript
case "kucoin":
  // KuCoin validation would go here
  break;  // EMPTY - no actual validation!
```

**Wrong USD Assumption:**
```typescript
// Assumes trade.funds is USD, but it's the quote currency
value_usd: new Decimal(Math.abs(parseFloat(trade.funds)))
// For BTC-KCS pair, this is KCS value, not USD!
```

### Recommendations

1. **Critical:** Implement pagination loop to fetch all fills
2. **High:** Add connection test with API call before storing credentials
3. **High:** Implement `/api/v1/deposits` and `/api/v1/withdrawals` endpoints
4. **High:** Convert quote currency to USD using exchange rates
5. **Medium:** Validate `response.code === "200000"` before processing

---

## 3. Kraken (API Key + Secret) - BROKEN

**Status: 45-50% Complete - NOT SAFE FOR TAX CALCULATIONS**

### What Works

- Correct HMAC-SHA512 signature generation
- Proper nonce generation from timestamp
- Trade history fetching via `/0/private/TradesHistory`
- Date range filtering with `start` and `end` parameters
- Buy/Sell type detection from `trade.type`

### Critical Issues

| Issue | Severity | Impact | Location |
|-------|----------|--------|----------|
| Only fetches trades | CRITICAL | NO deposits, withdrawals, staking rewards - missing `/0/private/Ledger` endpoint | Missing implementation |
| Fees in wrong currency | CRITICAL | `fee_usd: trade.fee` but fee is in quote currency (EUR for BTC/EUR) | `/src/lib/exchange-clients.ts:240` |
| Cost basis wrong | CRITICAL | `trade.cost` is quote currency, not USD | `/src/lib/exchange-clients.ts:239` |
| No credential validation | HIGH | Accepts any API key without testing | `/src/app/api/exchanges/connect/route.ts:97-100` |
| No pagination | HIGH | Only first ~50 trades fetched, no `ofs` parameter handling | `/src/lib/exchange-clients.ts` |
| No error response handling | HIGH | Kraken returns errors in `response.error` array - not checked | `/src/lib/exchange-clients.ts:228` |

### Code Issues

**Fee Currency Bug (CRITICAL FOR TAX):**
```typescript
// WRONG - fee is in quote currency, not USD
fee_usd: trade.fee ? new Decimal(trade.fee) : null,

// Example: BTC/EUR trade with 0.50 fee
// Code stores: fee_usd = 0.50 (but this is EUR, not USD!)
// Should be: fee_usd = 0.50 * EUR_TO_USD_RATE
```

**Cost Basis Bug (CRITICAL FOR TAX):**
```typescript
// WRONG - cost is in quote currency, not USD
value_usd: new Decimal(Math.abs(parseFloat(trade.cost))),

// Example: Bought 0.1 BTC for 4000 EUR
// Code stores: value_usd = 4000 (but this is EUR!)
// Should be: value_usd = 4000 * EUR_TO_USD_RATE
```

**No Credential Validation:**
```typescript
case "kraken":
  // Kraken doesn't have a simple test endpoint, skip validation for now
  // In production, you might want to make a minimal API call
  break;  // EMPTY!
```

**No Error Checking:**
```typescript
// Kraken error response: {"error":["EAPI:Invalid key"], "result":null}
// Code only checks response.result, ignores response.error
if (response.result && response.result.trades) {
  // Process trades
}
// Should check: if (response.error && response.error.length > 0) throw
```

### Missing Endpoints

| Endpoint | Purpose | Status |
|----------|---------|--------|
| `/0/private/TradesHistory` | Spot trades | Implemented (with bugs) |
| `/0/private/Ledger` | All transactions including deposits, withdrawals, staking | NOT IMPLEMENTED |
| `/0/private/DepositStatus` | Deposit history | NOT IMPLEMENTED |
| `/0/private/WithdrawStatus` | Withdrawal history | NOT IMPLEMENTED |

### Recommendations

1. **Critical:** Fix fee calculation: `fee_usd = trade.fee * trade.price` (converts to USD)
2. **Critical:** Fix cost calculation: Convert quote currency to USD
3. **Critical:** Implement `/0/private/Ledger` for complete transaction history
4. **High:** Add error response checking for `response.error` array
5. **High:** Implement pagination with `ofs` parameter
6. **High:** Add credential validation on connect

---

## 4. Binance (API Key + Secret) - BROKEN

**Status: 30% Complete - CANNOT BE USED FOR TAX CALCULATIONS**

### What Works

- Correct HMAC-SHA256 signature generation
- Proper timestamp-based request validation
- Deposit history fetching via `/sapi/v1/capital/deposit/hisrec`
- Withdrawal history fetching via `/sapi/v1/capital/withdraw/history`
- Credential encryption with AES-256-GCM
- Connection test with `getAccountInfo()`

### Critical Issues

| Issue | Severity | Impact | Location |
|-------|----------|--------|----------|
| **No trade fetching** | CRITICAL | `getAllTrades()` only gets deposits/withdrawals, NOT buy/sell orders | `/src/lib/exchange-clients.ts:103-165` |
| No symbol discovery | CRITICAL | `getTrades(symbol)` requires symbol but no way to get user's trading symbols | `/src/lib/exchange-clients.ts:82-101` |
| USD values always $0 | HIGH | Deposits/withdrawals imported with `value_usd: new Decimal(0)` | `/src/lib/exchange-clients.ts:131,147` |
| No pagination | HIGH | Limited to 1000 deposits/withdrawals max | `/src/lib/exchange-clients.ts:90` |

### The Core Problem

The method `getAllTrades()` is **misnamed** - it does NOT fetch trades:

```typescript
async getAllTrades(startTime?: number, endTime?: number): Promise<ExchangeTransaction[]> {
  const transactions: ExchangeTransaction[] = [];

  // Fetches deposits - WORKS
  const deposits = await this.getDeposits(startTime, endTime);

  // Fetches withdrawals - WORKS
  const withdrawals = await this.getWithdrawals(startTime, endTime);

  // NO TRADES FETCHED!
  // getTrades() exists but requires a symbol parameter
  // There's no code to discover which symbols the user has traded
  // So actual buy/sell trades are NEVER imported

  return [...deposits, ...withdrawals];
}
```

**Why getTrades() Can't Be Called:**
```typescript
async getTrades(symbol?: string, ...): Promise<ExchangeTransaction[]> {
  if (!symbol) {
    return [];  // Returns empty if no symbol provided!
  }
  // Binance API requires symbol for /api/v3/myTrades
}
```

**Missing Symbol Discovery:**
- Should call `/api/v3/account` to get all assets with balance
- Then iterate through each asset's trading pairs
- Call `getTrades()` for each pair
- This logic is completely missing

### USD Value Bug

```typescript
// Deposits and withdrawals stored with $0 USD value
{
  value_usd: new Decimal(0),  // ALWAYS ZERO!
  // Should fetch historical price and calculate actual USD value
}
```

### Recommendations

1. **Critical:** Implement symbol discovery from account info
2. **Critical:** Loop through all trading pairs and fetch trades for each
3. **High:** Calculate USD values for deposits/withdrawals using price API
4. **High:** Implement pagination for histories > 1000 records
5. **Medium:** Rename `getAllTrades()` to `getDepositsAndWithdrawals()` for clarity

---

## 5. Gemini (API Key + Secret) - FUNDAMENTALLY BROKEN

**Status: 10% Complete - Untested Template**

### What Works

- Basic class structure exists
- Encryption framework in place
- Correct HMAC-SHA384 algorithm selected

### Critical Issues

| Issue | Severity | Impact | Location |
|-------|----------|--------|----------|
| **Missing nonce parameter** | CRITICAL | Gemini requires nonce - requests will be rejected | `/src/lib/exchange-clients.ts:369-386` |
| **Payload not BASE64 encoded** | CRITICAL | Gemini requires BASE64 payload - requests will fail | `/src/lib/exchange-clients.ts:373` |
| No credential validation | HIGH | Invalid credentials not caught until sync | `/src/app/api/exchanges/connect/route.ts:110-112` |
| Symbol parsing broken | HIGH | `split("USD")` fails for non-USD pairs (BTCEUR, ETHBTC) | `/src/lib/exchange-clients.ts:401` |
| endTime parameter ignored | MEDIUM | Parameter accepted but never used in API call | `/src/lib/exchange-clients.ts:393` |
| No deposits/withdrawals | MEDIUM | Only trades endpoint implemented | Missing implementation |
| Silent error handling | MEDIUM | All errors return empty array | `/src/lib/exchange-clients.ts:421-424` |

### Authentication Bugs

**Missing Nonce (CRITICAL):**
```typescript
// Gemini API REQUIRES a nonce for replay attack prevention
// Current implementation has NO nonce:
private generateSignature(payload: string, secret: string): string {
  return crypto.createHmac("sha384", secret)
    .update(payload)  // payload should include nonce!
    .digest("hex");
}

// Should include nonce in payload:
const payload = {
  request: endpoint,
  nonce: Date.now(),  // MISSING!
  ...params
};
```

**Wrong Payload Encoding (CRITICAL):**
```typescript
// Current code sends raw JSON:
headers: {
  "X-GEMINI-PAYLOAD": JSON.stringify(payload),  // WRONG!
}

// Gemini requires BASE64-encoded payload:
headers: {
  "X-GEMINI-PAYLOAD": Buffer.from(JSON.stringify(payload)).toString("base64"),
}
```

### Symbol Parsing Bug

```typescript
// Only works for USD pairs
const [base, quote] = trade.symbol.split("USD");

// Examples:
// "BTCUSD" → ["BTC", ""] - base correct, quote empty
// "ETHUSD" → ["ETH", "USD"] - works by accident (splits before USD)
// "BTCEUR" → ["BTCEUR"] - FAILS! No USD to split on
// "ETHBTC" → ["ETHBTC"] - FAILS! No USD to split on
```

### Recommendations

1. **Critical:** Add nonce parameter to payload
2. **Critical:** BASE64 encode payload before transmission
3. **Critical:** Test against actual Gemini API (appears untested)
4. **High:** Fix symbol parsing to handle all trading pairs
5. **High:** Implement credential validation
6. **Medium:** Add deposits/withdrawals endpoints
7. **Medium:** Implement proper error handling

---

## Quick Reference: What Each Exchange Can Actually Import

| Data Type | Coinbase | Binance | Kraken | KuCoin | Gemini |
|-----------|----------|---------|--------|--------|--------|
| Trades (Buy/Sell) | ✅ (100 max) | ❌ BROKEN | ✅ (50 max, wrong USD) | ✅ (200 max) | ❌ BROKEN |
| Deposits | ✅ | ✅ ($0 USD) | ❌ | ❌ | ❌ |
| Withdrawals | ✅ | ✅ ($0 USD) | ❌ | ❌ | ❌ |
| Swaps | ✅ | ❌ | ❌ | ❌ | ❌ |
| Staking Rewards | ❌ | ❌ | ❌ | ❌ | ❌ |
| Fees | ❌ (null) | ✅ withdrawals | ❌ (wrong currency) | ✅ | ❌ |
| Correct USD Values | ✅ | ❌ ($0) | ❌ (wrong) | ⚠️ (USDT only) | ❌ |
| Pagination | ❌ (100 limit) | ❌ (1000 limit) | ❌ (50 limit) | ❌ (200 limit) | ❌ (500 limit) |

---

## Priority Fix List

### Must Fix Before Production (Blockers)

| Priority | Issue | Exchanges Affected |
|----------|-------|-------------------|
| 1 | Set ENCRYPTION_KEY as required env var | ALL |
| 2 | Implement actual trade fetching with symbol discovery | Binance |
| 3 | Add nonce and BASE64 encode payload | Gemini |
| 4 | Fix USD calculations (fees/costs from quote currency) | Kraken |
| 5 | Encrypt OAuth tokens | Coinbase |
| 6 | Add pagination to fetch complete history | ALL |

### High Priority

| Priority | Issue | Exchanges Affected |
|----------|-------|-------------------|
| 7 | Persist refreshed tokens to database | Coinbase |
| 8 | Add deposit/withdrawal endpoints | KuCoin, Kraken |
| 9 | Add credential validation on connect | Kraken, KuCoin, Gemini |
| 10 | Calculate USD values for deposits/withdrawals | Binance |
| 11 | Implement proper error handling with user feedback | ALL |

### Medium Priority

| Priority | Issue | Exchanges Affected |
|----------|-------|-------------------|
| 12 | Add retry logic with exponential backoff | ALL |
| 13 | Implement rate limit handling | ALL |
| 14 | Add staking rewards endpoints | ALL |
| 15 | Fix symbol parsing for non-USD pairs | Gemini, Kraken |

---

## File Locations Reference

| Component | File Path |
|-----------|-----------|
| Exchange Clients | `/src/lib/exchange-clients.ts` |
| Coinbase Transactions | `/src/lib/coinbase-transactions.ts` |
| Coinbase OAuth | `/src/lib/coinbase.ts` |
| Coinbase Callback | `/src/app/api/auth/coinbase/callback/route.ts` |
| Exchange Connect | `/src/app/api/exchanges/connect/route.ts` |
| Exchange Sync | `/src/app/api/exchanges/sync/route.ts` |
| Rate Limiting | `/src/lib/rate-limit.ts` |
| Database Schema | `/prisma/schema.prisma` |

---

## Conclusion

**Only Coinbase is functional enough for basic use**, and even it has security issues (unencrypted tokens) and data limitations (100 transaction limit, no fees).

**Binance and Gemini are fundamentally broken** and cannot import the data they claim to support.

**Kraken and KuCoin partially work** but have critical bugs that produce incorrect USD values for tax calculations.

**All exchanges lack pagination**, meaning users with significant trading history will have incomplete data.

**Recommendation:** Do not use any exchange integration for production tax calculations until the critical issues are resolved.

---

*Generated by automated codebase analysis - February 5, 2026*
