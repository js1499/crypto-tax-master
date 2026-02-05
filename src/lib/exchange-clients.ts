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
    return Date.now().toString();
  }

  private generateSignature(
    path: string,
    nonce: string,
    postData: string
  ): string {
    const message = nonce + postData;
    const secret = Buffer.from(this.apiSecret, "base64");
    const hash = crypto.createHash("sha256").update(path + message).digest();
    const hmac = crypto.createHmac("sha512", secret);
    hmac.update(hash);
    return hmac.digest("base64");
  }

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

    return response.data;
  }

  async getTradesHistory(startTime?: number, endTime?: number): Promise<ExchangeTransaction[]> {
    const params: Record<string, any> = {};
    if (startTime) params.start = startTime.toString();
    if (endTime) params.end = endTime.toString();

    try {
      const response = await this.makeRequest("/0/private/TradesHistory", params);
      const trades: ExchangeTransaction[] = [];

      if (response.result && response.result.trades) {
        for (const [txid, trade] of Object.entries(response.result.trades as any)) {
          const [base, quote] = trade.pair.split("/");
          const isBuy = trade.type === "buy";

          trades.push({
            id: txid,
            type: isBuy ? "Buy" : "Sell",
            asset_symbol: base,
            amount_value: new Decimal(Math.abs(parseFloat(trade.vol))),
            price_per_unit: new Decimal(trade.price),
            value_usd: new Decimal(Math.abs(parseFloat(trade.cost))),
            fee_usd: trade.fee ? new Decimal(trade.fee) : null,
            tx_timestamp: new Date(parseFloat(trade.time) * 1000),
            source: "Kraken",
            source_type: "exchange_api",
            tx_hash: txid,
          });
        }
      }

      return trades;
    } catch (error) {
      log.error("[Kraken] Error fetching trades:", error);
      return [];
    }
  }
}

// KuCoin API Client
export class KuCoinClient {
  private apiKey: string;
  private apiSecret: string;
  private apiPassphrase: string;
  private baseURL: string = "https://api.kucoin.com";

  constructor(apiKey: string, apiSecret: string, apiPassphrase: string) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.apiPassphrase = apiPassphrase;
  }

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

  private async makeRequest(
    endpoint: string,
    method: string = "GET",
    params: Record<string, any> = {}
  ): Promise<any> {
    const timestamp = Date.now().toString();
    const queryString = new URLSearchParams(params).toString();
    const url = queryString ? `${endpoint}?${queryString}` : endpoint;
    const signature = this.generateSignature(timestamp, method, url);

    const response = await axios.request({
      method,
      url: `${this.baseURL}${url}`,
      headers: {
        "KC-API-KEY": this.apiKey,
        "KC-API-SIGN": signature,
        "KC-API-TIMESTAMP": timestamp,
        "KC-API-PASSPHRASE": this.apiPassphrase,
        "KC-API-KEY-VERSION": "2",
      },
    });

    return response.data;
  }

  async getTrades(symbol?: string, startTime?: number, endTime?: number): Promise<ExchangeTransaction[]> {
    const params: Record<string, any> = {};
    if (symbol) params.symbol = symbol;
    if (startTime) params.startAt = startTime;
    if (endTime) params.endAt = endTime;
    params.pageSize = 200;

    try {
      const response = await this.makeRequest("/api/v1/fills", "GET", params);
      const trades: ExchangeTransaction[] = [];

      if (response.data && Array.isArray(response.data.items)) {
        for (const trade of response.data.items) {
          const [base, quote] = trade.symbol.split("-");
          const isBuy = trade.side === "buy";

          trades.push({
            id: trade.id,
            type: isBuy ? "Buy" : "Sell",
            asset_symbol: base,
            amount_value: new Decimal(Math.abs(parseFloat(trade.size))),
            price_per_unit: new Decimal(trade.price),
            value_usd: new Decimal(Math.abs(parseFloat(trade.funds))),
            fee_usd: trade.fee ? new Decimal(trade.fee) : null,
            tx_timestamp: new Date(trade.createdAt),
            source: "KuCoin",
            source_type: "exchange_api",
            tx_hash: trade.id,
          });
        }
      }

      return trades;
    } catch (error) {
      log.error("[KuCoin] Error fetching trades:", error);
      return [];
    }
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
