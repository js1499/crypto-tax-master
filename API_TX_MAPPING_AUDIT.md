# Moralis & Helius API Calls + Transaction-Type Mapping Audit

_Generated 2026-07-01. Sources are the live official docs (fetched, not from memory) plus a read of our actual code (`resolveMoralisType`, `resolveHeliusType`, `getCategory`, `processTransactionsForTax`)._

This document has three parts:
1. **All Moralis API calls** we make.
2. **All Helius API calls** we make.
3. **Transaction-categorization audit** — for the call that returns each provider's transaction categories, the full documented enum and whether our mapping handles every value correctly for tax.

---

## 1. Moralis API calls

Base URL `https://deep-index.moralis.io/api/v2.2`, auth header `X-API-Key: MORALIS_API_KEY`. **Exactly 2 distinct endpoints**, both defined in `src/lib/moralis-transactions.ts`. Every history call is wrapped by `getMoralisWithRetry` (retry/backoff on 429 + 5xx).

| # | Endpoint | Method | Purpose | Caller(s) |
|---|----------|--------|---------|-----------|
| M1 | `/wallets/{address}/history` | GET | Primary sync data source — paginated wallet transaction history for one EVM chain (decoded native / ERC-20 / NFT transfers, categories, fees, receipt status). `order=DESC`, `limit=100`, `include_internal_transactions=true`, optional `from_date`/`to_date`. | `getWalletTransactions` (full history) and `getWalletTransactionsChunk` (bounded/resumable chunk). `getWalletTransactionsAllChains` loops chains → `getWalletTransactions`. |
| M2 | `/erc20/{tokenAddress}/price` | GET | Historical USD price of a token at a specific block (`chain`, `to_block`) → fills `value_usd`, `price_per_unit`, USD gas fees. Day-granularity cache + ~20 req/s limiter. | `getTokenPriceUSD`; **native** pricing reuses this endpoint via `getNativeTokenPriceUSD` (passes the chain's wrapped-token address — there is no separate native-price endpoint). Invoked from `enrichTransactionsWithPrices`. |

_No other Moralis endpoints exist in the codebase. `chain` is a query param (22 chains in `SUPPORTED_CHAINS`)._

---

## 2. Helius API calls

Two distinct endpoints, both in `src/lib/helius-transactions.ts` (`HELIUS_API_KEY` from env).

| # | Endpoint | Method | Purpose | Caller(s) |
|---|----------|--------|---------|-----------|
| H1 | `https://api.helius.xyz/v0/addresses/{address}/transactions` | GET | Enhanced Transactions REST — paginated parsed Solana history (native SOL, SPL tokens, swaps, NFT sales, staking, …). Params `api-key`, `limit=100`, `before=<signature>` cursor. Loops until empty page / `startTime` cutoff / `maxPages=500`. 3-attempt backoff on 429/5xx/timeout. | `getSolanaWalletTransactions`; invoked by the sync route (Solana one-shot path + main sync path). |
| H2 | `https://mainnet.helius-rpc.com/?api-key={key}` (JSON-RPC `getAssetBatch`) | POST | DAS RPC — one batched call (≤1000 mints, chunked) returning **both** token price (`token_info.price_info.price_per_token`) **and** metadata (symbol/name). Prices Solana txns, converts SOL fees, resolves truncated mint symbols. | `getHeliusTokenData`; invoked by `enrichSolanaTransactionsWithPrices` and the `resolve-symbols` route. |

_Not Helius (nearby, for completeness): `getJupiterTokenMap` hits `https://tokens.jup.ag/tokens` (symbol fallback); explorer links point to solscan.io (no API call). `getAssetBatch` is the **only** mainnet-RPC method used — no `getSignaturesForAddress` / singular `getAsset`._

---

## 3. Categorization audit

Both providers carry categorization on the **history** call (M1 / H1). Data flow: each fetcher assigns a **raw canonical type string**, then the shared `getCategory` (`src/lib/transaction-categorizer.ts`) collapses it into one of 12 buckets (`buy, sell, transfer, deposit, withdrawal, swap, staking, defi, nft, income, gambling, other`). **Crucially, the tax engine (`processTransactionsForTax`) dispatches on the lowercased raw type string, and only consults `getCategory` for buy/sell/swap/income/transfer-skip** — so many category assignments are cosmetic (UI/P&L display) and don't drive cost basis.

### 3a. Moralis — `category` field (enum `ETransactionCategory`, 16 values)

Docs: [get-wallet-history](https://docs.moralis.com/web3-data-api/evm/reference/wallet-api/get-wallet-history). Values are lowercase, space-separated.

> **Key structural finding:** the Moralis `category` field is **largely bypassed**. For any tx with decoded transfers (the overwhelming majority), `parseMoralisPage` assigns the type purely from **transfer direction** (`send`/`receive`, `token send`/`token receive`, `nft send`/`nft receive`), and `postProcessTransaction` upgrades a different-asset out+in pair to `wrap`/`unwrap`/`token swap`. `resolveMoralisType` (which passes `category` through verbatim) runs **only** in the rare no-decoded-transfers branch — so the category-specific map entries (`airdrop→income`, `mint→nft`, `borrow→defi`, etc.) are effectively **dead** on the real ingest path.

| `category` | Our handling | Correct? |
|-----------|--------------|----------|
| send / token send / nft send | → `transfer` → skipped as internal move | ⚠️ Partial — never a disposal even to external addresses (unlike Helius). Under-taxes crypto-as-payment. |
| receive / token receive / nft receive | → `transfer` → skipped, **no basis lot** | ⚠️ Partial — external inbound establishes no basis → later sale is zero-basis 100% gain. |
| token swap | Both legs decode → `postProcess` merges → `swap` → two-sided disposal+acquisition | ✅ Yes (when both legs decode). |
| nft purchase / nft sale | → merged to `token swap` → disposes paid asset / NFT | ✅ Yes, but NFT leg is unpriced (`value_usd=0`) → gains often overstated. |
| deposit / withdraw | Label discarded when transfers decode → non-taxable move | ⚠️ Partial — usually harmless; a vault op returning a different asset can be mis-merged to swap. |
| **airdrop** | Label **discarded** → `token receive` → `transfer` → skipped; **no EVM income detector exists** | ❌ **No** — ordinary income omitted AND no FMV basis → later sale = zero-basis 100% gain. |
| mint | Self-mint → transfer skip; paid mint → swap (correct) | ⚠️ Partial — reward/yield mints that are income are missed (same root cause as airdrop). |
| burn | → `transfer`/`other` → skipped | ⚠️ Partial — a burn is a disposal (to $0 = capital loss); loss not realized. |
| borrow | Loan-proceeds-only → transfer skip (correct) | ⚠️ Partial — if collateral-out + loan-in in one tx, `postProcess` wrongly merges to `token swap` → over-taxes posting collateral. |
| contract interaction (+ approve/revoke) | No transfers → `defi`, non-taxable. Approvals/revokes arrive here per Moralis docs. | ✅ Yes — correctly non-taxable. |

**Moralis verdict:** swaps and NFT buys/sells are correct when both legs decode; approve/revoke/contract-interaction correctly non-taxable. Most serious defect: **airdrops are silently dropped** (no income, zero basis). Secondary: the swap-merge heuristic both **over-taxes** (borrow collateral, LP adds → false `token swap`) and **under-taxes** (single-leg swaps stay `transfer`); burns don't realize losses; and Moralis sends/receives are never booked as disposals/acquisitions the way the Helius path does.

### 3b. Helius — `type` field (`TransactionType` enum, 149 values)

Docs: [transaction-types](https://docs.helius.dev/resources/transaction-types). `resolveHeliusType` direction-enriches only 5 types (`TRANSFER, UNKNOWN, UNLABELED, COMPRESSED_NFT_TRANSFER, NFT_TRANSFER`) into `TRANSFER_IN/OUT/SELF`; all others pass through verbatim (uppercased). `getCategory` maps **147/149** to a real bucket (only `BUY_SUBSCRIPTION` and `addCollateralType` fall to `other`).

**Correctly handled (core money-movers):** `BUY`→buy lot; `SELL`→disposal; `SWAP`→two-sided (with `processSwapTransaction` + `reconstructSwapFromTransfers` fallback); `NFT_SALE`→seller disposal / buyer acquisition; `CLAIM_REWARDS`/`PAYOUT`→income + FMV lot; `TRANSFER`→send/receive/self; `STAKE_SOL`/`UNSTAKE_SOL`/`STAKE_TOKEN`→non-taxable; `BURN`→loss-realizing disposal at $0; `PLACE_BET`/`CREATE_RAFFLE`/`BUY_TICKETS`→gambling. The large tail (~110 infra/admin/listing/bid/escrow/order/vault/farm/multisig types) correctly resolves to a non-event via the catch-all no-op.

**Genuine mismappings to fix:**

| `type` | Our handling | Problem |
|--------|--------------|---------|
| **FUND_REWARD** | → `income` + explicit engine income branch | ❌ Funding a reward pool is an **outflow**, not income received → phantom income + spurious basis lot. |
| **CANCEL_SWAP / REJECT_SWAP** | → `swap` → swap disposal branch | ❌ Cancelling returns the escrowed asset (non-taxable), but it's booked as a disposal → phantom gain. |
| **NFT_PARTICIPATION_REWARD** | → `nft` → no-op | ❌ It's a reward → should be ordinary income; no income/basis booked. |
| **NFT_MINT / CANDY_MACHINE_ROUTE / TOKEN_MINT / CLAIM_NFT** | → `nft`/`nft` → no-op | ⚠️ No acquisition cost basis and (for paid mints) no SOL-spend disposal. Masked today because NFTs are left unpriced. |
| **ADD_LIQUIDITY / WITHDRAW_LIQUIDITY** (underscore form) | → `defi`, but engine LP branch only matches space-separated `add liquidity`/`remove liquidity` | ⚠️ Category-vs-engine divergence → Helius LP ops never create/dispose LP-token basis. |
| **BUY_SUBSCRIPTION**, **addCollateralType** | unmapped → `other` → no-op | ⚠️ `BUY_SUBSCRIPTION` is a spend/disposal that's never booked (exact-match lookup means it does **not** inherit `BUY`). `addCollateralType` is benign (non-taxable). |
| BURN_NFT | → `nft` → no-op | ⚠️ Inconsistent with fungible `BURN` (which realizes a loss); benign only because NFT basis ≈ $0. |

**Design caveat (not a bug):** a `TRANSFER_OUT` to an address not in the user's wallet list is booked as a taxable disposal — an internal move to an exchange deposit address can be over-reported as a sale.

**Helius verdict:** coverage is broad and mostly **safe** — correct for the vast majority of real economic events, with a small, well-scoped set of mismappings (FUND_REWARD, CANCEL/REJECT_SWAP, NFT_PARTICIPATION_REWARD, mint-basis, BUY_SUBSCRIPTION, LP divergence). None are high-frequency for a typical trader, and most err toward non-recognition rather than over-taxation.

---

## 4. Prioritized fixes (not yet applied)

**High (real tax impact):**
1. **EVM airdrop income** — set `is_income` + FMV basis when Moralis `category==='airdrop'` (add an EVM income detector or handle it in `parseMoralisPage`). Currently silently dropped → zero-basis later sale.
2. **Helius `FUND_REWARD`** — reclassify out of `income` (it's an outflow) to stop phantom income.
3. **Helius `CANCEL_SWAP` / `REJECT_SWAP`** — route to a non-taxable/skip branch instead of the swap disposal path.

**Medium:**
4. Guard the Moralis `postProcess` swap-merge against `borrow`/`deposit`/`withdraw` categories (stop over-taxing collateral posts and LP adds).
5. Map Helius `NFT_PARTICIPATION_REWARD` → income.
6. Align the engine's LP branches to also match the underscore forms `ADD_LIQUIDITY`/`REMOVE_LIQUIDITY`/`WITHDRAW_LIQUIDITY`.
7. Map `BUY_SUBSCRIPTION` (spend/disposal) and `addCollateralType` (→ `defi`) explicitly.

**Low:**
8. Treat Moralis `burn` (and Helius `BURN_NFT`) as disposals so capital losses are realized.
9. Mirror the Helius external-send→disposal / external-receive→acquisition remap for Moralis so spends and basis are captured.
10. Price NFT legs (both providers leave `value_usd=0`) so NFT sale gains aren't overstated.

_These are findings only — no code was changed by this audit._
