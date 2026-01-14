import { Decimal } from "@prisma/client/runtime/library";
import { logBuffer } from "./log-buffer";

/**
 * Simple CSV parser
 */
export function parseCSV(content: string): string[][] {
  const lines: string[] = [];
  let currentLine = "";
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const nextChar = content[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote
        currentLine += '"';
        i++; // Skip next quote
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
      }
    } else if (char === "\n" && !inQuotes) {
      // End of line
      lines.push(currentLine);
      currentLine = "";
    } else if (char === "\r" && nextChar === "\n" && !inQuotes) {
      // Windows line ending
      lines.push(currentLine);
      currentLine = "";
      i++; // Skip \n
    } else {
      currentLine += char;
    }
  }

  // Add last line if exists
  if (currentLine) {
    lines.push(currentLine);
  }

  // Parse each line into columns
  return lines.map((line) => {
    const columns: string[] = [];
    let currentColumn = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          currentColumn += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === "," && !inQuotes) {
        columns.push(currentColumn.trim());
        currentColumn = "";
      } else {
        currentColumn += char;
      }
    }
    columns.push(currentColumn.trim());

    return columns;
  });
}

/**
 * Parsed transaction data structure
 */
export interface ParsedTransaction {
  type: string;
  subtype?: string;
  status?: string;
  asset_symbol: string;
  asset_address?: string;
  asset_chain?: string;
  amount_value: Decimal;
  price_per_unit?: Decimal;
  value_usd: Decimal;
  fee_usd?: Decimal;
  wallet_address?: string;
  counterparty_address?: string;
  tx_hash?: string;
  chain?: string;
  block_number?: bigint;
  explorer_url?: string;
  tx_timestamp: Date;
  notes?: string;
  // Swap transaction fields
  incoming_asset_symbol?: string;
  incoming_amount_value?: Decimal;
  incoming_value_usd?: Decimal;
}

/**
 * Base class for exchange-specific CSV parsers
 */
export abstract class ExchangeCSVParser {
  abstract parse(csvData: string[][]): ParsedTransaction[];

  protected findColumnIndex(headers: string[], possibleNames: string[]): number {
    // Normalize headers: lowercase, trim, remove extra spaces, normalize punctuation
    const normalize = (str: string) => {
      if (!str) return "";
      return str.toLowerCase()
        .trim()
        .replace(/\s+/g, " ")
        .replace(/[.,()]/g, "") // Remove periods, commas, and parentheses
        .replace(/\s*\([^)]*\)\s*/g, "") // Remove anything in parentheses
        .trim();
    };
    
    const normalizedHeaders = headers.map((h) => normalize(h));
    for (const name of possibleNames) {
      const normalizedName = normalize(name);
      // Try exact match first
      let index = normalizedHeaders.findIndex((h) => h === normalizedName);
      if (index !== -1) return index;
      
      // Try contains match
      index = normalizedHeaders.findIndex((h) => h.includes(normalizedName) || normalizedName.includes(h));
      if (index !== -1) return index;
      
      // Try partial match (for cases like "proceeds usd" matching "proceeds(usd)")
      const nameParts = normalizedName.split(/\s+/);
      if (nameParts.length > 1) {
        index = normalizedHeaders.findIndex((h) => 
          nameParts.every(part => h.includes(part)) || h.split(/\s+/).every(part => normalizedName.includes(part))
        );
        if (index !== -1) return index;
      }
    }
    return -1;
  }

  protected parseDecimal(value: string): Decimal | null {
    if (!value) return null;
    // Remove currency symbols, commas, and whitespace
    let cleaned = value.toString().trim().replace(/[$,\s]/g, "");
    
    // Handle leading zeros: "076.46" should become "76.46"
    // But preserve "0.123" as is
    if (cleaned.match(/^0+[1-9]/)) {
      // Has leading zeros followed by non-zero digit
      // Remove leading zeros (e.g., "076.46" -> "76.46", "0123" -> "123")
      cleaned = cleaned.replace(/^0+/, '');
    }
    
    const num = parseFloat(cleaned);
    if (isNaN(num)) {
      // Try one more time with just removing all non-numeric except decimal point
      const fallback = cleaned.replace(/[^0-9.-]/g, '');
      const fallbackNum = parseFloat(fallback);
      if (!isNaN(fallbackNum)) {
        return new Decimal(fallbackNum);
      }
      return null;
    }
    return new Decimal(num);
  }

  protected parseDate(dateStr: string): Date | null {
    if (!dateStr) return null;
    
    // Clean the date string - remove timezone indicators and extra text
    let cleaned = dateStr.trim();
    
    // Remove common suffixes like "(UTC)", "(EST)", etc.
    cleaned = cleaned.replace(/\s*\([^)]*\)\s*$/i, '');
    
    // Try multiple date formats
    const formats = [
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/, // ISO format: 2024-09-22T12:00:00
      /^\d{4}-\d{2}-\d{2}/, // YYYY-MM-DD: 2024-09-22
      /^\d{2}\/\d{2}\/\d{4}/, // MM/DD/YYYY: 09/22/2024
      /^\d{2}-\d{2}-\d{4}/, // MM-DD-YYYY: 09-22-2024
      /^\d{1,2}\/\d{1,2}\/\d{4}/, // M/D/YYYY: 9/22/2024
      /^\d{1,2}-\d{1,2}-\d{4}/, // M-D-YYYY: 9-22-2024
    ];

    for (const format of formats) {
      if (format.test(cleaned)) {
        const date = new Date(cleaned);
        if (!isNaN(date.getTime())) {
          return date;
        }
      }
    }

    // Try parsing as-is (handles various formats)
    const date = new Date(cleaned);
    if (!isNaN(date.getTime())) {
      return date;
    }
    
    // Last attempt: try to parse MM-DD-YYYY format manually if other methods fail
    const mmddyyyy = cleaned.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/);
    if (mmddyyyy) {
      const month = parseInt(mmddyyyy[1]) - 1; // Month is 0-indexed
      const day = parseInt(mmddyyyy[2]);
      const year = parseInt(mmddyyyy[3]);
      const parsedDate = new Date(year, month, day);
      if (!isNaN(parsedDate.getTime())) {
        return parsedDate;
      }
    }
    
    return null;
  }

  protected parseTransactionType(typeStr: string): string {
    const lower = typeStr.toLowerCase();
    if (lower.includes("buy") || lower.includes("purchase")) return "Buy";
    if (lower.includes("sell")) return "Sell";
    if (lower.includes("send")) return "Send";
    if (lower.includes("receive")) return "Receive";
    if (lower.includes("swap") || lower.includes("trade")) return "Swap";
    if (lower.includes("deposit")) return "Deposit";
    if (lower.includes("withdraw")) return "Withdraw";
    if (lower.includes("reward") || lower.includes("staking")) return "Reward";
    if (lower.includes("fee")) return "Fee";
    return typeStr;
  }

  protected extractAssetSymbol(assetStr: string): string {
    if (!assetStr) return "";
    // Remove common prefixes/suffixes
    return assetStr
      .replace(/^[A-Z]+-/, "") // Remove exchange prefixes like "COINBASE-"
      .replace(/\s*\(.*?\)\s*/g, "") // Remove parentheses
      .trim()
      .toUpperCase();
  }

  /**
   * Parse swap information from transaction notes or asset symbol
   * Returns swap details if detected, null otherwise
   */
  protected parseSwapInfo(
    type: string,
    assetSymbol: string,
    notes: string | undefined,
    valueUsd: Decimal
  ): {
    incomingAsset: string | null;
    incomingAmount: Decimal | null;
    incomingValueUsd: Decimal | null;
  } | null {
    // Only process if type is swap
    if (type.toLowerCase() !== "swap" && !type.toLowerCase().includes("trade")) {
      return null;
    }

    const notesStr = notes || "";
    const combinedText = `${notesStr} ${assetSymbol}`.toLowerCase();

    // Pattern 1: "1.5 ETH → 3000 USDC" or "1.5 ETH for 3000 USDC"
    const swapPattern1 = /([\d.,]+)\s*(\w+)\s*(?:→|->|-|for|to)\s*([\d.,]+)\s*(\w+)/i;
    const match1 = combinedText.match(swapPattern1);
    if (match1) {
      const outgoingAsset = match1[2]?.toUpperCase();
      const incomingAsset = match1[4]?.toUpperCase();
      const incomingAmount = this.parseDecimal(match1[3]?.replace(/,/g, "") || "");

      // If outgoing asset matches current asset, we found the swap
      if (outgoingAsset === assetSymbol.toUpperCase() && incomingAsset && incomingAmount) {
        // For swaps, incoming value should equal outgoing value (minus fees)
        return {
          incomingAsset,
          incomingAmount,
          incomingValueUsd: new Decimal(Math.abs(Number(valueUsd))),
        };
      }
    }

    // Pattern 2: Asset symbol like "ETH/USDC" or "ETH→USDC"
    const assetPattern = /(\w+)\s*(?:\/|→|->|-)\s*(\w+)/i;
    const assetMatch = assetSymbol.match(assetPattern);
    if (assetMatch) {
      const outgoingAsset = assetMatch[1]?.toUpperCase();
      const incomingAsset = assetMatch[2]?.toUpperCase();

      if (outgoingAsset === assetSymbol.toUpperCase() && incomingAsset) {
        // Can't determine amount from symbol alone, but we know the asset
        return {
          incomingAsset,
          incomingAmount: null,
          incomingValueUsd: new Decimal(Math.abs(Number(valueUsd))),
        };
      }
    }

    // Pattern 3: Notes like "Swapped ETH for USDC"
    const swapPattern3 = /(?:swapped|swap|exchanged|exchange)\s+(\w+)\s+(?:for|to|→|->|-)\s+(\w+)/i;
    const match3 = combinedText.match(swapPattern3);
    if (match3) {
      const outgoingAsset = match3[1]?.toUpperCase();
      const incomingAsset = match3[2]?.toUpperCase();

      if (outgoingAsset === assetSymbol.toUpperCase() && incomingAsset) {
        return {
          incomingAsset,
          incomingAmount: null,
          incomingValueUsd: new Decimal(Math.abs(Number(valueUsd))),
        };
      }
    }

    return null;
  }

  /**
   * Get parser for specific exchange
   */
  static getParser(exchange: string): ExchangeCSVParser | null {
    switch (exchange.toLowerCase()) {
      case "coinbase":
        return new CoinbaseParser();
      case "binance":
        return new BinanceParser();
      case "kraken":
        return new KrakenParser();
      case "kucoin":
        return new KuCoinParser();
      case "gemini":
        return new GeminiParser();
      case "custom":
        return new CustomParser();
      default:
        return null;
    }
  }
}

