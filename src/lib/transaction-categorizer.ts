/**
 * Exhaustive map: raw provider type string → UI category.
 *
 * Every raw type from Helius (SCREAMING_SNAKE), Moralis (lowercase),
 * Coinbase (lowercase), exchange clients, CSV parsers, AND legacy app
 * types (Title Case) maps to exactly one of 9 categories.
 *
 * Categories: buy, sell, transfer, swap, staking, defi, nft, income, other
 */
const CATEGORY_MAP: Record<string, string> = {
  // ================================================================
  // Helius raw types (SCREAMING_SNAKE_CASE)
  // ================================================================

  // -- Swaps / Trading --
  "SWAP": "swap",
  "INIT_SWAP": "swap",
  "CANCEL_SWAP": "swap",
  "REJECT_SWAP": "swap",
  "FILL_ORDER": "swap",

  // -- Buy / Sell --
  "BUY": "buy",
  "BUY_ITEM": "buy",
  "SELL": "sell",

  // -- Transfers --
  "TRANSFER": "transfer",
  "TRANSFER_IN": "transfer",
  "TRANSFER_OUT": "transfer",
  "TRANSFER_SELF": "transfer",
  "COMPRESSED_NFT_TRANSFER": "transfer",
  "NFT_TRANSFER": "transfer",
  "PLATFORM_FEE": "transfer",

  // -- NFT Marketplace --
  "NFT_SALE": "nft",
  "NFT_PURCHASE": "nft",
  "NFT_LISTING": "nft",
  "NFT_CANCEL_LISTING": "nft",
  "NFT_BID": "nft",
  "NFT_BID_CANCELLED": "nft",
  "NFT_GLOBAL_BID": "nft",
  "NFT_GLOBAL_BID_CANCELLED": "nft",
  "NFT_AUCTION_CREATED": "nft",
  "NFT_AUCTION_UPDATED": "nft",
  "NFT_AUCTION_CANCELLED": "nft",
  "NFT_PARTICIPATION_REWARD": "nft",
  "NFT_MINT_REJECTED": "nft",
  "NFT_RENT_LISTING": "nft",
  "NFT_RENT_ACTIVATE": "nft",
  "NFT_RENT_CANCEL_LISTING": "nft",
  "NFT_RENT_UPDATE_LISTING": "nft",
  "NFT_RENT_END": "nft",

  // -- Minting --
  "NFT_MINT": "nft",
  "COMPRESSED_NFT_MINT": "nft",
  "SFT_MINT": "nft",
  "TOKEN_MINT": "nft",
  "CLAIM_NFT": "nft",

  // -- Staking --
  "STAKE": "staking",
  "STAKE_SOL": "staking",
  "STAKE_TOKEN": "staking",
  "INIT_STAKE": "staking",
  "MERGE_STAKE": "staking",
  "SPLIT_STAKE": "staking",
  "UNSTAKE": "staking",
  "UNSTAKE_SOL": "staking",
  "UNSTAKE_TOKEN": "staking",

  // -- Burns --
  "BURN": "other",
  "BURN_NFT": "nft",
  "COMPRESSED_NFT_BURN": "nft",

  // -- Deposits / Withdrawals --
  "DEPOSIT": "defi",
  "DEPOSIT_GEM": "defi",
  "DEPOSIT_FRACTIONAL_POOL": "defi",
  "ADD_TOKEN_TO_VAULT": "defi",
  "WITHDRAW": "defi",
  "WITHDRAW_GEM": "defi",
  "CLOSE_POSITION": "defi",
  "WITHDRAW_LIQUIDITY": "defi",

  // -- Liquidity --
  "ADD_LIQUIDITY": "defi",
  "ADD_BALANCE_LIQUIDITY": "defi",
  "INCREASE_LIQUIDITY": "defi",
  "ADD_TO_POOL": "defi",
  "REMOVE_LIQUIDITY": "defi",
  "REMOVE_BALANCE_LIQUIDITY": "defi",
  "REMOVE_FROM_POOL": "defi",

  // -- Lending / Borrowing --
  "LOAN": "defi",
  "BORROW": "defi",
  "BORROW_FOX": "defi",
  "BORROW_SOL_FOR_NFT": "defi",
  "REBORROW_SOL_FOR_NFT": "defi",
  "TAKE_LOAN": "defi",
  "LEND_FOR_NFT": "defi",
  "REPAY_LOAN": "defi",
  "OFFER_LOAN": "defi",
  "REQUEST_LOAN": "defi",
  "CANCEL_LOAN_REQUEST": "defi",
  "RESCIND_LOAN": "defi",
  "FORECLOSE_LOAN": "defi",

  // -- Rewards / Claims --
  "CLAIM_REWARDS": "income",
  "HARVEST": "income",
  "FUND_REWARD": "income",
  "PAYOUT": "income",

  // -- Approvals / Revocations --
  "REVOKE": "defi",
  "SET_AUTHORITY": "defi",

  // -- DeFi Setup / Infrastructure --
  "INIT_BANK": "defi",
  "CREATE_POOL": "defi",
  "OPEN_POSITION": "defi",
  "OPEN_POSITION_WITH_METADATA": "defi",
  "INIT_FARMER": "defi",
  "REFRESH_FARMER": "defi",
  "INIT_FARM": "defi",
  "UPDATE_FARM": "defi",
  "INIT_LENDING_ACCOUNT": "defi",
  "SET_BANK_FLAGS": "defi",
  "UPDATE_BANK_MANAGER": "defi",
  "ACTIVATE_VAULT": "defi",
  "INIT_VAULT": "defi",
  "SET_VAULT_LOCK": "defi",
  "UPDATE_VAULT_OWNER": "defi",
  "AUTHORIZE_FUNDER": "defi",
  "DEAUTHORIZE_FUNDER": "defi",
  "CANCEL_REWARD": "defi",
  "LOCK_REWARD": "defi",
  "RECORD_RARITY_POINTS": "defi",
  "ADD_RARITIES_TO_BANK": "defi",
  "INITIALIZE_ACCOUNT": "defi",
  "CLOSE_ACCOUNT": "defi",

  // -- Orders --
  "CREATE_ORDER": "defi",
  "INIT_ORDER": "defi",
  "REGISTER_ORDER": "defi",
  "CANCEL_ORDER": "defi",
  "CLOSE_ORDER": "defi",
  "UPDATE_ORDER": "defi",
  "SETTLE": "defi",
  "SETTLE_PNL": "defi",
  "FULFILL": "defi",

  // -- Gambling / Betting --
  "PLACE_BET": "buy",
  "PLACE_SOL_BET": "buy",
  "CREATE_BET": "buy",
  "CREATE_RAFFLE": "buy",
  "UPDATE_RAFFLE": "buy",
  "BUY_TICKETS": "buy",
  "BUY_SUBSCRIPTION": "buy",

  // -- Escrow --
  "CREATE_ESCROW": "defi",
  "CANCEL_ESCROW": "defi",
  "CLOSE_ESCROW_ACCOUNT": "defi",
  "ACCEPT_ESCROW_ARTIST": "defi",
  "ACCEPT_ESCROW_USER": "defi",
  "ACCEPT_REQUEST_ARTIST": "defi",

  // -- Fox Federation --
  "UPGRADE_FOX": "defi",
  "UPGRADE_FOX_REQUEST": "defi",
  "LOAN_FOX": "defi",
  "SWITCH_FOX_REQUEST": "defi",
  "SWITCH_FOX": "defi",

  // -- Metaplex / Candy Machine --
  "CANDY_MACHINE_ROUTE": "nft",
  "CANDY_MACHINE_WRAP": "nft",
  "CANDY_MACHINE_UNWRAP": "nft",
  "CANDY_MACHINE_UPDATE": "nft",
  "CREATE_STORE": "nft",
  "WHITELIST_CREATOR": "nft",
  "ADD_TO_WHITELIST": "nft",
  "REMOVE_FROM_WHITELIST": "nft",
  "AUCTION_MANAGER_CLAIM_BID": "nft",
  "EMPTY_PAYMENT_ACCOUNT": "nft",
  "UPDATE_PRIMARY_SALE_METADATA": "nft",
  "VALIDATE_SAFETY_DEPOSIT_BOX_V2": "nft",
  "INIT_AUCTION_MANAGER_V2": "nft",
  "UPDATE_EXTERNAL_PRICE_ACCOUNT": "nft",
  "AUCTION_HOUSE_CREATE": "nft",
  "CREATE_MASTER_EDITION": "nft",

  // -- Compressed NFT management --
  "COMPRESSED_NFT_VERIFY_CREATOR": "nft",
  "COMPRESSED_NFT_UPDATE_METADATA": "nft",
  "COMPRESSED_NFT_UNVERIFY_CREATOR": "nft",
  "COMPRESSED_NFT_VERIFY_COLLECTION": "nft",
  "COMPRESSED_NFT_UNVERIFY_COLLECTION": "nft",
  "COMPRESSED_NFT_SET_VERIFY_COLLECTION": "nft",
  "COMPRESSED_NFT_DELEGATE": "nft",
  "COMPRESSED_NFT_REDEEM": "nft",
  "COMPRESSED_NFT_CANCEL_REDEEM": "nft",
  "COMPRESS_NFT": "nft",
  "DECOMPRESS_NFT": "nft",
  "CREATE_MERKLE_TREE": "nft",
  "DELEGATE_MERKLE_TREE": "nft",
  "DISTRIBUTE_COMPRESSION_REWARDS": "nft",

  // -- pNFT Migration --
  "REQUEST_PNFT_MIGRATION": "nft",
  "START_PNFT_MIGRATION": "nft",
  "MIGRATE_TO_PNFT": "nft",

  // -- Misc platform / metadata --
  "FRACTIONALIZE": "defi",
  "FUSE": "defi",
  "CREATE_APPRAISAL": "defi",
  "CREATE_APPARAISAL": "defi",
  "ATTACH_METADATA": "defi",
  "UPDATE_RECORD_AUTHORITY_DATA": "defi",
  "CHANGE_COMIC_STATE": "defi",
  "INIT_RENT": "defi",
  "UPDATE_OFFER": "defi",
  "CANCEL_OFFER": "defi",
  "CREATE": "defi",
  "EXECUTE_INSTRUCTION": "defi",

  // -- Multisig / Governance --
  "CREATE_TRANSACTION": "defi",
  "APPROVE_TRANSACTION": "defi",
  "EXECUTE_TRANSACTION": "defi",
  "ACTIVATE_TRANSACTION": "defi",
  "REJECT_TRANSACTION": "defi",
  "CANCEL_TRANSACTION": "defi",
  "ADD_INSTRUCTION": "defi",

  // -- Program upgrades --
  "FINALIZE_PROGRAM_INSTRUCTION": "defi",
  "UPGRADE_PROGRAM_INSTRUCTION": "defi",

  // -- Marketplace items --
  "LIST_ITEM": "nft",
  "DELIST_ITEM": "nft",
  "UPDATE_ITEM": "nft",
  "ADD_ITEM": "nft",
  "CLOSE_ITEM": "nft",
  "KICK_ITEM": "nft",

  // -- Catch-all Helius --
  "UNKNOWN": "other",
  "UNLABELED": "other",

  // ================================================================
  // Moralis raw types (lowercase)
  // ================================================================
  "send": "transfer",
  "receive": "transfer",
  "token send": "transfer",
  "token receive": "transfer",
  "token swap": "swap",
  "nft send": "transfer",
  "nft receive": "transfer",
  "nft sale": "nft",
  "nft purchase": "nft",
  "deposit": "defi",
  "withdraw": "defi",
  "airdrop": "income",
  "mint": "nft",
  "burn": "other",
  "approve": "defi",
  "revoke": "defi",
  "borrow": "defi",
  "repay": "defi",
  "contract interaction": "defi",
  "stake": "staking",
  "unstake": "staking",
  "bridge": "transfer",
  "wrap": "swap",
  "unwrap": "swap",
  "add liquidity": "defi",
  "remove liquidity": "defi",
  "reward": "income",
  "claim": "income",
  "yield": "income",
  "interest": "income",
  "liquidation": "sell",

  // ================================================================
  // Coinbase raw types
  // ================================================================
  "buy": "buy",
  "sell": "sell",
  "exchange": "swap",
  "trade": "swap",

  // ================================================================
  // Exchange client types (Kraken, KuCoin, Gemini, Binance)
  // ================================================================
  "withdrawal": "transfer",
  "transfer": "transfer",
  "Staking Reward": "income",
  "Margin": "buy",

  // ================================================================
  // Legacy app types (backward compat with existing DB records)
  // ================================================================
  "Buy": "buy",
  "Sell": "sell",
  "Swap": "swap",
  "Send": "transfer",
  "Receive": "transfer",
  "Transfer": "transfer",
  "Bridge": "transfer",
  "Self": "transfer",
  "Stake": "staking",
  "Unstake": "staking",
  "DCA": "buy",
  "Margin Buy": "buy",
  "Margin Sell": "sell",
  "Liquidation": "sell",
  "NFT Purchase": "nft",
  "NFT Sale": "nft",
  "NFT Activity": "nft",
  "Mint": "nft",
  "Deposit": "defi",
  "Withdraw": "defi",
  "Borrow": "defi",
  "Repay": "defi",
  "Add Liquidity": "defi",
  "Remove Liquidity": "defi",
  "DeFi Setup": "defi",
  "Approve": "defi",
  "Wrap": "swap",
  "Unwrap": "swap",
  "Reward": "income",
  "Airdrop": "income",
  "Mining": "income",
  "Yield": "income",
  "Interest": "income",
  "Burn": "other",
  "Zero Transaction": "other",
  "Spam": "other",
  "Fee": "other",
  "Staking": "staking",
};

