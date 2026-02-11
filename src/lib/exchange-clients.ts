import axios, { AxiosInstance } from "axios";
import { Decimal } from "@prisma/client/runtime/library";
import crypto from "crypto";

// Logger helper - only logs in development
const log = {
  error: (message: string, ...args: any[]) => {
    if (process.env.NODE_ENV === "development") {
      console.error(message, ...args);
    }
  },
  warn: (message: string, ...args: any[]) => {
    if (process.env.NODE_ENV === "development") {
      console.warn(message, ...args);
    }
  },
  log: (message: string, ...args: any[]) => {
    if (process.env.NODE_ENV === "development") {
      console.log(message, ...args);
    }
  },
};

// Base interface for exchange transactions
export interface ExchangeTransaction {
  id: string;
  type: string;
  asset_symbol: string;
  amount_value: Decimal;
  price_per_unit: Decimal | null;
  value_usd: Decimal;
  fee_usd: Decimal | null;
  tx_timestamp: Date;
  source: string;
  source_type: string;
  tx_hash?: string;
  notes?: string;
  // Swap fields
  incoming_asset_symbol?: string;
  incoming_amount_value?: Decimal;
  incoming_value_usd?: Decimal;
}

// Binance API Client
export class BinanceClient {
  private apiKey: string;
  private apiSecret: string;
  private baseURL: string = "https://api.binance.com";

  constructor(apiKey: string, apiSecret: string) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
  }

  private async makeRequest(endpoint: string, params: Record<string, any> = {}): Promise<any> {
    const timestamp = Date.now();
    const queryString = new URLSearchParams({
      ...params,
      timestamp: timestamp.toString(),
    }).toString();

    const signature = crypto
      .createHmac("sha256", this.apiSecret)
      .update(queryString)
      .digest("hex");

    const url = `${this.baseURL}${endpoint}?${queryString}&signature=${signature}`;

    const response = await axios.get(url, {
      headers: {
        "X-MBX-APIKEY": this.apiKey,
      },
    });

    return response.data;
  }

  async getAccountInfo(): Promise<any> {
    return this.makeRequest("/api/v3/account");
  }

  async getTrades(symbol?: string, startTime?: number, endTime?: number): Promise<any[]> {
    if (!symbol) {
      // If no symbol, return empty (Binance requires symbol for trades)
      return [];
    }
    
    const params: Record<string, any> = {
      symbol,
      limit: 1000, // Max allowed
    };
    if (startTime) params.startTime = startTime;
    if (endTime) params.endTime = endTime;

    try {
      return await this.makeRequest("/api/v3/myTrades", params);
      } catch (error) {
        log.error(`[Binance] Error fetching trades for ${symbol}:`, error);
        return [];
      }
  }

  async getAllTrades(startTime?: number, endTime?: number): Promise<ExchangeTransaction[]> {
    const trades: ExchangeTransaction[] = [];

    try {
      // Get deposit/withdrawal history (these don't require symbols)

      // Also get deposit/withdrawal history
      try {
        const deposits = await this.makeRequest("/sapi/v1/capital/deposit/hisrec", {
          ...(startTime && { startTime }),
          ...(endTime && { endTime }),
          limit: 1000,
        });

        const withdrawals = await this.makeRequest("/sapi/v1/capital/withdraw/history", {
          ...(startTime && { startTime }),
          ...(endTime && { endTime }),
          limit: 1000,
        });

        // Convert to transactions
        for (const deposit of deposits || []) {
          trades.push({
            id: deposit.txId || deposit.id?.toString() || `deposit-${deposit.insertTime}`,
            type: "Receive",
            asset_symbol: deposit.coin,
            amount_value: new Decimal(deposit.amount),
            price_per_unit: null,
            value_usd: new Decimal(0), // Will be updated with price data
            fee_usd: null,
            tx_timestamp: new Date(deposit.insertTime),
            source: "Binance",
            source_type: "exchange_api",
            tx_hash: deposit.txId,
          });
        }

        for (const withdrawal of withdrawals || []) {
          trades.push({
            id: withdrawal.txId || withdrawal.id?.toString() || `withdraw-${withdrawal.applyTime}`,
            type: "Send",
            asset_symbol: withdrawal.coin,
            amount_value: new Decimal(withdrawal.amount),
            price_per_unit: null,
            value_usd: new Decimal(0),
            fee_usd: withdrawal.transactionFee
              ? new Decimal(withdrawal.transactionFee)
              : null,
            tx_timestamp: new Date(withdrawal.applyTime),
            source: "Binance",
            source_type: "exchange_api",
            tx_hash: withdrawal.txId,
          });
        }
      } catch (error) {
        log.error("[Binance] Error fetching deposits/withdrawals:", error);
      }
    } catch (error) {
      log.error("[Binance] Error fetching trades:", error);
    }

    return trades;
  }
}

