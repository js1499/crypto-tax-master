import axios from "axios";
import { Decimal } from "@prisma/client/runtime/library";
import { refreshAccessToken, isTokenExpired, CoinbaseTokens } from "./coinbase";
import type { ExchangeTransaction } from "./exchange-clients";
import { encryptApiKey, decryptApiKey } from "./exchange-clients";
import prisma from "./prisma";
import crypto from "crypto";

// Encryption key for OAuth tokens
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString("hex");

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

    // Get accounts first
    const accountsResponse = await axios.get(
      "https://api.coinbase.com/v2/accounts",
      {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
        },
      }
    );

    const accounts = accountsResponse.data.data;

    // Get transactions for each account
    for (const account of accounts) {
      try {
        const params: any = { limit: 100 };
        if (startTime) {
          params.starting_after = new Date(startTime).toISOString();
        }
        if (endTime) {
          params.ending_before = new Date(endTime).toISOString();
        }

        const txResponse = await axios.get(
          `https://api.coinbase.com/v2/accounts/${account.id}/transactions`,
          {
            headers: {
              Authorization: `Bearer ${tokens.access_token}`,
            },
            params,
          }
        );

        const accountTxs = txResponse.data.data;

        for (const tx of accountTxs) {
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

    return transactions;
  } catch (error) {
    console.error("[Coinbase Transactions] Error:", error);
    throw error;
  }
}