// Pre-built reverse index: category → list of raw type strings
const _categoryIndex: Record<string, string[]> = {};
for (const [rawType, category] of Object.entries(CATEGORY_MAP)) {
  if (!_categoryIndex[category]) _categoryIndex[category] = [];
  _categoryIndex[category].push(rawType);
}

// ================================================================
// Public helpers
// ================================================================

/** Look up the UI category for any raw type string. Falls back to "other". */
export function getCategory(rawType: string): string {
  return CATEGORY_MAP[rawType] || "other";
}

/** Return all raw type strings that belong to a given category. */
export function getTypesForCategory(category: string): string[] {
  return _categoryIndex[category] || [];
}

const OUTFLOW_RAW_TYPES = new Set([
  "TRANSFER_OUT", "Send", "send", "token send", "nft send", "withdrawal",
  "NFT_PURCHASE",
]);

/** True for categories where crypto/money is leaving (outflow). */
export function isOutflow(rawType: string): boolean {
  if (OUTFLOW_RAW_TYPES.has(rawType)) return true;
  const cat = getCategory(rawType);
  return cat === "buy" || cat === "swap" || cat === "defi";
}

const INFLOW_RAW_TYPES = new Set([
  "TRANSFER_IN", "Receive", "receive", "token receive", "nft receive", "deposit",
  "NFT_SALE",
]);