/**
 * Coinbase CSV Parser
 * Expected columns: Timestamp, Transaction Type, Asset, Quantity Transacted, Spot Price at Transaction, Subtotal, Total (inclusive of fees), Fees, Notes
 */
class CoinbaseParser extends ExchangeCSVParser {
  parse(csvData: string[][]): ParsedTransaction[] {
    if (csvData.length < 2) return [];

    const headers = csvData[0];
    const rows = csvData.slice(1);

    const timestampIdx = this.findColumnIndex(headers, [
      "timestamp",
      "time",
      "date",
    ]);
    const typeIdx = this.findColumnIndex(headers, [
      "transaction type",
      "type",
      "transaction",
    ]);
    const assetIdx = this.findColumnIndex(headers, ["asset", "currency"]);
    const quantityIdx = this.findColumnIndex(headers, [
      "quantity transacted",
      "quantity",
      "amount",
    ]);
    const priceIdx = this.findColumnIndex(headers, [
      "spot price at transaction",
      "price",
      "spot price",
    ]);
    const totalIdx = this.findColumnIndex(headers, [
      "total (inclusive of fees)",
      "total",
      "value",
    ]);
    const feesIdx = this.findColumnIndex(headers, ["fees", "fee"]);
    const notesIdx = this.findColumnIndex(headers, ["notes", "note"]);

    const transactions: ParsedTransaction[] = [];

    for (const row of rows) {
      if (row.length === 0 || row.every((cell) => !cell.trim())) continue;

      try {
        const timestamp = this.parseDate(row[timestampIdx] || "");
        if (!timestamp) continue;

        const typeStr = row[typeIdx] || "";
        const type = this.parseTransactionType(typeStr);
        const asset = this.extractAssetSymbol(row[assetIdx] || "");
        if (!asset) continue;

        const quantity = this.parseDecimal(row[quantityIdx] || "");
        const price = this.parseDecimal(row[priceIdx] || "");
        const total = this.parseDecimal(row[totalIdx] || "");
        const fees = this.parseDecimal(row[feesIdx] || "");

        if (!quantity || !total) continue;

        // Calculate value_usd (use total if available, otherwise quantity * price)
        const valueUsd = total || (price && quantity ? quantity.mul(price) : quantity);
        
        // Convert fees to Decimal if present
        const feeUsd = fees || undefined;

        // Parse swap information if this is a swap
        const swapInfo = this.parseSwapInfo(type, asset, row[notesIdx], valueUsd);

        const transaction: ParsedTransaction = {
          type,
          asset_symbol: asset,
          amount_value: quantity,
          price_per_unit: price || undefined,
          value_usd: valueUsd,
          fee_usd: feeUsd,
          tx_timestamp: timestamp,
          notes: row[notesIdx] || undefined,
        };

        // Add swap fields if detected
        if (swapInfo) {
          transaction.incoming_asset_symbol = swapInfo.incomingAsset || undefined;
          transaction.incoming_amount_value = swapInfo.incomingAmount || undefined;
          transaction.incoming_value_usd = swapInfo.incomingValueUsd || undefined;
        }

        transactions.push(transaction);
      } catch (error) {
        console.error("Error parsing Coinbase transaction:", error, row);
        continue;
      }
    }

    return transactions;
  }
}

/**
 * Binance CSV Parser
 * Expected columns: Date(UTC), Pair, Type, Order Price, Order Amount, AvgTrading Price, Filled, Total, status
 */
