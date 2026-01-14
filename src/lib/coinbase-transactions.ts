import axios from "axios";
import { Decimal } from "@prisma/client/runtime/library";
import { refreshAccessToken, isTokenExpired, CoinbaseTokens } from "./coinbase";
import type { ExchangeTransaction } from "./exchange-clients";

/**
 * Get transactions from Coinbase using OAuth tokens
 */
export async function getCoinbaseTransactions(
  refreshToken: string,
  startTime?: number,
  endTime?: number
): Promise<ExchangeTransaction[]> {
  try {
    // Refresh token if needed
    let tokens: CoinbaseTokens;
    try {
      tokens = await refreshAccessToken(refreshToken);
    } catch (error) {
      console.error("[Coinbase Transactions] Failed to refresh token:", error);
      throw new Error("Failed to authenticate with Coinbase");
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