/** True for categories where crypto/money is arriving (inflow). */
export function isInflow(rawType: string): boolean {
  if (INFLOW_RAW_TYPES.has(rawType)) return true;
  const cat = getCategory(rawType);
  return cat === "sell" || cat === "income";
}

/** Classify a raw type for P&L purposes: outflow, inflow, or excluded. */
export function getPnlCategory(rawType: string): "outflow" | "inflow" | "excluded" {
  if (isOutflow(rawType)) return "outflow";
  if (isInflow(rawType)) return "inflow";
  return "excluded";
}

/** All raw type strings in CATEGORY_MAP classified as outflow. */
export function getPnlOutflowTypes(): string[] {
  return Object.keys(CATEGORY_MAP).filter(t => getPnlCategory(t) === "outflow");
}

/** All raw type strings in CATEGORY_MAP classified as inflow. */
export function getPnlInflowTypes(): string[] {
  return Object.keys(CATEGORY_MAP).filter(t => getPnlCategory(t) === "inflow");
}

/** Types that create cost basis lots in the tax engine. */
export function isTaxableBuy(rawType: string): boolean {
  const cat = getCategory(rawType);
  if (cat === "buy") return true;
  // NFT_PURCHASE is NOT a simple buy — it's a two-sided trade (SOL→NFT)
  // and is handled by the swap branch in the tax calculator.
  return false;
}