class BinanceParser extends ExchangeCSVParser {
  parse(csvData: string[][]): ParsedTransaction[] {
    if (csvData.length < 2) return [];

    const headers = csvData[0];
    const rows = csvData.slice(1);

    const dateIdx = this.findColumnIndex(headers, ["date(utc)", "date", "time"]);
    const pairIdx = this.findColumnIndex(headers, ["pair", "market"]);
    const typeIdx = this.findColumnIndex(headers, ["type", "side"]);
    const amountIdx = this.findColumnIndex(headers, [
      "order amount",
      "amount",
      "filled",
    ]);
    const priceIdx = this.findColumnIndex(headers, [
      "avgtrading price",
      "price",
      "order price",
    ]);
    const totalIdx = this.findColumnIndex(headers, ["total", "value"]);

    const transactions: ParsedTransaction[] = [];

    for (const row of rows) {
      if (row.length === 0 || row.every((cell) => !cell.trim())) continue;

      try {
        const timestamp = this.parseDate(row[dateIdx] || "");
        if (!timestamp) continue;

        const pair = row[pairIdx] || "";
        const [baseAsset, quoteAsset] = pair.split("/").map((s) => s.trim());
        if (!baseAsset) continue;

        const typeStr = row[typeIdx] || "";
        const type = this.parseTransactionType(typeStr);
        const amount = this.parseDecimal(row[amountIdx] || "");
        const price = this.parseDecimal(row[priceIdx] || "");
        const total = this.parseDecimal(row[totalIdx] || "");

        if (!amount) continue;

        const valueUsd = total || (price ? amount.mul(price) : amount);

        // Binance trades are swaps
        // For "Sell": Selling baseAsset (outgoing) for quoteAsset (incoming)
        // For "Buy": Buying baseAsset (incoming) with quoteAsset (outgoing)
        const isSwap = type.toLowerCase() === "buy" || type.toLowerCase() === "sell";
        const transaction: ParsedTransaction = {
          type: isSwap ? "Swap" : type,
          asset_symbol: type.toLowerCase() === "sell" ? baseAsset.toUpperCase() : quoteAsset.toUpperCase(),
          amount_value: type.toLowerCase() === "sell" ? amount : (price ? valueUsd.div(price) : valueUsd),
          price_per_unit: price || undefined,
          value_usd: valueUsd,
          tx_timestamp: timestamp,
        };

        // Add incoming asset info for swaps
        if (isSwap && quoteAsset) {
          if (type.toLowerCase() === "sell") {
            // Selling baseAsset for quoteAsset
            transaction.incoming_asset_symbol = quoteAsset.toUpperCase();
            transaction.incoming_value_usd = valueUsd; // Incoming value equals outgoing value in swap
            // Incoming amount = value / price (if price available)
            if (price) {
              transaction.incoming_amount_value = valueUsd.div(price);
            }
          } else {
            // Buying baseAsset with quoteAsset
            transaction.incoming_asset_symbol = baseAsset.toUpperCase();
            transaction.incoming_amount_value = amount; // Amount of baseAsset received
            transaction.incoming_value_usd = valueUsd; // Value of baseAsset received
          }
        }

        transactions.push(transaction);
      } catch (error) {
        console.error("Error parsing Binance transaction:", error, row);
        continue;
      }
    }

    return transactions;
  }
}

/**
 * Kraken CSV Parser
 * Expected columns: txid, refid, time, type, subtype, aclass, asset, amount, fee, balance
 */
class KrakenParser extends ExchangeCSVParser {
  parse(csvData: string[][]): ParsedTransaction[] {
    if (csvData.length < 2) return [];

    const headers = csvData[0];
    const rows = csvData.slice(1);

    const timeIdx = this.findColumnIndex(headers, ["time", "date"]);
    const typeIdx = this.findColumnIndex(headers, ["type"]);
    const subtypeIdx = this.findColumnIndex(headers, ["subtype"]);
    const assetIdx = this.findColumnIndex(headers, ["asset", "currency"]);
    const amountIdx = this.findColumnIndex(headers, ["amount", "quantity"]);
    const feeIdx = this.findColumnIndex(headers, ["fee"]);
    const txidIdx = this.findColumnIndex(headers, ["txid", "tx_hash"]);

    const transactions: ParsedTransaction[] = [];

    for (const row of rows) {
      if (row.length === 0 || row.every((cell) => !cell.trim())) continue;

      try {
        const timestamp = this.parseDate(row[timeIdx] || "");
        if (!timestamp) continue;

        const type = this.parseTransactionType(row[typeIdx] || "");
        const subtype = row[subtypeIdx] || undefined;
        const asset = this.extractAssetSymbol(row[assetIdx] || "");
        if (!asset) continue;

        const amount = this.parseDecimal(row[amountIdx] || "");
        const fee = this.parseDecimal(row[feeIdx] || "");
        const txHash = row[txidIdx] || undefined;

        if (!amount) continue;

        // For Kraken, we need to estimate USD value (this might need price lookup)
        // For now, use amount as value_usd if it's already in USD, otherwise use amount
        const valueUsd = amount;

        transactions.push({
          type,
          subtype,
          asset_symbol: asset,
          amount_value: amount,
          value_usd: valueUsd,
          tx_hash: txHash,
          tx_timestamp: timestamp,
        });
      } catch (error) {
        console.error("Error parsing Kraken transaction:", error, row);
        continue;
      }
    }

    return transactions;
  }
}

/**
 * KuCoin CSV Parser
 * Expected columns: Time, Type, Side, Amount, Price, Volume, Fee, Fee Coin, Remark
 */
class KuCoinParser extends ExchangeCSVParser {
  parse(csvData: string[][]): ParsedTransaction[] {
    if (csvData.length < 2) return [];

    const headers = csvData[0];
    const rows = csvData.slice(1);

    const timeIdx = this.findColumnIndex(headers, ["time", "date"]);
    const typeIdx = this.findColumnIndex(headers, ["type"]);
    const sideIdx = this.findColumnIndex(headers, ["side"]);
    const amountIdx = this.findColumnIndex(headers, ["amount", "quantity"]);
    const priceIdx = this.findColumnIndex(headers, ["price"]);
    const volumeIdx = this.findColumnIndex(headers, ["volume", "total"]);
    const feeIdx = this.findColumnIndex(headers, ["fee"]);
    const remarkIdx = this.findColumnIndex(headers, ["remark", "notes"]);

    const transactions: ParsedTransaction[] = [];

    for (const row of rows) {
      if (row.length === 0 || row.every((cell) => !cell.trim())) continue;

      try {
        const timestamp = this.parseDate(row[timeIdx] || "");
        if (!timestamp) continue;

        const typeStr = row[typeIdx] || "";
        const side = row[sideIdx] || "";
        const type = side ? this.parseTransactionType(side) : this.parseTransactionType(typeStr);
        const amount = this.parseDecimal(row[amountIdx] || "");
        const price = this.parseDecimal(row[priceIdx] || "");
        const volume = this.parseDecimal(row[volumeIdx] || "");
        const fee = this.parseDecimal(row[feeIdx] || "");

        if (!amount) continue;

        // Extract asset from type or use a default (KuCoin format varies)
        const asset = "BTC"; // This would need to be extracted from the pair or type
        const valueUsd = volume || (price ? amount.mul(price) : amount);

        transactions.push({
          type,
          asset_symbol: asset,
          amount_value: amount,
          price_per_unit: price || undefined,
          value_usd: valueUsd,
          tx_timestamp: timestamp,
          notes: row[remarkIdx] || undefined,
        });
      } catch (error) {
        console.error("Error parsing KuCoin transaction:", error, row);
        continue;
      }
    }

    return transactions;
  }
}

/**
 * Gemini CSV Parser
 * Expected columns: Date, Time, Type, Symbol, USD Amount, USD Fee, Quantity, Price, Fee, Notes
 */
class GeminiParser extends ExchangeCSVParser {
  parse(csvData: string[][]): ParsedTransaction[] {
    if (csvData.length < 2) return [];

    const headers = csvData[0];
    const rows = csvData.slice(1);

    const dateIdx = this.findColumnIndex(headers, ["date"]);
    const timeIdx = this.findColumnIndex(headers, ["time"]);
    const typeIdx = this.findColumnIndex(headers, ["type"]);
    const symbolIdx = this.findColumnIndex(headers, ["symbol", "asset"]);
    const usdAmountIdx = this.findColumnIndex(headers, ["usd amount", "value"]);
    const quantityIdx = this.findColumnIndex(headers, ["quantity", "amount"]);
    const priceIdx = this.findColumnIndex(headers, ["price"]);
    const notesIdx = this.findColumnIndex(headers, ["notes"]);

    const transactions: ParsedTransaction[] = [];

    for (const row of rows) {
      if (row.length === 0 || row.every((cell) => !cell.trim())) continue;

      try {
        const date = row[dateIdx] || "";
        const time = row[timeIdx] || "";
        const timestamp = this.parseDate(`${date} ${time}`.trim());
        if (!timestamp) continue;

        const type = this.parseTransactionType(row[typeIdx] || "");
        const asset = this.extractAssetSymbol(row[symbolIdx] || "");
        if (!asset) continue;

        const usdAmount = this.parseDecimal(row[usdAmountIdx] || "");
        const quantity = this.parseDecimal(row[quantityIdx] || "");
        const price = this.parseDecimal(row[priceIdx] || "");

        if (!quantity) continue;

        const valueUsd = usdAmount || (price ? quantity.mul(price) : quantity);

        transactions.push({
          type,
          asset_symbol: asset,
          amount_value: quantity,
          price_per_unit: price || undefined,
          value_usd: valueUsd,
          tx_timestamp: timestamp,
          notes: row[notesIdx] || undefined,
        });
      } catch (error) {
        console.error("Error parsing Gemini transaction:", error, row);
        continue;
      }
    }

    return transactions;
  }
}