// Kraken API Client
export class KrakenClient {
  private apiKey: string;
  private apiSecret: string;
  private baseURL: string = "https://api.kraken.com";

  constructor(apiKey: string, apiSecret: string) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
  }

  private generateNonce(): string {
    return (Date.now() * 1000).toString(); // Microseconds for uniqueness
  }

  /**
   * Generate Kraken API signature
   * Signature = HMAC-SHA512(path + SHA256(nonce + postData), base64_decode(secret))
   */
  private generateSignature(
    path: string,
    nonce: string,
    postData: string
  ): string {
    const message = nonce + postData;
    const secret = Buffer.from(this.apiSecret, "base64");
    // SHA256 hash of nonce + postData
    const sha256Hash = crypto.createHash("sha256").update(message).digest();
    // Concatenate path (as buffer) with the hash
    const pathBuffer = Buffer.from(path);
    const combined = Buffer.concat([pathBuffer, sha256Hash]);
    // HMAC-SHA512 with secret
    const hmac = crypto.createHmac("sha512", secret);
    hmac.update(combined);
    return hmac.digest("base64");
  }

  /**
   * Make authenticated request to Kraken API
   */
  private async makeRequest(
    endpoint: string,
    params: Record<string, any> = {}
  ): Promise<any> {
    const nonce = this.generateNonce();
    const postData = new URLSearchParams({
      nonce,
      ...params,
    }).toString();

    const signature = this.generateSignature(endpoint, nonce, postData);

    const response = await axios.post(`${this.baseURL}${endpoint}`, postData, {
      headers: {
        "API-Key": this.apiKey,
        "API-Sign": signature,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    // Check for Kraken API errors
    if (response.data.error && response.data.error.length > 0) {
      throw new Error(`Kraken API error: ${response.data.error.join(", ")}`);
    }

    return response.data;
  }

  /**
   * Test API connection by fetching account balance
   */
  async testConnection(): Promise<boolean> {
    try {
      const response = await this.makeRequest("/0/private/Balance");
      const assetCount = Object.keys(response.result || {}).length;
      console.log(`[Kraken] Connection test successful, found ${assetCount} assets`);
      return true;
    } catch (error) {
      console.error("[Kraken] Connection test failed:", error instanceof Error ? error.message : error);
      throw error;
    }
  }

  /**
   * Get account balance
   */
  async getBalance(): Promise<Record<string, string>> {
    const response = await this.makeRequest("/0/private/Balance");
    return response.result || {};
  }

  /**
   * Normalize Kraken asset symbols
   * Kraken uses X prefix for crypto (XXBT, XETH) and Z prefix for fiat (ZUSD, ZEUR)
   */
  private normalizeAsset(asset: string): string {
    // Remove X or Z prefix for standard assets
    if (asset.length === 4 && (asset.startsWith("X") || asset.startsWith("Z"))) {
      asset = asset.substring(1);
    }
    // Handle special cases
    if (asset === "XBT") return "BTC";
    return asset.toUpperCase();
  }

  /**
   * Parse Kraken trading pair to extract base and quote
   * Kraken formats: XXBTZUSD, XETHZEUR, BTCUSD, ETH/USD, etc.
   */
  private parsePair(pair: string): { base: string; quote: string } {
    // If contains slash, split on it
    if (pair.includes("/")) {
      const [base, quote] = pair.split("/");
      return { base: this.normalizeAsset(base), quote: this.normalizeAsset(quote) };
    }

    // Common quote currencies (check longest first)
    const quoteCurrencies = ["ZUSD", "ZEUR", "ZGBP", "ZCAD", "ZJPY", "USD", "EUR", "GBP", "CAD", "JPY", "USDT", "USDC", "DAI"];

    for (const quote of quoteCurrencies) {
      if (pair.endsWith(quote)) {
        const base = pair.slice(0, -quote.length);
        return {
          base: this.normalizeAsset(base),
          quote: this.normalizeAsset(quote),
        };
      }
    }

    // Fallback: assume last 3-4 chars are quote
    const base = pair.slice(0, -3);
    const quote = pair.slice(-3);
    return {
      base: this.normalizeAsset(base),
      quote: this.normalizeAsset(quote),
    };
  }

  /**
   * Check if a currency is USD or USD-equivalent
   */
  private isUsdEquivalent(currency: string): boolean {
    const usdEquivalents = ["USD", "USDT", "USDC", "DAI", "BUSD"];
    return usdEquivalents.includes(currency.toUpperCase());
  }

  /**
   * Get trades history with pagination
   */
  async getTradesHistory(startTime?: number, endTime?: number): Promise<ExchangeTransaction[]> {
    const allTrades: ExchangeTransaction[] = [];
    let offset = 0;
    const pageSize = 50; // Kraken default
    let hasMore = true;

    try {
      while (hasMore) {
        const params: Record<string, any> = {
          ofs: offset.toString(),
        };
        if (startTime) params.start = Math.floor(startTime / 1000).toString(); // Kraken uses seconds
        if (endTime) params.end = Math.floor(endTime / 1000).toString();

        const response = await this.makeRequest("/0/private/TradesHistory", params);
        const trades = response.result?.trades || {};
        const tradeCount = Object.keys(trades).length;

        for (const [txid, trade] of Object.entries(trades as Record<string, any>)) {
          const { base, quote } = this.parsePair(trade.pair);
          const isBuy = trade.type === "buy";
          const vol = parseFloat(trade.vol);
          const price = parseFloat(trade.price);
          const cost = parseFloat(trade.cost);
          const fee = parseFloat(trade.fee || "0");

          // Calculate USD value
          // If quote is USD-equivalent, cost is already in USD
          // Otherwise, we'd need conversion (for now, store as-is with note)
          const isUsdQuote = this.isUsdEquivalent(quote);
          const valueUsd = isUsdQuote ? cost : cost; // TODO: Add conversion for non-USD pairs

          allTrades.push({
            id: txid,
            type: isBuy ? "Buy" : "Sell",
            asset_symbol: base,
            amount_value: new Decimal(Math.abs(vol)),
            price_per_unit: new Decimal(price),
            value_usd: new Decimal(Math.abs(valueUsd)),
            fee_usd: isUsdQuote && fee > 0 ? new Decimal(fee) : null,
            tx_timestamp: new Date(parseFloat(trade.time) * 1000),
            source: "Kraken",
            source_type: "exchange_api",
            tx_hash: txid,
            notes: `${trade.pair} @ ${price}${!isUsdQuote ? ` (value in ${quote})` : ""}`,
          });
        }

        // Check if there are more trades
        const totalCount = response.result?.count || 0;
        offset += tradeCount;
        hasMore = tradeCount === pageSize && offset < totalCount;

        // Safety limit
        if (offset > 5000) {
          console.log("[Kraken] Reached pagination limit (5000 trades)");
          break;
        }
      }

      console.log(`[Kraken] Fetched ${allTrades.length} trades`);
      return allTrades;
    } catch (error) {
      console.error("[Kraken] Error fetching trades:", error instanceof Error ? error.message : error);
      throw error;
    }
  }

  /**
   * Get ledger entries (deposits, withdrawals, staking, etc.) with pagination
   */
  async getLedgers(startTime?: number, endTime?: number, type?: string): Promise<ExchangeTransaction[]> {
    const transactions: ExchangeTransaction[] = [];
    let offset = 0;
    const pageSize = 50;
    let hasMore = true;

    try {
      while (hasMore) {
        const params: Record<string, any> = {
          ofs: offset.toString(),
        };
        if (startTime) params.start = Math.floor(startTime / 1000).toString();
        if (endTime) params.end = Math.floor(endTime / 1000).toString();
        if (type) params.type = type; // deposit, withdrawal, trade, margin, staking, etc.

        const response = await this.makeRequest("/0/private/Ledgers", params);
        const ledgers = response.result?.ledger || {};
        const ledgerCount = Object.keys(ledgers).length;

        for (const [ledgerId, entry] of Object.entries(ledgers as Record<string, any>)) {
          const asset = this.normalizeAsset(entry.asset);
          const amount = parseFloat(entry.amount);
          const fee = parseFloat(entry.fee || "0");

          // Determine transaction type
          let txType: string;
          switch (entry.type) {
            case "deposit":
              txType = "Receive";
              break;
            case "withdrawal":
              txType = "Send";
              break;
            case "staking":
              txType = amount > 0 ? "Staking Reward" : "Staking";
              break;
            case "transfer":
              txType = amount > 0 ? "Receive" : "Send";
              break;
            case "trade":
              // Skip trades - we get those from TradesHistory
              continue;
            case "margin":
              txType = "Margin";
              break;
            default:
              txType = entry.type || "Transfer";
          }

          transactions.push({
            id: ledgerId,
            type: txType,
            asset_symbol: asset,
            amount_value: new Decimal(Math.abs(amount)),
            price_per_unit: null, // Would need price lookup
            value_usd: new Decimal(0), // Would need price lookup
            fee_usd: fee > 0 ? new Decimal(fee) : null,
            tx_timestamp: new Date(parseFloat(entry.time) * 1000),
            source: "Kraken",
            source_type: "exchange_api",
            tx_hash: entry.refid || ledgerId,
            notes: `${entry.type}: ${entry.subtype || ""}`,
          });
        }

        const totalCount = response.result?.count || 0;
        offset += ledgerCount;
        hasMore = ledgerCount === pageSize && offset < totalCount;

        if (offset > 5000) {
          console.log("[Kraken] Reached ledger pagination limit");
          break;
        }
      }

      console.log(`[Kraken] Fetched ${transactions.length} ledger entries`);
      return transactions;
    } catch (error) {
      console.error("[Kraken] Error fetching ledgers:", error instanceof Error ? error.message : error);
      return []; // Don't throw - ledgers might fail but trades could work
    }
  }

  /**
   * Get deposits and withdrawals
   */
  async getDepositsAndWithdrawals(startTime?: number, endTime?: number): Promise<ExchangeTransaction[]> {
    // Get deposits and withdrawals from ledger
    const [deposits, withdrawals] = await Promise.all([
      this.getLedgers(startTime, endTime, "deposit"),
      this.getLedgers(startTime, endTime, "withdrawal"),
    ]);

    return [...deposits, ...withdrawals];
  }

  /**
   * Get all transactions (trades + deposits + withdrawals)
   */
  async getAllTransactions(startTime?: number, endTime?: number): Promise<ExchangeTransaction[]> {
    const [trades, depositsWithdrawals] = await Promise.all([
      this.getTradesHistory(startTime, endTime),
      this.getDepositsAndWithdrawals(startTime, endTime),
    ]);

    const all = [...trades, ...depositsWithdrawals];
    // Sort by timestamp
    all.sort((a, b) => a.tx_timestamp.getTime() - b.tx_timestamp.getTime());

    console.log(`[Kraken] Total transactions: ${all.length} (${trades.length} trades, ${depositsWithdrawals.length} deposits/withdrawals)`);
    return all;
  }
}

// KuCoin API Client
export class KuCoinClient {
  private apiKey: string;
  private apiSecret: string;
  private apiPassphrase: string;
  private baseURL: string;
  private isSandbox: boolean;

  constructor(apiKey: string, apiSecret: string, apiPassphrase: string, sandbox: boolean = false) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.apiPassphrase = apiPassphrase;
    this.isSandbox = sandbox;
    this.baseURL = sandbox
      ? "https://openapi-sandbox.kucoin.com"
      : "https://api.kucoin.com";
  }

  /**
   * Generate signature for KuCoin API
   * Signature = BASE64(HMAC-SHA256(timestamp + method + endpoint + body))
   */
  private generateSignature(
    timestamp: string,
    method: string,
    endpoint: string,
    body: string = ""
  ): string {
    const strToSign = timestamp + method + endpoint + body;
    return crypto
      .createHmac("sha256", this.apiSecret)
      .update(strToSign)
      .digest("base64");
  }

  /**
   * Sign passphrase for API V2
   * For V2 API, passphrase must be HMAC-SHA256 signed with secret and BASE64 encoded
   */
  private signPassphrase(): string {
    return crypto
      .createHmac("sha256", this.apiSecret)
      .update(this.apiPassphrase)
      .digest("base64");
  }

  /**
   * Make authenticated request to KuCoin API
   */
  private async makeRequest(
    endpoint: string,
    method: string = "GET",
    params: Record<string, any> = {},
    body: any = null
  ): Promise<any> {
    const timestamp = Date.now().toString();
    const queryString = Object.keys(params).length > 0
      ? "?" + new URLSearchParams(params).toString()
      : "";
    const url = endpoint + queryString;
    const bodyStr = body ? JSON.stringify(body) : "";
    const signature = this.generateSignature(timestamp, method, url, bodyStr);
    const signedPassphrase = this.signPassphrase();

    const headers: Record<string, string> = {
      "KC-API-KEY": this.apiKey,
      "KC-API-SIGN": signature,
      "KC-API-TIMESTAMP": timestamp,
      "KC-API-PASSPHRASE": signedPassphrase,
      "KC-API-KEY-VERSION": "2",
      "Content-Type": "application/json",
    };

    const response = await axios.request({
      method,
      url: `${this.baseURL}${url}`,
      headers,
      data: body || undefined,
    });

    // KuCoin returns { code: "200000", data: ... } for success
    if (response.data.code !== "200000") {
      throw new Error(`KuCoin API error: ${response.data.code} - ${response.data.msg || "Unknown error"}`);
    }

    return response.data;
  }

  /**
   * Test API connection by fetching account info
   */
  async testConnection(): Promise<boolean> {
    try {
      const response = await this.makeRequest("/api/v1/accounts", "GET");
      console.log(`[KuCoin] Connection test successful, found ${response.data?.length || 0} accounts`);
      return true;
    } catch (error) {
      console.error("[KuCoin] Connection test failed:", error instanceof Error ? error.message : error);
      throw error;
    }
  }

  /**
   * Get account balances
   */
  async getAccounts(): Promise<any[]> {
    const response = await this.makeRequest("/api/v1/accounts", "GET");
    return response.data || [];
  }

  /**
   * Parse trading pair symbol to extract base and quote currencies
   * KuCoin format: BTC-USDT, ETH-BTC, etc.
   */
  private parseSymbol(symbol: string): { base: string; quote: string } {
    const parts = symbol.split("-");
    return {
      base: parts[0] || symbol,
      quote: parts[1] || "USDT",
    };
  }

  /**
   * Get all fills/trades with pagination
   */
  async getTrades(symbol?: string, startTime?: number, endTime?: number): Promise<ExchangeTransaction[]> {
    const allTrades: ExchangeTransaction[] = [];
    let currentPage = 1;
    const pageSize = 500; // Max allowed
    let hasMore = true;

    try {
      while (hasMore) {
        const params: Record<string, any> = {
          pageSize: pageSize.toString(),
          currentPage: currentPage.toString(),
        };
        if (symbol) params.symbol = symbol;
        if (startTime) params.startAt = startTime.toString();
        if (endTime) params.endAt = endTime.toString();

        const response = await this.makeRequest("/api/v1/fills", "GET", params);
        const items = response.data?.items || [];

        for (const trade of items) {
          const { base, quote } = this.parseSymbol(trade.symbol);
          const isBuy = trade.side === "buy";
          const size = parseFloat(trade.size);
          const price = parseFloat(trade.price);
          const funds = parseFloat(trade.funds);
          const fee = parseFloat(trade.fee || "0");

          // Calculate USD value - if quote is USDT/USD, use funds directly
          // Otherwise, this is an approximation (would need price conversion)
          const isUsdQuote = ["USDT", "USD", "USDC", "DAI", "BUSD"].includes(quote.toUpperCase());
          const valueUsd = isUsdQuote ? funds : funds; // TODO: Add price conversion for non-USD pairs

          allTrades.push({
            id: trade.tradeId || trade.id,
            type: isBuy ? "Buy" : "Sell",
            asset_symbol: base,
            amount_value: new Decimal(Math.abs(size)),
            price_per_unit: new Decimal(price),
            value_usd: new Decimal(Math.abs(valueUsd)),
            fee_usd: isUsdQuote && fee > 0 ? new Decimal(fee) : null,
            tx_timestamp: new Date(trade.createdAt),
            source: "KuCoin",
            source_type: "exchange_api",
            tx_hash: trade.tradeId || trade.id,
            notes: `${trade.symbol} @ ${price}`,
          });
        }

        // Check if there are more pages
        const totalPages = Math.ceil((response.data?.totalNum || 0) / pageSize);
        hasMore = currentPage < totalPages && items.length === pageSize;
        currentPage++;

        // Safety limit
        if (currentPage > 100) {
          console.log("[KuCoin] Reached pagination limit (100 pages)");
          break;
        }
      }

      console.log(`[KuCoin] Fetched ${allTrades.length} trades across ${currentPage - 1} pages`);
      return allTrades;
    } catch (error) {
      console.error("[KuCoin] Error fetching trades:", error instanceof Error ? error.message : error);
      throw error;
    }
  }

  /**
   * Get deposit history with pagination
   */
  async getDeposits(startTime?: number, endTime?: number): Promise<ExchangeTransaction[]> {
    const deposits: ExchangeTransaction[] = [];
    let currentPage = 1;
    const pageSize = 100;
    let hasMore = true;

    try {
      while (hasMore) {
        const params: Record<string, any> = {
          pageSize: pageSize.toString(),
          currentPage: currentPage.toString(),
        };
        if (startTime) params.startAt = startTime.toString();
        if (endTime) params.endAt = endTime.toString();

        const response = await this.makeRequest("/api/v1/deposits", "GET", params);
        const items = response.data?.items || [];

        for (const deposit of items) {
          // Skip pending deposits
          if (deposit.status !== "SUCCESS") continue;

          const amount = parseFloat(deposit.amount);

          deposits.push({
            id: deposit.id || `deposit-${deposit.createdAt}`,
            type: "Receive",
            asset_symbol: deposit.currency,
            amount_value: new Decimal(amount),
            price_per_unit: null,
            value_usd: new Decimal(0), // Would need price lookup
            fee_usd: deposit.fee ? new Decimal(parseFloat(deposit.fee)) : null,
            tx_timestamp: new Date(deposit.createdAt),
            source: "KuCoin",
            source_type: "exchange_api",
            tx_hash: deposit.walletTxId || deposit.id,
            notes: `Deposit: ${deposit.memo || ""}`,
          });
        }

        const totalPages = Math.ceil((response.data?.totalNum || 0) / pageSize);
        hasMore = currentPage < totalPages && items.length === pageSize;
        currentPage++;

        if (currentPage > 50) break; // Safety limit
      }

      console.log(`[KuCoin] Fetched ${deposits.length} deposits`);
      return deposits;
    } catch (error) {
      console.error("[KuCoin] Error fetching deposits:", error instanceof Error ? error.message : error);
      return []; // Don't throw - deposits might fail but trades could work
    }
  }

  /**
   * Get withdrawal history with pagination
   */
  async getWithdrawals(startTime?: number, endTime?: number): Promise<ExchangeTransaction[]> {
    const withdrawals: ExchangeTransaction[] = [];
    let currentPage = 1;
    const pageSize = 100;
    let hasMore = true;

    try {
      while (hasMore) {
        const params: Record<string, any> = {
          pageSize: pageSize.toString(),
          currentPage: currentPage.toString(),
        };
        if (startTime) params.startAt = startTime.toString();
        if (endTime) params.endAt = endTime.toString();

        const response = await this.makeRequest("/api/v1/withdrawals", "GET", params);
        const items = response.data?.items || [];

        for (const withdrawal of items) {
          // Skip pending/failed withdrawals
          if (withdrawal.status !== "SUCCESS") continue;

          const amount = parseFloat(withdrawal.amount);
          const fee = parseFloat(withdrawal.fee || "0");

          withdrawals.push({
            id: withdrawal.id || `withdrawal-${withdrawal.createdAt}`,
            type: "Send",
            asset_symbol: withdrawal.currency,
            amount_value: new Decimal(amount),
            price_per_unit: null,
            value_usd: new Decimal(0), // Would need price lookup
            fee_usd: fee > 0 ? new Decimal(fee) : null,
            tx_timestamp: new Date(withdrawal.createdAt),
            source: "KuCoin",
            source_type: "exchange_api",
            tx_hash: withdrawal.walletTxId || withdrawal.id,
            notes: `Withdrawal to ${withdrawal.address || ""}`,
          });
        }

        const totalPages = Math.ceil((response.data?.totalNum || 0) / pageSize);
        hasMore = currentPage < totalPages && items.length === pageSize;
        currentPage++;

        if (currentPage > 50) break; // Safety limit
      }

      console.log(`[KuCoin] Fetched ${withdrawals.length} withdrawals`);
      return withdrawals;
    } catch (error) {
      console.error("[KuCoin] Error fetching withdrawals:", error instanceof Error ? error.message : error);
      return []; // Don't throw - withdrawals might fail but trades could work
    }
  }

  /**
   * Get all transactions (trades + deposits + withdrawals)
   */
  async getAllTransactions(startTime?: number, endTime?: number): Promise<ExchangeTransaction[]> {
    const [trades, deposits, withdrawals] = await Promise.all([
      this.getTrades(undefined, startTime, endTime),
      this.getDeposits(startTime, endTime),
      this.getWithdrawals(startTime, endTime),
    ]);

    const all = [...trades, ...deposits, ...withdrawals];
    // Sort by timestamp
    all.sort((a, b) => a.tx_timestamp.getTime() - b.tx_timestamp.getTime());

    console.log(`[KuCoin] Total transactions: ${all.length} (${trades.length} trades, ${deposits.length} deposits, ${withdrawals.length} withdrawals)`);
    return all;
  }
}

// Gemini API Client
export class GeminiClient {
  private apiKey: string;
  private apiSecret: string;
  private baseURL: string;
  private isSandbox: boolean;

  constructor(apiKey: string, apiSecret: string, sandbox: boolean = false) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.isSandbox = sandbox;
    this.baseURL = sandbox
      ? "https://api.sandbox.gemini.com"
      : "https://api.gemini.com";
  }

  /**
   * Generate proper Gemini API signature
   * Signature is HMAC-SHA384 of the BASE64-encoded payload
   */
  private generateSignature(base64Payload: string): string {
    return crypto
      .createHmac("sha384", this.apiSecret)
      .update(base64Payload)
      .digest("hex");
  }

  /**
   * Make authenticated request to Gemini API
   * Gemini requires:
   * 1. Payload with `request` (endpoint), `nonce`, and `account` fields
   * 2. Payload JSON stringified and BASE64 encoded
   * 3. Signature is HMAC-SHA384 of the BASE64 payload
   */
  private async makeRequest(
    endpoint: string,
    params: Record<string, any> = {}
  ): Promise<any> {
    // Build payload with required fields
    const payload = {
      request: endpoint,
      nonce: Date.now().toString(),
      account: "primary", // Required for all authenticated endpoints
      ...params,
    };

    // JSON stringify and BASE64 encode
    const jsonPayload = JSON.stringify(payload);
    const base64Payload = Buffer.from(jsonPayload).toString("base64");

    // Generate signature from BASE64 payload
    const signature = this.generateSignature(base64Payload);

    const response = await axios.post(`${this.baseURL}${endpoint}`, null, {
      headers: {
        "Content-Type": "text/plain",
        "Content-Length": "0",
        "X-GEMINI-APIKEY": this.apiKey,
        "X-GEMINI-PAYLOAD": base64Payload,
        "X-GEMINI-SIGNATURE": signature,
        "Cache-Control": "no-cache",
      },
    });

    return response.data;
  }

  /**
   * Test API connection by fetching account balances
   */
  async testConnection(): Promise<boolean> {
    try {
      const balances = await this.makeRequest("/v1/balances");
      console.log(`[Gemini] Connection test successful, found ${balances.length} balances`);
      return true;
    } catch (error) {
      console.error("[Gemini] Connection test failed:", error instanceof Error ? error.message : error);
      throw error;
    }
  }

  /**
   * Get account balances
   */
  async getBalances(): Promise<any[]> {
    return this.makeRequest("/v1/balances");
  }

  /**
   * Parse symbol to extract base and quote currencies
   * Handles formats like: btcusd, ethusd, ethbtc, etc.
   */
  private parseSymbol(symbol: string): { base: string; quote: string } {
    const s = symbol.toUpperCase();
    // Common quote currencies in order of preference
    const quoteCurrencies = ["USD", "USDT", "BTC", "ETH", "DAI", "GBP", "EUR", "SGD"];

    for (const quote of quoteCurrencies) {
      if (s.endsWith(quote)) {
        return {
          base: s.slice(0, -quote.length),
          quote: quote,
        };
      }
    }
    // Fallback: assume last 3 chars are quote
    return {
      base: s.slice(0, -3),
      quote: s.slice(-3),
    };
  }

  /**
   * Get all trades with pagination
   */
  async getTrades(symbol?: string, startTime?: number, endTime?: number): Promise<ExchangeTransaction[]> {
    const allTrades: ExchangeTransaction[] = [];

    try {
      const params: Record<string, any> = {
        limit_trades: 500, // Max allowed
      };
      if (symbol) params.symbol = symbol;
      if (startTime) params.timestamp = Math.floor(startTime / 1000); // Convert ms to seconds

      const response = await this.makeRequest("/v1/mytrades", params);

      if (Array.isArray(response)) {
        for (const trade of response) {
          // Filter by endTime if specified
          if (endTime && trade.timestampms > endTime) {
            continue;
          }

          const { base, quote } = this.parseSymbol(trade.symbol);
          const isBuy = trade.type === "Buy";
          const amount = parseFloat(trade.amount);
          const price = parseFloat(trade.price);

          // Calculate USD value - if quote is USD, use directly; otherwise need conversion
          let valueUsd = Math.abs(amount * price);
          if (quote !== "USD" && quote !== "USDT") {
            // For non-USD pairs, we'd need price conversion
            // For now, store the quote currency value (will need enhancement)
            console.log(`[Gemini] Non-USD pair ${trade.symbol}, value in ${quote}: ${valueUsd}`);
          }

          allTrades.push({
            id: trade.tid?.toString() || trade.timestampms.toString(),
            type: isBuy ? "Buy" : "Sell",
            asset_symbol: base,
            amount_value: new Decimal(Math.abs(amount)),
            price_per_unit: new Decimal(price),
            value_usd: new Decimal(valueUsd),
            fee_usd: trade.fee_amount ? new Decimal(parseFloat(trade.fee_amount)) : null,
            tx_timestamp: new Date(trade.timestampms),
            source: "Gemini",
            source_type: "exchange_api",
            tx_hash: trade.tid?.toString(),
            notes: `${trade.symbol} @ ${price}`,
          });
        }
      }

      console.log(`[Gemini] Fetched ${allTrades.length} trades`);
      return allTrades;
    } catch (error) {
      console.error("[Gemini] Error fetching trades:", error instanceof Error ? error.message : error);
      throw error;
    }
  }

  /**
   * Get transfers (deposits and withdrawals)
   */
  async getTransfers(startTime?: number, endTime?: number): Promise<ExchangeTransaction[]> {
    const transfers: ExchangeTransaction[] = [];

    try {
      const params: Record<string, any> = {
        limit_transfers: 50, // Max allowed per request
      };
      if (startTime) params.timestamp = Math.floor(startTime / 1000);

      const response = await this.makeRequest("/v1/transfers", params);

      if (Array.isArray(response)) {
        for (const transfer of response) {
          // Filter by endTime if specified
          if (endTime && transfer.timestampms > endTime) {
            continue;
          }

          // Skip pending transfers
          if (transfer.status !== "Complete" && transfer.status !== "Advanced") {
            continue;
          }

          // Determine if this is a deposit or withdrawal
          // Types: Deposit, Withdrawal, AdminCredit, AdminDebit, Reward
          const depositTypes = ["Deposit", "AdminCredit", "Reward"];
          const isDeposit = depositTypes.includes(transfer.type);
          const amount = parseFloat(transfer.amount);

          transfers.push({
            id: transfer.eid?.toString() || transfer.timestampms.toString(),
            type: isDeposit ? "Receive" : "Send",
            asset_symbol: transfer.currency.toUpperCase(),
            amount_value: new Decimal(Math.abs(amount)),
            price_per_unit: null, // Would need price lookup
            value_usd: new Decimal(0), // Would need price lookup
            fee_usd: transfer.feeAmount ? new Decimal(parseFloat(transfer.feeAmount)) : null,
            tx_timestamp: new Date(transfer.timestampms),
            source: "Gemini",
            source_type: "exchange_api",
            tx_hash: transfer.txHash || transfer.eid?.toString(),
            notes: `${transfer.type}: ${transfer.method || ""}`,
          });
        }
      }

      console.log(`[Gemini] Fetched ${transfers.length} transfers`);
      return transfers;
    } catch (error) {
      console.error("[Gemini] Error fetching transfers:", error instanceof Error ? error.message : error);
      // Don't throw - transfers endpoint might not be available
      return [];
    }
  }

  /**
   * Get all transactions (trades + transfers)
   */
  async getAllTransactions(startTime?: number, endTime?: number): Promise<ExchangeTransaction[]> {
    const [trades, transfers] = await Promise.all([
      this.getTrades(undefined, startTime, endTime),
      this.getTransfers(startTime, endTime),
    ]);

    const all = [...trades, ...transfers];
    // Sort by timestamp
    all.sort((a, b) => a.tx_timestamp.getTime() - b.tx_timestamp.getTime());

    console.log(`[Gemini] Total transactions: ${all.length} (${trades.length} trades, ${transfers.length} transfers)`);
    return all;
  }
}