/** Types that are disposals — trigger capital gain/loss calculation. */
export function isTaxableSell(rawType: string): boolean {
  const cat = getCategory(rawType);
  if (cat === "sell") return true;
  // NFT_SALE is NOT a simple sell — it's a two-sided trade (NFT→SOL)
  // and is handled by the swap branch in the tax calculator.
  return false;
}

/** Types the tax engine should skip entirely (internal movements). */
export function isTransferSkip(rawType: string): boolean {
  return getCategory(rawType) === "transfer";
}

// Types where the primary asset_symbol represents something the user RECEIVES.
// Everything else defaults to "out" (asset is leaving the user).
const ASSET_INCOMING_RAW_TYPES = new Set([
  // Transfers in
  "TRANSFER_IN", "Receive", "receive", "token receive", "nft receive",
  // Buys (you receive the asset, pay cash)
  "BUY", "buy", "Buy", "BUY_ITEM", "DCA", "Margin Buy", "Margin",
  "PLACE_BET", "PLACE_SOL_BET", "CREATE_BET", "BUY_TICKETS", "BUY_SUBSCRIPTION",
  // Unstaking (asset returns to you)
  "UNSTAKE", "UNSTAKE_SOL", "UNSTAKE_TOKEN", "Unstake",
  // Withdrawals (you get tokens back from DeFi)
  "WITHDRAW", "WITHDRAW_GEM", "WITHDRAW_LIQUIDITY", "Withdraw",
  "CLOSE_POSITION", "REMOVE_LIQUIDITY", "REMOVE_BALANCE_LIQUIDITY", "REMOVE_FROM_POOL",
  "Remove Liquidity",
  // Minting (you receive the NFT/token)
  "NFT_MINT", "COMPRESSED_NFT_MINT", "SFT_MINT", "TOKEN_MINT", "CLAIM_NFT", "Mint",
  "NFT_PARTICIPATION_REWARD",
  // Income/Rewards
  "CLAIM_REWARDS", "HARVEST", "FUND_REWARD", "PAYOUT",
  "Reward", "Airdrop", "Mining", "Yield", "Interest",
]);