/**
 * Custom CSV Parser
 * Attempts to auto-detect columns based on common names
 * Also handles tax report format with proceeds, cost basis, etc.
 */
class CustomParser extends ExchangeCSVParser {
  parse(csvData: string[][]): ParsedTransaction[] {
    if (csvData.length < 2) return [];

    const headers = csvData[0];
    const rows = csvData.slice(1);

    // Check if this is a tax report format (has "Proceeds (USD)", "Cost Basis (USD)", etc.)
    // Also check for variations like "Proceeds (USD)", "Proceeds(USD)", "Proceeds", etc.
    const hasProceeds = this.findColumnIndex(headers, [
      "proceeds (usd)",
      "proceeds(usd)",
      "proceeds",
      "sale proceeds",
      "proceeds usd",
    ]) !== -1;
    const hasCostBasis = this.findColumnIndex(headers, [
      "cost basis (usd)",
      "cost basis(usd)",
      "cost basis",
      "basis",
      "cost basis usd",
    ]) !== -1;
    const hasDateSold = this.findColumnIndex(headers, [
      "date sold",
      "datesold",
      "sale date",
      "sold date",
      "disposal date",
    ]) !== -1;
    
    const isTaxReportFormat = hasProceeds && hasCostBasis && hasDateSold;
    
    if (isTaxReportFormat) {
      logBuffer.log("[CSV Parser] Detected tax report format");
      console.log("[CSV Parser] Detected tax report format");
      try {
        const result = this.parseTaxReportFormat(csvData);
        if (result.length > 0) {
          logBuffer.log(`[CSV Parser] Successfully parsed ${result.length} transactions using tax report format`);
          console.log(`[CSV Parser] Successfully parsed ${result.length} transactions using tax report format`);
          return result;
        }
        // If tax report format parsed 0 transactions, fall through to standard parser
        logBuffer.warn("[CSV Parser] Tax report format detected but parsed 0 transactions, trying standard parser");
        console.warn("[CSV Parser] Tax report format detected but parsed 0 transactions, trying standard parser");
      } catch (taxFormatError) {
        logBuffer.error("[CSV Parser] Error in tax report parser:", taxFormatError);
        logBuffer.warn("[CSV Parser] Falling back to standard custom parser");
        console.error("[CSV Parser] Error in tax report parser:", taxFormatError);
        console.warn("[CSV Parser] Falling back to standard custom parser");
        // Fall through to standard parser - don't throw, let it try standard parsing
      }
    }

    // Try to find common column names for standard transaction format
    // Also check for tax report format columns as fallback
    const dateIdx = this.findColumnIndex(headers, [
      "date",
      "time",
      "timestamp",
      "datetime",
      "date sold",
      "date purchased",
      "sold date",
      "purchase date",
    ]);
    const typeIdx = this.findColumnIndex(headers, [
      "type",
      "transaction type",
      "transaction",
      "action",
      "sale type",
    ]);
    const assetIdx = this.findColumnIndex(headers, [
      "asset",
      "currency",
      "symbol",
      "coin",
      "token",
    ]);
    const amountIdx = this.findColumnIndex(headers, [
      "amount",
      "quantity",
      "qty",
    ]);
    const priceIdx = this.findColumnIndex(headers, ["price", "rate"]);
    const valueIdx = this.findColumnIndex(headers, [
      "value",
      "total",
      "usd",
      "usd value",
      "proceeds (usd)",
      "proceeds",
      "proceeds usd",
    ]);
    
    console.log(`[Custom Parser] Column indices - Date: ${dateIdx}, Type: ${typeIdx}, Asset: ${assetIdx}, Amount: ${amountIdx}, Value: ${valueIdx}`);

    const transactions: ParsedTransaction[] = [];

    for (const row of rows) {
      if (row.length === 0 || row.every((cell) => !cell.trim())) continue;

      try {
        const timestamp = this.parseDate(row[dateIdx] || "");
        if (!timestamp) continue;

        const type = this.parseTransactionType(row[typeIdx] || "");
        const asset = this.extractAssetSymbol(row[assetIdx] || "");
        if (!asset) continue;

        const amount = this.parseDecimal(row[amountIdx] || "");
        const price = this.parseDecimal(row[priceIdx] || "");
        const value = this.parseDecimal(row[valueIdx] || "");

        if (!amount) continue;

        const valueUsd = value || (price ? amount.mul(price) : amount);

        transactions.push({
          type,
          asset_symbol: asset,
          amount_value: amount,
          price_per_unit: price || undefined,
          value_usd: valueUsd,
          tx_timestamp: timestamp,
        });
      } catch (error) {
        console.error("Error parsing custom transaction:", error, row);
        continue;
      }
    }

    return transactions;
  }