// Helper functions for secure API key encryption/decryption
// Uses AES-256-GCM for production-grade security

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16; // 128 bits
const SALT_LENGTH = 64; // 512 bits
const TAG_LENGTH = 16; // 128 bits
const KEY_LENGTH = 32; // 256 bits
const ITERATIONS = 100000; // PBKDF2 iterations

/**
 * Derives a key from the encryption key using PBKDF2
 */
function deriveKey(encryptionKey: string, salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(
    encryptionKey,
    salt,
    ITERATIONS,
    KEY_LENGTH,
    "sha256"
  );
}

/**
 * Encrypts API keys using AES-256-GCM
 * Format: salt:iv:tag:encrypted
 */
export function encryptApiKey(plaintext: string, encryptionKey: string): string {
  try {
    if (!plaintext || !encryptionKey) {
      throw new Error("Plaintext and encryption key are required");
    }

    // Generate random salt and IV
    const salt = crypto.randomBytes(SALT_LENGTH);
    const iv = crypto.randomBytes(IV_LENGTH);

    // Derive key from encryption key and salt
    const derivedKey = deriveKey(encryptionKey, salt);

    // Create cipher
    const cipher = crypto.createCipheriv(ALGORITHM, derivedKey, iv);

    // Encrypt
    let encrypted = cipher.update(plaintext, "utf8", "hex");
    encrypted += cipher.final("hex");

    // Get authentication tag
    const tag = cipher.getAuthTag();

    // Return format: salt:iv:tag:encrypted (all hex encoded)
    return [
      salt.toString("hex"),
      iv.toString("hex"),
      tag.toString("hex"),
      encrypted,
    ].join(":");
  } catch (error) {
    // Only log in development
    if (process.env.NODE_ENV === "development") {
      console.error("[Encryption] Encryption error:", error);
    }
    throw new Error("Failed to encrypt API key");
  }
}

