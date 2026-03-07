# Pending: Unpriced Assets & Phantom Gains

## 1. Swap mirror + cost basis fix ✅
- **Status:** DONE (commit a7c5c46)
- **Impact:** +$400K P&L correction
- **Problem:** Enrichment Phase 4 skipped swaps already touched by Phase 1/2/3. Cost basis calculator used `value_usd` ($0) as proceeds instead of `incoming_value_usd`.
- **Fix:** Mirror known price to unknown side in Phase 4. Use `incoming_value_usd` as swap proceeds when `value_usd` is $0.

## 2. NFT lot mismatch ✅
- **Status:** DONE (commit 94f077a)
- **Impact:** -$1.3M P&L correction (originally estimated $313K)
- **Problem:** NFT_PURCHASE routed through buy handler (created SOL lots instead of consuming them). NFT_SALE routed through sell handler (no NFT lots to consume → $0 cost basis).
- **Fix:** Route NFT_PURCHASE/NFT_SALE through swap handler. Correctly consumes outgoing asset lots and creates incoming asset lots.

## 3. Helius type mapping fix ✅
- **Status:** DONE (commit 2e034c0)
- **Impact:** Removed phantom disposals/acquisitions from staking, listings, mints (~15K+ transactions)
- **Problem:** STAKE_TOKEN, NFT_LISTING, CLAIM_REWARDS, etc. were flattened to TRANSFER_IN/OUT during sync. Tax calculator treated them as external transfers (disposals/acquisitions).
- **Fix:** Preserve original Helius types in sync code. Updated existing DB records. Added income category detection for CLAIM_REWARDS/HARVEST/PAYOUT.

## 4. GeckoTerminal price source
- **Status:** Not started
- **Impact:** 235 fungible tokens (2,527 txns) still unpriced after all enrichment phases
- **Problem:** CoinGecko doesn't track most Solana DEX tokens (FLTH, DUST, JUP airdrop, memecoins).
- **Fix:** Add GeckoTerminal API (or Birdeye/Jupiter) as a fallback price source for Solana tokens. Query by mint address for historical OHLCV data.

## 5. Unpriced NFT transfers — 7,959 txns
- **Status:** Non-issue (investigated)
- **Impact:** Minimal — mostly staking, listings, and spam airdrops. Not missing sales.
- **Analysis:** Transfers are NFT staking (Cardinal), marketplace listings (Tensor), and wallet movements. Actual sales are captured as NFT_SALE. No missing income.

## 6. USDC deficit from untracked sources — $981K phantom gain
- **Status:** User action needed
- **Impact:** $1.5M USDC deficit → $981K phantom gain from $0 cost basis disposals (2,463 txns)
- **Problem:** More USDC left tracked wallets than entered. Missing sources: exchange withdrawals, fiat on-ramps, other wallets.
- **Fix:** User needs to add missing wallets and exchanges. Cost basis auto-recomputes on sync.
