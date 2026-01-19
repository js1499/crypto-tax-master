import { Decimal } from "@prisma/client/runtime/library";

/**
 * Transaction categories
 */
export type TransactionCategory = 
  | "buy" 
  | "sell" 
  | "transfer" 
  | "swap" 
  | "staking" 
  | "liquidity" 
  | "nft" 
  | "dca" 
  | "zero" 
  | "spam";

/**
 * Categorize a transaction based on its type, notes, and other attributes
 * Returns the category and whether the transaction should be marked as identified
 */
export function categorizeTransaction(
  type: string,
  notes?: string | null,
  valueUsd?: Decimal | number | null,
  assetSymbol?: string | null,
  incomingAssetSymbol?: string | null
): {
  category: TransactionCategory;
  identified: boolean;
  finalType: string;
  subtype?: string;
} {
  const typeLower = (type || "").toLowerCase();
  const notesLower = (notes || "").toLowerCase();
  const assetLower = (assetSymbol || "").toLowerCase();
  const combinedText = `${typeLower} ${notesLower} ${assetLower}`.toLowerCase();

  // Zero value transactions
  const value = valueUsd ? Number(valueUsd) : 0;
  if (value === 0 || typeLower.includes("zero")) {
    return {
      category: "zero",
      identified: true,
      finalType: "Zero Transaction",
    };
  }

  // Spam transactions
  if (
    typeLower.includes("spam") ||
    assetLower.includes("unknown") ||
    notesLower.includes("spam") ||
    combinedText.includes("airdrop spam") ||
    combinedText.includes("dust")
  ) {
    return {
      category: "spam",
      identified: true,
      finalType: "Spam",
    };
  }

  // Margin and liquidation transactions
  if (
    typeLower.includes("liquidation") ||
    notesLower.includes("liquidation") ||
    notesLower.includes("liquidated") ||
    combinedText.includes("margin call") ||
    combinedText.includes("forced liquidation") ||
    combinedText.includes("position liquidated")
  ) {
    return {
      category: "liquidation",
      identified: true,
      finalType: "Liquidation",
    };
  }

  // Margin trading transactions
  if (
    typeLower.includes("margin") ||
    notesLower.includes("margin") ||
    notesLower.includes("margin trade") ||
    notesLower.includes("margin position") ||
    combinedText.includes("leveraged trade") ||
    combinedText.includes("margin buy") ||
    combinedText.includes("margin sell") ||
    combinedText.includes("short position") ||
    combinedText.includes("long position")
  ) {
    // Determine if it's a margin buy or sell
    const isMarginSell = 
      typeLower.includes("sell") ||
      notesLower.includes("margin sell") ||
      notesLower.includes("short") ||
      (value > 0 && !typeLower.includes("buy"));
    
    return {
      category: "margin",
      identified: true,
      finalType: isMarginSell ? "Margin Sell" : "Margin Buy",
    };
  }

  // NFT transactions
  if (
    typeLower.includes("nft") ||
    notesLower.includes("nft") ||
    combinedText.includes("non-fungible") ||
    typeLower === "nft purchase" ||
    typeLower === "nft sale"
  ) {
    return {
      category: "nft",
      identified: true,
      finalType: typeLower.includes("sale") ? "NFT Sale" : "NFT Purchase",
    };
  }

  // Staking transactions
  if (
    typeLower.includes("stake") ||
    typeLower.includes("staking") ||
    typeLower.includes("reward") ||
    notesLower.includes("staking") ||
    notesLower.includes("stake reward") ||
    notesLower.includes("validator") ||
    combinedText.includes("delegation reward")
  ) {
    return {
      category: "staking",
      identified: true,
      finalType: "Staking",
      subtype: "Reward",
    };
  }

  // Liquidity transactions
  if (
    typeLower.includes("liquidity") ||
    notesLower.includes("liquidity") ||
    notesLower.includes("lp") ||
    notesLower.includes("liquidity pool") ||
    combinedText.includes("add liquidity") ||
    combinedText.includes("remove liquidity") ||
    combinedText.includes("liquidity provision")
  ) {
    return {
      category: "liquidity",
      identified: true,
      finalType: typeLower.includes("add") || notesLower.includes("add") 
        ? "Add Liquidity" 
        : "Remove Liquidity",
    };
  }

  // DCA (Dollar Cost Averaging) transactions
  if (
    typeLower === "dca" ||
    notesLower.includes("dca") ||
    notesLower.includes("dollar cost average") ||
    combinedText.includes("recurring buy")
  ) {
    return {
      category: "dca",
      identified: true,
      finalType: "DCA",
    };
  }

  // Swap transactions
  if (
    typeLower.includes("swap") ||
    typeLower.includes("trade") ||
    notesLower.includes("swap") ||
    notesLower.includes("jupiter swap") ||
    notesLower.includes("uniswap") ||
    notesLower.includes("exchange") ||
    incomingAssetSymbol ||
    combinedText.includes("swapped") ||
    combinedText.includes("traded")
  ) {
    return {
      category: "swap",
      identified: true,
      finalType: "Swap",
    };
  }

  // Transfer transactions (Send/Receive)
  if (
    typeLower.includes("send") ||
    typeLower.includes("receive") ||
    typeLower.includes("transfer") ||
    typeLower.includes("bridge") ||
    notesLower.includes("transfer") ||
    notesLower.includes("sent") ||
    notesLower.includes("received")
  ) {
    const isReceive = 
      typeLower.includes("receive") ||
      notesLower.includes("received") ||
      (value > 0 && !typeLower.includes("send"));
    
    return {
      category: "transfer",
      identified: true,
      finalType: isReceive ? "Receive" : "Send",
    };
  }

  // Buy transactions
  if (
    typeLower.includes("buy") ||
    typeLower.includes("purchase") ||
    typeLower.includes("acquire") ||
    notesLower.includes("bought") ||
    notesLower.includes("purchased") ||
    (value < 0 && !typeLower.includes("sell")) // Negative value usually means outgoing (buy)
  ) {
    return {
      category: "buy",
      identified: true,
      finalType: "Buy",
    };
  }

  // Sell transactions
  if (
    typeLower.includes("sell") ||
    typeLower.includes("sale") ||
    notesLower.includes("sold") ||
    typeLower.includes("disposal") ||
    notesLower.includes("proceeds") ||
    notesLower.includes("cost basis") // Tax report format indicates a sell
  ) {
    return {
      category: "sell",
      identified: true,
      finalType: "Sell",
    };
  }

  // Default: not identified, keep original type
  // Don't default to "Sell" based on positive value alone - that's too aggressive
  // Only categorize as sell if there are explicit sell indicators
  return {
    category: "buy", // Default fallback
    identified: false,
    finalType: type, // Keep original type so user can review
  };
}

/**
 * Categorize and update transaction data
 */
export function categorizeTransactionData(data: {
  type: string;
  notes?: string | null;
  value_usd?: Decimal | number | null;
  asset_symbol?: string | null;
  incoming_asset_symbol?: string | null;
  subtype?: string | null;
}): {
  type: string;
  subtype?: string | null;
  identified: boolean;
} {
  const categorization = categorizeTransaction(
    data.type,
    data.notes,
    data.value_usd,
    data.asset_symbol,
    data.incoming_asset_symbol
  );

  return {
    type: categorization.finalType,
    subtype: categorization.subtype || data.subtype || null,
    identified: categorization.identified,
  };
}