  /**
   * Parse tax report format with proceeds, cost basis, profit, etc.
   * Format: Name, Date Purchased, Date Sold, Sale Type, Num. Days Held, etc.
   */
  private parseTaxReportFormat(csvData: string[][]): ParsedTransaction[] {
    logBuffer.log(`[Tax Report Parser] Starting to parse tax report format, ${csvData?.length || 0} rows`);
    
    if (!csvData || csvData.length < 2) {
      logBuffer.warn("[Tax Report Parser] CSV data is empty or invalid");
      return [];
    }

    const headers = csvData[0];
    const rows = csvData.slice(1);

    if (!headers || headers.length === 0) {
      logBuffer.warn("[Tax Report Parser] CSV headers are missing or empty");
      return [];
    }
    
    logBuffer.log(`[Tax Report Parser] Processing ${rows.length} data rows with ${headers.length} columns`);

    // Find column indices
    const nameIdx = this.findColumnIndex(headers, ["name", "description"]);
    const datePurchasedIdx = this.findColumnIndex(headers, [
      "date purchased",
      "purchase date",
      "date acquired",
      "acquired date",
    ]);
    const dateSoldIdx = this.findColumnIndex(headers, [
      "date sold",
      "sale date",
      "sold date",
      "disposal date",
    ]);
    const saleTypeIdx = this.findColumnIndex(headers, [
      "sale type",
      "type",
      "transaction type",
    ]);
    const daysHeldIdx = this.findColumnIndex(headers, [
      "num. days held",
      "num days held",
      "days held",
      "holding period",
      "days",
    ]);
    const purchasedTxnIdx = this.findColumnIndex(headers, [
      "purchased txn",
      "purchase txn",
      "buy txn",
    ]);
    const soldTxnIdx = this.findColumnIndex(headers, [
      "sold txn",
      "sell txn",
      "sale txn",
    ]);
    const notesIdx = this.findColumnIndex(headers, [
      "sold txn notes",
      "notes",
      "note",
      "description",
    ]);
    const amountIdx = this.findColumnIndex(headers, [
      "amount",
      "quantity",
      "qty",
    ]);
    const assetIdx = this.findColumnIndex(headers, [
      "asset",
      "currency",
      "symbol",
      "coin",
      "token",
    ]);
    const proceedsIdx = this.findColumnIndex(headers, [
      "proceeds (usd)",
      "proceeds",
      "sale proceeds",
      "proceeds usd",
    ]);
    const costBasisIdx = this.findColumnIndex(headers, [
      "cost basis (usd)",
      "cost basis",
      "basis",
      "cost basis usd",
    ]);
    
    // Log column indices for debugging
    logBuffer.log(`[Tax Report Parser] Column indices - Date Sold: ${dateSoldIdx}, Asset: ${assetIdx}, Amount: ${amountIdx}, Proceeds: ${proceedsIdx}, Cost Basis: ${costBasisIdx}`);
    logBuffer.log(`[Tax Report Parser] All headers (${headers.length}):`, headers);
    
    // Use fallback positions if columns not found by name
    // Based on user's format: Name(0), Date Purchased(1), Date Sold(2), Sale Type(3), Num. Days Held(4),
    // Purchased Txn(5), Sold Txn(6), Sold Txn Notes(7), Amount(8), Asset(9), Proceeds (USD)(10), Cost Basis (USD)(11), Profit (USD)(12)
    const finalDateSoldIdx = dateSoldIdx >= 0 ? dateSoldIdx : (headers.length > 2 ? 2 : -1);
    const finalDatePurchasedIdx = datePurchasedIdx >= 0 ? datePurchasedIdx : (headers.length > 1 ? 1 : -1);
    const finalAssetIdx = assetIdx >= 0 ? assetIdx : (headers.length > 9 ? 9 : -1);
    const finalAmountIdx = amountIdx >= 0 ? amountIdx : (headers.length > 8 ? 8 : -1);
    const finalProceedsIdx = proceedsIdx >= 0 ? proceedsIdx : (headers.length > 10 ? 10 : -1);
    const finalCostBasisIdx = costBasisIdx >= 0 ? costBasisIdx : (headers.length > 11 ? 11 : -1);
    
    logBuffer.log(`[Tax Report Parser] Column indices - Date Purchased: ${finalDatePurchasedIdx}, Date Sold: ${finalDateSoldIdx}, Cost Basis: ${finalCostBasisIdx}, Asset: ${finalAssetIdx}`);
    logBuffer.log(`[Tax Report Parser] Found column indices - proceedsIdx: ${proceedsIdx}, costBasisIdx: ${costBasisIdx}, datePurchasedIdx: ${datePurchasedIdx}`);
    logBuffer.log(`[Tax Report Parser] Final indices - finalProceedsIdx: ${finalProceedsIdx}, finalCostBasisIdx: ${finalCostBasisIdx}, finalDatePurchasedIdx: ${finalDatePurchasedIdx}`);
    
    // Log first row to see actual data
    if (rows.length > 0) {
      logBuffer.log(`[Tax Report Parser] First row (${rows[0].length} columns)`, rows[0]);
      if (finalCostBasisIdx >= 0 && finalCostBasisIdx < rows[0].length) {
        logBuffer.log(`[Tax Report Parser] First row cost basis value at index ${finalCostBasisIdx}: "${rows[0][finalCostBasisIdx]}"`);
      }
      if (finalProceedsIdx >= 0 && finalProceedsIdx < rows[0].length) {
        logBuffer.log(`[Tax Report Parser] First row proceeds value at index ${finalProceedsIdx}: "${rows[0][finalProceedsIdx]}"`);
      }
    }
    
    logBuffer.log(`[Tax Report Parser] Final column indices (with fallbacks) - Date Sold: ${finalDateSoldIdx}, Asset: ${finalAssetIdx}, Amount: ${finalAmountIdx}, Proceeds: ${finalProceedsIdx}, Cost Basis: ${finalCostBasisIdx}`);
    
    // Validate required columns (after fallback) - be more lenient
    const missingColumns: string[] = [];
    if (finalDateSoldIdx === -1) missingColumns.push("Date Sold");
    if (finalAssetIdx === -1) missingColumns.push("Asset");
    if (finalAmountIdx === -1) missingColumns.push("Amount");
    if (finalProceedsIdx === -1) missingColumns.push("Proceeds (USD)");
    
    // Log warning but don't throw error - try to parse anyway with fallback positions
    if (missingColumns.length > 0) {
      console.warn(`[Tax Report Parser] Some columns not found by name: ${missingColumns.join(", ")}. Using fallback positions. Headers: ${headers.join(", ")}`);
      // Don't throw - we'll use fallback positions
    }
    
    // Final validation - only throw if we truly can't parse (no fallback positions available)
    // But be very lenient - if we have enough columns, use fallback positions
    if (finalDateSoldIdx === -1) {
      if (headers.length < 3) {
        const errorMsg = `Cannot find Date Sold column and CSV has too few columns (${headers.length}). Found headers: ${headers.join(", ")}.`;
        console.error(`[Tax Report Parser] ${errorMsg}`);
        throw new Error(errorMsg);
      }
      console.warn(`[Tax Report Parser] Date Sold not found by name, using fallback position 2`);
    }
    
    if (finalAssetIdx === -1) {
      if (headers.length < 10) {
        const errorMsg = `Cannot find Asset column and CSV has too few columns (${headers.length}). Found headers: ${headers.join(", ")}.`;
        console.error(`[Tax Report Parser] ${errorMsg}`);
        throw new Error(errorMsg);
      }
      console.warn(`[Tax Report Parser] Asset not found by name, using fallback position 9`);
    }
    
    if (finalAmountIdx === -1) {
      if (headers.length < 9) {
        const errorMsg = `Cannot find Amount column and CSV has too few columns (${headers.length}). Found headers: ${headers.join(", ")}.`;
        console.error(`[Tax Report Parser] ${errorMsg}`);
        throw new Error(errorMsg);
      }
      console.warn(`[Tax Report Parser] Amount not found by name, using fallback position 8`);
    }
    
    if (finalProceedsIdx === -1) {
      if (headers.length < 11) {
        const errorMsg = `Cannot find Proceeds (USD) column and CSV has too few columns (${headers.length}). Found headers: ${headers.join(", ")}.`;
        console.error(`[Tax Report Parser] ${errorMsg}`);
        throw new Error(errorMsg);
      }
      console.warn(`[Tax Report Parser] Proceeds not found by name, using fallback position 10`);
    }
    const profitIdx = this.findColumnIndex(headers, [
      "profit (usd)",
      "profit",
      "gain (usd)",
      "gain",
      "gain/loss",
    ]);

    const transactions: ParsedTransaction[] = [];
    let skippedRows = 0;
    const skipReasons: Record<string, number> = {};

    // Log first few rows for debugging
    if (rows.length > 0) {
      logBuffer.log(`[Tax Report Parser] First row sample (${rows[0].length} columns):`, rows[0].slice(0, 13));
      if (rows.length > 1) {
        logBuffer.log(`[Tax Report Parser] Second row sample:`, rows[1].slice(0, 13));
      }
    }

    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
      const row = rows[rowIndex];
      if (row.length === 0 || row.every((cell) => !cell.trim())) {
        skippedRows++;
        skipReasons["empty_row"] = (skipReasons["empty_row"] || 0) + 1;
        continue;
      }

      try {
        // Date Sold is the transaction date (taxable event) - use final index (with fallback)
        const dateSoldValue = (finalDateSoldIdx >= 0 && finalDateSoldIdx < row.length) 
          ? (row[finalDateSoldIdx] || "") 
          : "";
        
        const dateSold = this.parseDate(dateSoldValue);
        if (rowIndex < 5) {
          logBuffer.log(`[Tax Report Parser] Row ${rowIndex + 2}: dateSoldValue="${dateSoldValue}", parsed date=${dateSold ? dateSold.toISOString().split("T")[0] : "null"}`);
        }
        if (!dateSold) {
          skippedRows++;
          skipReasons["missing_date_sold"] = (skipReasons["missing_date_sold"] || 0) + 1;
          if (rowIndex < 5 || skippedRows <= 10) {
            logBuffer.warn(`[Tax Report Parser] Row ${rowIndex + 2} skipped: missing date sold. Date Sold column index: ${finalDateSoldIdx}, Value: "${dateSoldValue}", Row data:`, row.slice(0, 5));
            console.warn(`[Tax Report Parser] Row ${rowIndex + 2} skipped: missing date sold. Date Sold column index: ${finalDateSoldIdx}, Value: "${dateSoldValue}", Row data:`, row.slice(0, 5));
          }
          continue;
        }

        // Asset is required - use final index (with fallback)
        const assetValue = (finalAssetIdx >= 0 && finalAssetIdx < row.length)
          ? (row[finalAssetIdx] || "")
          : "";
        
        const asset = this.extractAssetSymbol(assetValue);
        if (rowIndex < 5) {
          logBuffer.log(`[Tax Report Parser] Row ${rowIndex + 2}: assetValue="${assetValue}", extracted asset="${asset}"`);
        }
        if (!asset) {
          skippedRows++;
          skipReasons["missing_asset"] = (skipReasons["missing_asset"] || 0) + 1;
          if (rowIndex < 5 || skippedRows <= 10) {
            logBuffer.warn(`[Tax Report Parser] Row ${rowIndex + 2} skipped: missing asset. Asset column index: ${finalAssetIdx}, Value: "${assetValue}", Row data:`, row.slice(0, 12));
            console.warn(`[Tax Report Parser] Row ${rowIndex + 2} skipped: missing asset. Asset column index: ${finalAssetIdx}, Value: "${assetValue}", Row data:`, row.slice(0, 12));
          }
          continue;
        }

        // Amount sold - use final index (with fallback)
        const amountValue = (finalAmountIdx >= 0 && finalAmountIdx < row.length)
          ? (row[finalAmountIdx] || "")
          : "";
        
        const amount = this.parseDecimal(amountValue);
        if (!amount || Number(amount) === 0) {
          skippedRows++;
          skipReasons["missing_or_zero_amount"] = (skipReasons["missing_or_zero_amount"] || 0) + 1;
          if (rowIndex < 5 || skippedRows <= 10) {
            logBuffer.warn(`[Tax Report Parser] Row ${rowIndex + 2} skipped: missing or zero amount. Amount column index: ${finalAmountIdx}, Value: "${amountValue}", Row length: ${row.length}`);
            console.warn(`[Tax Report Parser] Row ${rowIndex + 2} skipped: missing or zero amount. Amount column index: ${finalAmountIdx}, Value: "${amountValue}"`);
          }
          continue;
        }

        // Proceeds (USD) - this is the sale value - use final index (with fallback)
        let proceedsValue = (finalProceedsIdx >= 0 && finalProceedsIdx < row.length)
          ? (row[finalProceedsIdx] || "")
          : "";
        
        // Try to parse proceeds - be more lenient
        let proceeds = this.parseDecimal(proceedsValue);
        
        // Log proceeds parsing for first few rows
        if (rowIndex < 5) {
          logBuffer.log(`[Tax Report Parser] Row ${rowIndex + 2}: proceedsValue="${proceedsValue}", parsed proceeds=${proceeds ? Number(proceeds).toFixed(2) : "null"}, type=${proceeds ? typeof proceeds : "null"}`);
        }
        
        // If parsing failed, try adjacent columns (sometimes columns might be shifted)
        if (proceeds === null && finalProceedsIdx >= 0) {
          // Try one column before and after
          for (const offset of [-1, 1, -2, 2]) {
            const tryIdx = finalProceedsIdx + offset;
            if (tryIdx >= 0 && tryIdx < row.length) {
              const tryValue = this.parseDecimal(row[tryIdx] || "");
              if (tryValue !== null && Number(tryValue) > 0) {
                proceeds = tryValue;
                if (rowIndex === 0) {
                  logBuffer.warn(`[Tax Report Parser] Found proceeds at offset ${offset} from expected column ${finalProceedsIdx}`);
                  console.warn(`[Tax Report Parser] Found proceeds at offset ${offset} from expected column ${finalProceedsIdx}`);
                }
                break;
              }
            }
          }
        }
        
        // If still no proceeds, try to calculate from cost basis + profit
        if (proceeds === null) {
          const costBasisValue = (finalCostBasisIdx >= 0 && finalCostBasisIdx < row.length)
            ? (row[finalCostBasisIdx] || "")
            : "";
          const costBasis = this.parseDecimal(costBasisValue);
          
          // Use the profitIdx already declared at function scope (line 1007)
          const profitValue = (profitIdx >= 0 && profitIdx < row.length)
            ? (row[profitIdx] || "")
            : (row.length > 12 ? row[12] : ""); // Fallback to index 12
          const profit = this.parseDecimal(profitValue);
          
          if (costBasis !== null && profit !== null) {
            // Proceeds = Cost Basis + Profit
            proceeds = new Decimal(Number(costBasis) + Number(profit));
            if (rowIndex === 0) {
              logBuffer.warn(`[Tax Report Parser] Calculated proceeds from cost basis + profit: ${Number(proceeds)}`);
              console.warn(`[Tax Report Parser] Calculated proceeds from cost basis + profit: ${Number(proceeds)}`);
            }
          }
        }
        
        // Last resort: if we have amount and a reasonable value in adjacent columns, use that
        if (proceeds === null && amount) {
          // Look for a USD value near the proceeds column
          for (let offset = -3; offset <= 3; offset++) {
            const tryIdx = finalProceedsIdx + offset;
            if (tryIdx >= 0 && tryIdx < row.length && tryIdx !== finalAmountIdx && tryIdx !== finalAssetIdx) {
              const tryValue = this.parseDecimal(row[tryIdx] || "");
              if (tryValue !== null && Number(tryValue) > 0 && Number(tryValue) < 1000000) {
                proceeds = tryValue;
                if (rowIndex === 0) {
                  logBuffer.warn(`[Tax Report Parser] Using value from column ${tryIdx} as proceeds: ${Number(proceeds)}`);
                  console.warn(`[Tax Report Parser] Using value from column ${tryIdx} as proceeds: ${Number(proceeds)}`);
                }
                break;
              }
            }
          }
        }
        
        // Check if proceeds is missing (null/undefined) vs. zero (valid for losses)
        // Proceeds can be 0 for losses, so we only skip if proceeds is null/undefined
        // Use explicit null check instead of !proceeds to handle Decimal(0) correctly
        if (proceeds === null || proceeds === undefined) {
          skippedRows++;
          skipReasons["missing_proceeds"] = (skipReasons["missing_proceeds"] || 0) + 1;
          if (rowIndex < 5 || skippedRows <= 10) {
            logBuffer.error(`[Tax Report Parser] Row ${rowIndex + 2} skipped: missing proceeds. Proceeds column index: ${finalProceedsIdx}, Value: "${proceedsValue}", Row length: ${row.length}, Row sample:`, row.slice(0, 13));
            console.warn(`[Tax Report Parser] Row ${rowIndex + 2} skipped: missing proceeds. Proceeds column index: ${finalProceedsIdx}, Value: "${proceedsValue}", Row length: ${row.length}, Row sample:`, row.slice(0, 13));
          }
          continue;
        }
        
        // Proceeds is valid (including 0) - log for first few rows
        if (rowIndex < 5) {
          const proceedsNum = Number(proceeds);
          if (proceedsNum === 0) {
            logBuffer.log(`[Tax Report Parser] Row ${rowIndex + 2}: Proceeds is 0 (valid for losses - will result in loss equal to cost basis)`);
          }
        }
        
        // Proceeds is 0 or a valid number - both are acceptable
        // 0 proceeds means the asset was sold/disposed for $0 (a loss equal to cost basis)
        const proceedsNum = Number(proceeds);
        if (rowIndex < 5 && proceedsNum === 0) {
          console.log(`[Tax Report Parser] Row ${rowIndex + 2}: Proceeds is 0 (valid for losses - will result in loss equal to cost basis)`);
        }

        // Cost Basis (USD) - use final index (with fallback)
        const costBasisValue = (finalCostBasisIdx >= 0 && finalCostBasisIdx < row.length)
          ? (row[finalCostBasisIdx] || "")
          : "";
        const costBasis = this.parseDecimal(costBasisValue);
        
        // Debug cost basis parsing for first few rows - ALWAYS log for debugging
        if (rowIndex < 10) {
          logBuffer.log(`[Tax Report Parser] Row ${rowIndex + 2}: ===== COST BASIS PARSING =====`);
          logBuffer.log(`[Tax Report Parser] Row ${rowIndex + 2}: finalCostBasisIdx=${finalCostBasisIdx}, row.length=${row.length}`);
          logBuffer.log(`[Tax Report Parser] Row ${rowIndex + 2}: costBasisValue="${costBasisValue}"`);
          logBuffer.log(`[Tax Report Parser] Row ${rowIndex + 2}: parsed costBasis=${costBasis ? Number(costBasis).toFixed(2) : "null"}`);
          if (finalCostBasisIdx >= 0 && finalCostBasisIdx < row.length) {
            logBuffer.log(`[Tax Report Parser] Row ${rowIndex + 2}: Raw cost basis cell value: "${row[finalCostBasisIdx]}"`);
            logBuffer.log(`[Tax Report Parser] Row ${rowIndex + 2}: All row values:`, row);
          } else {
            logBuffer.error(`[Tax Report Parser] Row ${rowIndex + 2}: Cost basis index ${finalCostBasisIdx} is out of bounds! row.length=${row.length}`);
          }
        }

        // Profit (USD) - gain/loss
        const profit = this.parseDecimal(row[profitIdx] || "");

        // Calculate price per unit from proceeds (reuse proceedsNum declared above)
        const amountNum = Number(amount);
        const pricePerUnit = amountNum > 0 
          ? new Decimal(proceedsNum / amountNum)
          : null;

        // Build notes from available information first (needed for type determination)
        let notes = row[notesIdx] || "";
        const name = row[nameIdx] || "";
        if (name && !notes.includes(name)) {
          notes = notes ? `${name}. ${notes}` : name;
        }

        // Determine transaction type from Sale Type field
        let type = "Sell"; // Default for tax reports (they're all sales/disposals)
        const saleType = (row[saleTypeIdx] || "").trim();
        const saleTypeLower = saleType.toLowerCase();

        // Map Sale Type to transaction type
        if (saleTypeLower.includes("swap") || saleTypeLower.includes("trade") || saleTypeLower.includes("exchange")) {
          type = "Swap";
        } else if (saleTypeLower.includes("send") || saleTypeLower.includes("transfer") || saleTypeLower.includes("bridge")) {
          type = "Send";
        } else if (saleTypeLower.includes("staking") || saleTypeLower.includes("stake") || saleTypeLower.includes("reward")) {
          type = "Staking";
        } else if (saleTypeLower.includes("liquidity") || saleTypeLower.includes("lp")) {
          type = "Add Liquidity";
        } else if (saleTypeLower.includes("nft")) {
          type = "NFT Sale";
        } else if (saleTypeLower.includes("dca") || saleTypeLower.includes("dollar cost")) {
          type = "DCA";
        } else if (saleTypeLower.includes("sell") || saleTypeLower.includes("sale") || saleTypeLower.includes("disposal")) {
          type = "Sell";
        } else if (saleTypeLower.includes("short term") || saleTypeLower.includes("long term")) {
          // These are capital gains categories, still a "Sell"
          type = "Sell";
        }

        // If no sale type but we have swap indicators, mark as swap
        if (type === "Sell" && (notes?.toLowerCase().includes("swap") || notes?.toLowerCase().includes("jupiter") || notes?.toLowerCase().includes("trade"))) {
          type = "Swap";
        }

        // Build initial notes from row data (will be enhanced for sell transaction below)
        // Don't add cost basis here - we'll add it to the sell transaction notes specifically
        // This keeps the notes clean and ensures cost basis is always in the sell transaction

        // For tax report format with paired buy/sell data, create TWO transactions:
        // 1. A BUY transaction (from Date Purchased and Cost Basis)
        // 2. A SELL transaction (from Date Sold and Proceeds)
        // This allows the tax calculator to properly track cost basis lots
        
        // Get purchase date using final index (with fallback)
        const datePurchasedValue = (finalDatePurchasedIdx >= 0 && finalDatePurchasedIdx < row.length)
          ? (row[finalDatePurchasedIdx] || "")
          : "";
        const datePurchased = this.parseDate(datePurchasedValue);
        
        // Create BUY transaction if we have purchase date and cost basis
        // Note: costBasis is already declared above at line 1163
        if (datePurchased && costBasis && Number(costBasis) > 0) {
          const buyTransaction: ParsedTransaction = {
            type: "Buy",
            asset_symbol: asset,
            amount_value: amount, // Same amount as the sell
            price_per_unit: costBasis.div(amount), // Cost basis per unit
            value_usd: costBasis.neg(), // Negative value for buys (standard convention)
            tx_timestamp: datePurchased,
            notes: `Tax report format - Purchase for sale on ${dateSold.toISOString().split("T")[0]}${row[purchasedTxnIdx] ? ` | Purchase Txn: ${row[purchasedTxnIdx].trim()}` : ""}`,
          };
          
          if (row[purchasedTxnIdx]) {
            buyTransaction.tx_hash = row[purchasedTxnIdx].trim();
          }
          
          transactions.push(buyTransaction);
        if (rowIndex < 5) {
          logBuffer.log(`[Tax Report Parser] Created BUY transaction: date=${datePurchased.toISOString().split("T")[0]}, costBasis=${Number(costBasis).toFixed(2)}, asset=${asset}, amount=${Number(amount).toFixed(4)}`);
          console.log(`[Tax Report Parser] Created BUY transaction: date=${datePurchased.toISOString().split("T")[0]}, costBasis=${Number(costBasis).toFixed(2)}, asset=${asset}, amount=${Number(amount).toFixed(4)}`);
        }
      } else if (rowIndex < 5) {
        logBuffer.warn(`[Tax Report Parser] Skipping BUY transaction creation: datePurchased=${datePurchased ? datePurchased.toISOString().split("T")[0] : "missing"}, costBasis=${costBasis ? Number(costBasis).toFixed(2) : "missing"}`);
        console.warn(`[Tax Report Parser] Skipping BUY transaction creation: datePurchased=${datePurchased ? datePurchased.toISOString().split("T")[0] : "missing"}, costBasis=${costBasis ? Number(costBasis).toFixed(2) : "missing"}`);
      }

        // Create the SELL transaction
        // Build notes with cost basis and purchase date for tax calculator
        let sellNotes = notes || "";
        
        // CRITICAL: ALWAYS add cost basis to notes if it was parsed from CSV
        // Even if costBasis is 0, we need to record it for tax calculation
        // Check if costBasis was successfully parsed (not null/undefined)
        // costBasis is a Decimal object or null
        let costBasisNum: number | null = null;
        if (costBasis !== null && costBasis !== undefined) {
          try {
            costBasisNum = Number(costBasis);
            // Check if it's a valid number (not NaN)
            if (isNaN(costBasisNum)) {
              costBasisNum = null;
            }
          } catch (e) {
            costBasisNum = null;
          }
        }
        
        if (rowIndex < 5) {
          logBuffer.log(`[Tax Report Parser] Row ${rowIndex + 2}: costBasisValue="${costBasisValue}", costBasis=${costBasis ? Number(costBasis).toFixed(2) : "null"}, costBasisNum=${costBasisNum}, costBasis type=${typeof costBasis}`);
          logBuffer.log(`[Tax Report Parser] Row ${rowIndex + 2}: Full row data (first 13 cols):`, row.slice(0, 13));
        }
        
        // ALWAYS add cost basis if we have a valid number (including 0)
        if (costBasisNum !== null && !isNaN(costBasisNum)) {
          // Include cost basis even if 0 (for cases where proceeds=0 and costBasis=0)
          sellNotes = sellNotes
            ? `${sellNotes} | Cost Basis: $${costBasisNum.toFixed(2)}`
            : `Cost Basis: $${costBasisNum.toFixed(2)}`;
          if (rowIndex < 5) {
            logBuffer.log(`[Tax Report Parser] Row ${rowIndex + 2}: Added cost basis to notes: $${costBasisNum.toFixed(2)}`);
          }
        } else {
          // Cost basis is missing - this is a problem!
          if (rowIndex < 5) {
            logBuffer.error(`[Tax Report Parser] Row ${rowIndex + 2}: Cost basis NOT ADDED! costBasisValue="${costBasisValue}", costBasis=${costBasis}, costBasisNum=${costBasisNum}, finalCostBasisIdx=${finalCostBasisIdx}, row.length=${row.length}`);
            logBuffer.error(`[Tax Report Parser] Row ${rowIndex + 2}: Cell at index ${finalCostBasisIdx}: "${row[finalCostBasisIdx]}"`);
          }
        }
        
        // Add purchase date to notes (required for holding period calculation)
        if (datePurchased) {
          sellNotes = sellNotes
            ? `${sellNotes} | Purchased: ${datePurchased.toISOString().split("T")[0]}`
            : `Purchased: ${datePurchased.toISOString().split("T")[0]}`;
        }
        
        // Add profit if available
        if (profit) {
          const profitNum = Number(profit);
          const profitLabel = profitNum > 0 ? "Gain" : "Loss";
          sellNotes = sellNotes
            ? `${sellNotes} | ${profitLabel}: $${Math.abs(profitNum).toFixed(2)}`
            : `${profitLabel}: $${Math.abs(profitNum).toFixed(2)}`;
        }
        
        // Add holding period if available
        const daysHeld = row[daysHeldIdx];
        if (daysHeld) {
          const days = parseInt(daysHeld) || 0;
          const holdingPeriod = days >= 365 ? "Long-term" : "Short-term";
          sellNotes = sellNotes
            ? `${sellNotes} | ${holdingPeriod} (${days} days)`
            : `${holdingPeriod} (${days} days)`;
        }
        
        // CRITICAL: Ensure notes are set even if empty - we need cost basis!
        // If sellNotes is empty but we should have cost basis, create a minimal note
        if ((!sellNotes || !sellNotes.trim()) && costBasisNum !== null && !isNaN(costBasisNum)) {
          // This shouldn't happen, but as a fallback, create notes with just cost basis
          sellNotes = `Cost Basis: $${costBasisNum.toFixed(2)}`;
          logBuffer.warn(`[Tax Report Parser] Row ${rowIndex + 2}: sellNotes was empty but costBasis exists! Created fallback notes: ${sellNotes}`);
        }
        
        const finalNotes = sellNotes && sellNotes.trim() ? sellNotes.trim() : undefined;
        
        const sellTransaction: ParsedTransaction = {
          type,
          asset_symbol: asset,
          amount_value: amount,
          price_per_unit: pricePerUnit || undefined,
          value_usd: proceeds, // Proceeds is the sale value
          tx_timestamp: dateSold,
          notes: finalNotes,
        };
        
        // Log notes for debugging - ALWAYS log for first 10 rows
        if (rowIndex < 10) {
          logBuffer.log(`[Tax Report Parser] Row ${rowIndex + 2}: FINAL NOTES CHECK`);
          logBuffer.log(`[Tax Report Parser] Row ${rowIndex + 2}: sellNotes="${sellNotes}", finalNotes="${finalNotes}", hasNotes=${!!finalNotes}`);
          logBuffer.log(`[Tax Report Parser] Row ${rowIndex + 2}: costBasisValue="${costBasisValue}", costBasis=${costBasis ? Number(costBasis).toFixed(2) : "null"}, costBasisNum=${costBasisNum}`);
          if (!finalNotes) {
            logBuffer.error(`[Tax Report Parser] Row ${rowIndex + 2}: NO NOTES IN TRANSACTION! This will cause tax calculation to fail!`);
            logBuffer.error(`[Tax Report Parser] Row ${rowIndex + 2}: sellNotes="${sellNotes}", costBasisNum=${costBasisNum}, datePurchased=${datePurchased ? datePurchased.toISOString().split('T')[0] : "null"}`);
          } else {
            logBuffer.log(`[Tax Report Parser] Row ${rowIndex + 2}: Notes generated (${finalNotes.length} chars): ${finalNotes.substring(0, 200)}`);
          }
        }

        // Add transaction references if available
        if (row[soldTxnIdx]) {
          sellTransaction.tx_hash = row[soldTxnIdx].trim();
        }
        if (row[purchasedTxnIdx] && sellTransaction.notes) {
          sellTransaction.notes = `${sellTransaction.notes} | Purchase Txn: ${row[purchasedTxnIdx].trim()}`;
        }

        transactions.push(sellTransaction);
        // Only log first 5 to avoid spam
        if (rowIndex < 5) {
          logBuffer.log(`[Tax Report Parser] Created SELL transaction: date=${dateSold.toISOString().split("T")[0]}, proceeds=${Number(proceeds).toFixed(2)}, asset=${asset}, notes=${sellNotes ? "YES" : "NO"}`);
        }
      } catch (error) {
        skippedRows++;
        skipReasons["parse_error"] = (skipReasons["parse_error"] || 0) + 1;
        console.error(`[Tax Report Parser] Row ${rowIndex + 2} error:`, error instanceof Error ? error.message : "Unknown error", "Row data:", row.slice(0, 5));
        continue;
      }
    }