/**
 * Decrypts API keys using AES-256-GCM
 * Expects format: salt:iv:tag:encrypted
 */
export function decryptApiKey(encrypted: string, encryptionKey: string): string {
  try {
    if (!encrypted || !encryptionKey) {
      throw new Error("Encrypted data and encryption key are required");
    }

    // Check if this is old XOR format (no colons) - for backward compatibility
    if (!encrypted.includes(":")) {
      // Try to decrypt as old XOR format
      try {
        const keyBuffer = Buffer.from(encryptionKey.slice(0, 32), "hex");
        const encryptedBuffer = Buffer.from(encrypted, "hex");
        const decrypted = Buffer.alloc(encryptedBuffer.length);
        
        for (let i = 0; i < encryptedBuffer.length; i++) {
          decrypted[i] = encryptedBuffer[i] ^ keyBuffer[i % keyBuffer.length];
        }
        
        return decrypted.toString("utf8");
      } catch {
        throw new Error("Invalid encrypted format");
      }
    }

    // Parse the encrypted string (format: salt:iv:tag:encrypted)
    const parts = encrypted.split(":");
    if (parts.length !== 4) {
      throw new Error("Invalid encrypted format");
    }

    const [saltHex, ivHex, tagHex, encryptedHex] = parts;

    // Convert from hex
    const salt = Buffer.from(saltHex, "hex");
    const iv = Buffer.from(ivHex, "hex");
    const tag = Buffer.from(tagHex, "hex");
    const encryptedBuffer = Buffer.from(encryptedHex, "hex");

    // Derive key from encryption key and salt
    const derivedKey = deriveKey(encryptionKey, salt);

    // Create decipher
    const decipher = crypto.createDecipheriv(ALGORITHM, derivedKey, iv);
    decipher.setAuthTag(tag);

    // Decrypt
    let decrypted = decipher.update(encryptedBuffer, undefined, "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  } catch (error) {
    // Only log in development
    if (process.env.NODE_ENV === "development") {
      console.error("[Encryption] Decryption error:", error);
    }
    throw new Error("Failed to decrypt API key");
  }
}
