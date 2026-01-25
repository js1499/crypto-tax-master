import axios from "axios";
import { Decimal } from "@prisma/client/runtime/library";
import { refreshAccessToken, isTokenExpired, CoinbaseTokens } from "./coinbase";
import type { ExchangeTransaction } from "./exchange-clients";
import { encryptApiKey, decryptApiKey } from "./exchange-clients";
import prisma from "./prisma";
import crypto from "crypto";
import jwt from "jsonwebtoken";

// Encryption key for OAuth tokens
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString("hex");

/**
 * Generate a JWT for Coinbase CDP API authentication
 * As of Feb 2025, Coinbase requires JWT-based auth with ES256 for all API keys
 *
 * @param apiKeyName - The API key name (format: organizations/{org_id}/apiKeys/{key_id})
 * @param privateKey - The EC private key in PEM format
 * @param method - HTTP method (GET, POST, etc.)
 * @param host - API host (e.g., api.coinbase.com)
 * @param path - API path (e.g., /v2/accounts)
 */
function generateCoinbaseJWT(
  apiKeyName: string,
  privateKey: string,
  method: string,
  host: string,
  path: string
): string {
  const now = Math.floor(Date.now() / 1000);
  const nonce = crypto.randomBytes(16).toString("hex");

  // Construct the URI claim: "METHOD HOST/PATH"
  const uri = `${method} ${host}${path}`;

  const payload = {
    sub: apiKeyName,
    iss: "cdp",
    aud: ["cdp_service"],
    nbf: now,
    exp: now + 120, // JWT expires in 2 minutes
    uri: uri,
  };

  const options: jwt.SignOptions = {
    algorithm: "ES256",
    header: {
      alg: "ES256",
      typ: "JWT",
      kid: apiKeyName,
      nonce: nonce,
    },
  };

  return jwt.sign(payload, privateKey, options);
}

/**
 * Format the private key to ensure it's in proper PEM format
 * Coinbase CDP keys come in EC PRIVATE KEY format
 */
function formatPrivateKey(privateKey: string): string {
  // If it already has the PEM header, return as-is but ensure proper newlines
  if (privateKey.includes("-----BEGIN")) {
    // Normalize newlines and ensure proper format
    return privateKey
      .replace(/\\n/g, "\n")
      .replace(/\r\n/g, "\n")
      .trim();
  }

  // If it's raw base64, wrap it in PEM format
  const cleanKey = privateKey.replace(/\s+/g, "");
  return `-----BEGIN EC PRIVATE KEY-----\n${cleanKey}\n-----END EC PRIVATE KEY-----`;
}

/**
 * Create authorization headers for Coinbase CDP API
 * Uses JWT Bearer token authentication (required since Feb 2025)
 */