    logBuffer.log(`[Tax Report Parser] ===== PARSING COMPLETE =====`);
    logBuffer.log(`[Tax Report Parser] Parsed ${transactions.length} transactions, skipped ${skippedRows} rows out of ${rows.length} total rows`);
    logBuffer.log(`[Tax Report Parser] Skip reasons breakdown:`, skipReasons);
    console.log(`[Tax Report Parser] Parsed ${transactions.length} transactions, skipped ${skippedRows} rows. Skip reasons:`, skipReasons);
    
    // Count transactions with notes
    const transactionsWithNotes = transactions.filter(t => t.notes && t.notes.trim()).length;
    logBuffer.log(`[Tax Report Parser] Transactions with notes: ${transactionsWithNotes} out of ${transactions.length}`);
    
    // Log detailed skip reasons if many rows were skipped
    if (skippedRows > 0) {
      logBuffer.warn(`[Tax Report Parser] WARNING: ${skippedRows} out of ${rows.length} rows were skipped!`);
      logBuffer.warn(`[Tax Report Parser] Skip breakdown:`, skipReasons);
      console.warn(`[Tax Report Parser] WARNING: ${skippedRows} out of ${rows.length} rows were skipped!`);
      console.warn(`[Tax Report Parser] Skip breakdown:`, skipReasons);
      if (transactions.length === 0) {
        logBuffer.error(`[Tax Report Parser] ERROR: No transactions were parsed! This suggests a format mismatch.`);
        logBuffer.error(`[Tax Report Parser] Column indices used: Date Sold=${finalDateSoldIdx}, Asset=${finalAssetIdx}, Amount=${finalAmountIdx}, Proceeds=${finalProceedsIdx}, Cost Basis=${finalCostBasisIdx}`);
        logBuffer.error(`[Tax Report Parser] Headers found:`, headers);
        if (rows.length > 0) {
          logBuffer.error(`[Tax Report Parser] First row sample:`, rows[0]);
        }
        console.error(`[Tax Report Parser] ERROR: No transactions were parsed! This suggests a format mismatch.`);
      }
    }
    
    return transactions;
  }
}