/**
 * Determine whether the primary asset_symbol field represents an outgoing
 * or incoming asset for display purposes.
 *
 * "out" = the user is sending/spending/disposing of the primary asset
 * "in"  = the user is receiving/earning/buying the primary asset
 *
 * Two-sided transactions (swaps, NFT trades) are handled at the caller
 * level by checking for incoming_asset_symbol.
 */
export function getPrimaryAssetDirection(rawType: string): "out" | "in" {
  if (ASSET_INCOMING_RAW_TYPES.has(rawType)) return "in";
  // Category-level fallbacks
  const cat = getCategory(rawType);
  if (cat === "income") return "in";
  return "out";
}

/** All raw type strings where the value should be positive (asset incoming). */
export function getPositiveValueTypes(): string[] {
  return Object.keys(CATEGORY_MAP).filter(t => getPrimaryAssetDirection(t) === "in");
}

/**
 * Format a raw type string for display.
 * "TRANSFER_IN" → "Transfer In"
 * "token swap"  → "Token Swap"
 * "Buy"         → "Buy" (already formatted)
 */
export function formatTypeForDisplay(rawType: string): string {
  if (!rawType) return "Unknown";
  // If it looks like SCREAMING_SNAKE_CASE, convert
  if (rawType === rawType.toUpperCase() && rawType.includes("_")) {
    return rawType
      .split("_")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ");
  }
  // If it's all lowercase with spaces (Moralis style), title-case it
  if (rawType === rawType.toLowerCase()) {
    return rawType
      .split(" ")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }
  // Already formatted (legacy Title Case)
  return rawType;
}

/**
 * Get badge color classes for a category.
 * Returns Tailwind classes for light + dark mode.
 */
export function getCategoryBadgeColor(rawType: string): string {
  const cat = getCategory(rawType);
  switch (cat) {
    case "buy":
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400";
    case "sell":
      return "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-400";
    case "transfer":
      return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
    case "swap":
      return "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400";
    case "staking":
      return "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400";
    case "defi":
      return "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400";
    case "nft":
      return "bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-900/30 dark:text-fuchsia-400";
    case "income":
      return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400";
    case "other":
    default:
      return "bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-400";
  }
}