function createCoinbaseCDPHeaders(
  apiKeyName: string,
  privateKey: string,
  method: string,
  path: string
): Record<string, string> {
  const formattedKey = formatPrivateKey(privateKey);
  const token = generateCoinbaseJWT(apiKeyName, formattedKey, method, "api.coinbase.com", path);

  return {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

/**
 * Get transactions from Coinbase using CDP API Key authentication (JWT-based)
 * As of Feb 2025, this is the only supported authentication method
 *
 * @param encryptedApiKeyName - Encrypted API Key Name (format: organizations/{org_id}/apiKeys/{key_id})
 * @param encryptedPrivateKey - Encrypted EC Private Key in PEM format
 */
export async function getCoinbaseTransactionsWithApiKey(
  encryptedApiKeyName: string,
  encryptedPrivateKey: string,
  startTime?: number,
  endTime?: number,
  exchangeId?: string
): Promise<ExchangeTransaction[]> {
  try {
    // Decrypt the API credentials
    let apiKeyName: string;
    let privateKey: string;
    try {
      apiKeyName = decryptApiKey(encryptedApiKeyName, ENCRYPTION_KEY);
      privateKey = decryptApiKey(encryptedPrivateKey, ENCRYPTION_KEY);
    } catch (error) {
      console.error("[Coinbase Transactions] Failed to decrypt API credentials:", error);
      throw new Error("CREDENTIALS_DECRYPT_FAILED");
    }

    const transactions: ExchangeTransaction[] = [];
    const seenTransactionIds = new Set<string>(); // Track seen transaction IDs to prevent duplicates

    // Get ALL accounts with pagination (default limit is 25, we need all)
    let allAccounts: any[] = [];
    let accountsNextUri: string | null = "/v2/accounts";
    let accountPageCount = 0;
    const maxAccountPages = 20; // Safety limit (20 pages * 100 accounts = 2000 accounts max)

    while (accountsNextUri && accountPageCount < maxAccountPages) {
      accountPageCount++;

      const accountsPath = accountsNextUri.startsWith("http")
        ? new URL(accountsNextUri).pathname + new URL(accountsNextUri).search
        : accountsNextUri;

      const accountsHeaders = createCoinbaseCDPHeaders(apiKeyName, privateKey, "GET", accountsPath.split("?")[0]);

      const accountsResponse = await axios.get(
        accountsNextUri.startsWith("http") ? accountsNextUri : `https://api.coinbase.com${accountsPath}`,
        {
          headers: accountsHeaders,
          params: accountsNextUri.includes("?") ? undefined : { limit: 100 }
        }
      );

      const pageAccounts = accountsResponse.data.data || [];
      allAccounts = allAccounts.concat(pageAccounts);

      // Get next page of accounts
      accountsNextUri = accountsResponse.data.pagination?.next_uri || null;

      if (pageAccounts.length > 0) {
        console.log(`[Coinbase Transactions] Accounts page ${accountPageCount}: found ${pageAccounts.length} accounts (total: ${allAccounts.length})`);
      }
    }

    const accounts = allAccounts;
    console.log(`[Coinbase Transactions] Found ${accounts.length} total accounts`);

    // Get transactions for each account with pagination
    for (const account of accounts) {
      try {
        let allAccountTxs: any[] = [];
        let nextUri: string | null = `/v2/accounts/${account.id}/transactions`;
        let pageCount = 0;
        const maxPages = 100; // Safety limit to prevent infinite loops

        // Paginate through all transactions
        while (nextUri && pageCount < maxPages) {
          pageCount++;

          // Extract path from nextUri (could be full URL or just path)
          const txPath = nextUri.startsWith("http")
            ? new URL(nextUri).pathname + new URL(nextUri).search
            : nextUri;

          // Generate a new JWT for each request (they expire after 2 minutes)
          const txHeaders = createCoinbaseCDPHeaders(apiKeyName, privateKey, "GET", txPath.split("?")[0]);

          const txResponse = await axios.get(
            nextUri.startsWith("http") ? nextUri : `https://api.coinbase.com${txPath}`,
            {
              headers: txHeaders,
              params: nextUri.includes("?") ? undefined : { limit: 100, order: "asc" }
            }
          );

          const pageTxs = txResponse.data.data || [];
          allAccountTxs = allAccountTxs.concat(pageTxs);

          // Get next page URI from pagination info
          nextUri = txResponse.data.pagination?.next_uri || null;

          if (pageTxs.length > 0) {
            console.log(`[Coinbase Transactions] Page ${pageCount}: fetched ${pageTxs.length} transactions for ${account.name} (total: ${allAccountTxs.length})`);
          }
        }

        const accountTxs = allAccountTxs;
        console.log(`[Coinbase Transactions] Found ${accountTxs.length} total transactions for account ${account.name}`);

        for (const tx of accountTxs) {
          // Skip if we've already seen this transaction (prevents duplicates across accounts)
          // This can happen when the same transaction appears in multiple accounts
          // (e.g., a swap appears in both the source and destination asset accounts)
          if (seenTransactionIds.has(tx.id)) {
            continue;
          }
          seenTransactionIds.add(tx.id);

          // Filter by time if specified
          const txTime = new Date(tx.created_at).getTime();
          if (startTime && txTime < startTime) continue;
          if (endTime && txTime > endTime) continue;

          const amount = parseFloat(tx.amount?.amount || "0");
          const currency = tx.amount?.currency || "UNKNOWN";
          const nativeAmount = tx.native_amount
            ? parseFloat(tx.native_amount.amount)
            : 0;

          // Determine transaction type
          let type = "Transfer";
          if (tx.type === "buy") type = "Buy";
          else if (tx.type === "sell") type = "Sell";
          else if (tx.type === "send") type = "Send";
          else if (tx.type === "receive") type = "Receive";
          else if (tx.type === "exchange" || tx.type === "trade") type = "Swap";
          else if (tx.type === "fiat_deposit" || tx.type === "fiat_withdrawal") type = "Transfer";

          transactions.push({
            id: tx.id,
            type,
            asset_symbol: currency,
            amount_value: new Decimal(Math.abs(amount)),
            price_per_unit: nativeAmount && amount
              ? new Decimal(Math.abs(nativeAmount / amount))
              : null,
            value_usd: new Decimal(Math.abs(nativeAmount)),
            fee_usd: null,
            tx_timestamp: new Date(tx.created_at),
            source: "Coinbase",
            source_type: "exchange_api",
            tx_hash: tx.id,
            notes: tx.description || undefined,
          });
        }
      } catch (error) {
        console.error(
          `[Coinbase Transactions] Error fetching transactions for account ${account.id}:`,
          error
        );
        // Continue with other accounts
      }
    }

    console.log(`[Coinbase Transactions] Total unique transactions: ${transactions.length} (${seenTransactionIds.size} unique IDs, duplicates filtered)`);
    return transactions;
  } catch (error) {
    console.error("[Coinbase Transactions] Error:", error);

    // Mark exchange as disconnected if auth fails
    if (exchangeId && error instanceof Error &&
        (error.message.includes("401") || error.message.includes("authentication"))) {
      await prisma.exchange.update({
        where: { id: exchangeId },
        data: { isConnected: false },
      });
    }

    throw error;
  }
}

/**
 * Get transactions from Coinbase using OAuth tokens
 * @param encryptedRefreshToken - Encrypted refresh token from database
 * @param exchangeId - Exchange ID to update tokens after refresh
 * @param startTime - Optional start time filter
 * @param endTime - Optional end time filter
 */
export async function getCoinbaseTransactions(
  encryptedRefreshToken: string,
  startTime?: number,
  endTime?: number,
  exchangeId?: string
): Promise<ExchangeTransaction[]> {
  try {
    // Decrypt the refresh token
    let refreshToken: string;
    try {
      refreshToken = decryptApiKey(encryptedRefreshToken, ENCRYPTION_KEY);
    } catch (error) {
      console.error("[Coinbase Transactions] Failed to decrypt refresh token:", error);
      throw new Error("TOKEN_DECRYPT_FAILED");
    }

    // Refresh token to get new access token
    let tokens: CoinbaseTokens;
    try {
      tokens = await refreshAccessToken(refreshToken);

      // PRD Requirement: Persist refreshed tokens back to database
      if (exchangeId) {
        const encryptedNewRefreshToken = encryptApiKey(tokens.refresh_token, ENCRYPTION_KEY);
        const encryptedNewAccessToken = encryptApiKey(tokens.access_token, ENCRYPTION_KEY);

        await prisma.exchange.update({
          where: { id: exchangeId },
          data: {
            refreshToken: encryptedNewRefreshToken,
            accessToken: encryptedNewAccessToken,
            tokenExpiresAt: new Date(tokens.expires_at || Date.now() + tokens.expires_in * 1000),
            isConnected: true,
          },
        });
        console.log("[Coinbase Transactions] Persisted refreshed tokens to database");
      }
    } catch (error) {
      console.error("[Coinbase Transactions] Failed to refresh token:", error);

      // PRD Requirement: Mark connection as "Needs re-auth" if refresh fails
      if (exchangeId) {
        await prisma.exchange.update({
          where: { id: exchangeId },
          data: {
            isConnected: false,
          },
        });
        console.log("[Coinbase Transactions] Marked exchange as disconnected due to token refresh failure");
      }

      throw new Error("TOKEN_REFRESH_FAILED");
    }

    const transactions: ExchangeTransaction[] = [];
    const seenTransactionIds = new Set<string>(); // Track seen transaction IDs to prevent duplicates

    // Get ALL accounts with pagination (default limit is 25, we need all)
    let allAccounts: any[] = [];
    let accountsNextUri: string | null = "/v2/accounts";
    let accountPageCount = 0;
    const maxAccountPages = 20; // Safety limit

    while (accountsNextUri && accountPageCount < maxAccountPages) {
      accountPageCount++;

      const accountsPath = accountsNextUri.startsWith("http")
        ? accountsNextUri
        : `https://api.coinbase.com${accountsNextUri}`;

      const accountsResponse = await axios.get(accountsPath, {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
        },
        params: accountsNextUri.includes("?") ? undefined : { limit: 100 }
      });

      const pageAccounts = accountsResponse.data.data || [];
      allAccounts = allAccounts.concat(pageAccounts);

      // Get next page of accounts
      accountsNextUri = accountsResponse.data.pagination?.next_uri || null;

      if (pageAccounts.length > 0) {
        console.log(`[Coinbase Transactions] Accounts page ${accountPageCount}: found ${pageAccounts.length} accounts (total: ${allAccounts.length})`);
      }
    }

    const accounts = allAccounts;
    console.log(`[Coinbase Transactions] Found ${accounts.length} total accounts`);

    // Get transactions for each account with pagination
    for (const account of accounts) {
      try {
        let allAccountTxs: any[] = [];
        let nextUri: string | null = `/v2/accounts/${account.id}/transactions`;
        let pageCount = 0;
        const maxPages = 100; // Safety limit to prevent infinite loops

        // Paginate through all transactions
        while (nextUri && pageCount < maxPages) {
          pageCount++;

          // Extract path from nextUri (could be full URL or just path)
          const txPath = nextUri.startsWith("http")
            ? new URL(nextUri).pathname + new URL(nextUri).search
            : nextUri;

          const params: any = nextUri.includes("?") ? undefined : { limit: 100, order: "asc" };
          // Only apply time filters on first request (pagination handles the rest)
          if (pageCount === 1 && params) {
            if (startTime) {
              params.starting_after = new Date(startTime).toISOString();
            }
            if (endTime) {
              params.ending_before = new Date(endTime).toISOString();
            }
          }

          const txResponse = await axios.get(
            nextUri.startsWith("http") ? nextUri : `https://api.coinbase.com${txPath}`,
            {
              headers: {
                Authorization: `Bearer ${tokens.access_token}`,
              },
              params,
            }
          );

          const pageTxs = txResponse.data.data || [];
          allAccountTxs = allAccountTxs.concat(pageTxs);

          // Get next page URI from pagination info
          nextUri = txResponse.data.pagination?.next_uri || null;

          if (pageTxs.length > 0) {
            console.log(`[Coinbase Transactions] Page ${pageCount}: fetched ${pageTxs.length} transactions for ${account.name} (total: ${allAccountTxs.length})`);
          }
        }

        const accountTxs = allAccountTxs;
        console.log(`[Coinbase Transactions] Found ${accountTxs.length} total transactions for account ${account.name}`);

        for (const tx of accountTxs) {
          // Skip if we've already seen this transaction (prevents duplicates across accounts)
          if (seenTransactionIds.has(tx.id)) {
            continue;
          }
          seenTransactionIds.add(tx.id);

          const amount = parseFloat(tx.amount.amount);
          const currency = tx.amount.currency;
          const nativeAmount = tx.native_amount
            ? parseFloat(tx.native_amount.amount)
            : 0;

          // Determine transaction type
          let type = "Transfer";
          if (tx.type === "buy") type = "Buy";
          else if (tx.type === "sell") type = "Sell";
          else if (tx.type === "send") type = "Send";
          else if (tx.type === "receive") type = "Receive";
          else if (tx.type === "exchange") type = "Swap";

          transactions.push({
            id: tx.id,
            type,
            asset_symbol: currency,
            amount_value: new Decimal(Math.abs(amount)),
            price_per_unit: nativeAmount && amount
              ? new Decimal(Math.abs(nativeAmount / amount))
              : null,
            value_usd: new Decimal(Math.abs(nativeAmount)),
            fee_usd: null, // Coinbase API doesn't always provide fees in this endpoint
            tx_timestamp: new Date(tx.created_at),
            source: "Coinbase",
            source_type: "exchange_api",
            tx_hash: tx.id,
            notes: tx.description || undefined,
          });
        }
      } catch (error) {
        console.error(
          `[Coinbase Transactions] Error fetching transactions for account ${account.id}:`,
          error
        );
        // Continue with other accounts
      }
    }

    console.log(`[Coinbase Transactions] Total unique transactions: ${transactions.length} (${seenTransactionIds.size} unique IDs)`);
    return transactions;
  } catch (error) {
    console.error("[Coinbase Transactions] Error:", error);
    throw error;
  }
}
