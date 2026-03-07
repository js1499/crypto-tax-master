# Pending: Unpriced Assets & Phantom Gains

## 1. Swap mirror + cost basis fix
- **Status:** Not started
- **Impact:** ~2,527 fungible token txns with wrong cost basis / gain-loss
- **Problem:** Enrichment Phase 4 skips swaps already touched by Phase 1/2/3, even if only one side is priced. Cost basis calculator uses `value_usd` ($0) as proceeds instead of `incoming_value_usd` (the priced side).
- **Fix:** (a) Remove aggressive `pricedIds` skip in Phase 4 so it mirrors the known price to the unknown side. (b) In tax calculator swap handler, use `incoming_value_usd` as proceeds when `value_usd` is $0.

## 2. NFT purchase/sale lot mismatch — $313K phantom gain
- **Status:** Not started
- **Impact:** 2,073 NFT sales with $0 cost basis = $313K phantom gain
- **Problem:** NFT purchases record asset as "SOL" (currency spent). NFT sales record the NFT collection name (DINO, DOLPHIN, etc.). Cost basis lots never connect between buy and sell.
- **Fix:** When processing NFT_PURCHASE, consume SOL lots and create a lot under the NFT's collection/mint address. Requires Helius raw data to extract the NFT mint address from purchase transactions.

## 3. USDC lot deficit from untracked sources — $738K phantom gain
- **Status:** User action needed
- **Impact:** $1.5M USDC deficit → $738K phantom gain from $0 cost basis disposals
- **Problem:** More USDC left tracked wallets than entered. Missing sources: exchange withdrawals, fiat on-ramps, other wallets.
- **Fix:** User needs to add missing wallets and exchanges. Cost basis auto-recomputes on sync.

## 4. Add GeckoTerminal as price source
- **Status:** Not started
- **Impact:** 235 fungible tokens (2,527 txns) still unpriced after all enrichment phases
- **Problem:** CoinGecko doesn't track most Solana DEX tokens (FLTH, DUST, JUP airdrop, memecoins).
- **Fix:** Add GeckoTerminal API (or Birdeye/Jupiter) as a fallback price source for Solana tokens. Query by mint address for historical OHLCV data.

## 5. Stablecoin capital gains noise
- **Status:** Low priority
- **Impact:** Minor — tiny gains/losses from USDC/USDT depeg fluctuations
- **Problem:** Stablecoins tracked as regular tokens generate noise in P&L.
- **Fix:** Option to treat stablecoins (USDC, USDT, DAI, etc.) like fiat — skip lot tracking entirely.

## 6. Price enrichment doesn't auto-run after sync
- **Status:** Not started
- **Impact:** Cost basis computed on $0 values for newly synced transactions
- **Problem:** Current flow: sync → auto cost basis. Should be: sync → auto enrich → auto cost basis.
- **Fix:** Call `enrichHistoricalPrices()` before `recomputeCostBasis()` in sync/import endpoints. Watch for timeout — enrichment can be slow (CoinGecko rate limits).

## 7. Unpriced NFT transfers — 7,959 txns
- **Status:** Low priority
- **Impact:** Most are spam/airdrops worth $0. Some (DINO, DUST NFTs) had real value.
- **Problem:** NFT transfers have no price data from any source.
- **Fix:** Could use GeckoTerminal or marketplace APIs for NFT floor prices. Low ROI for tax accuracy.
