# Gemini & Kraken — Transaction Types & Import Testing

> Engineering reference for the Gemini and Kraken exchange importers. Covers the complete
> transaction/type taxonomy for each exchange, the US tax treatment of every type, how our
> current code maps them, and how to test the integrations without real funds.
>
> Primary source files:
> - `src/lib/exchange-clients.ts` (KrakenClient `:274-604`, GeminiClient `:936-1183`)
> - `src/lib/transaction-categorizer.ts` (`getCategory` `:464-472`)
> - `src/app/api/exchanges/connect/route.ts` (auth/connectivity test)
> - `src/app/api/exchanges/sync/route.ts` (parsing → persistence pipeline)

---

## 1. Overview

We integrate two centralized exchanges as data sources for cost-basis and gain/loss
calculation:

- **Gemini** — pulled via `GeminiClient` (`exchange-clients.ts:936-1183`). We read spot fills
  (`POST /v1/mytrades`) and fiat/crypto movements (`POST /v1/transfers`). Auth is HMAC-signed
  POST with a base64 JSON payload.
- **Kraken** — pulled via `KrakenClient` (`exchange-clients.ts:274-604`). We read fills
  (`POST /0/private/TradesHistory`) and the double-entry ledger (`POST /0/private/Ledgers`).
  Auth is the Kraken `API-Sign` HMAC-SHA512 scheme.

Both clients expose the same shape to the pipeline: `getAllTransactions(startMs, endMs)` is what
sync calls (`sync/route.ts:170-200`), and `testConnection()` is what connect calls
(`connect/route.ts:181-208`). Each returned row is inserted at `sync/route.ts:317-342`, with
`is_income` set only when `getCategory(tx.type) === "income"` (`sync/route.ts:335`).

There are **two independent testing layers**, and a bug can live in either:

1. **Auth / connectivity layer** — Can we sign a request correctly and reach the exchange? This
   is what `testConnection()` exercises. Failures here are signature (`API-Sign`/HMAC), nonce,
   clock-skew, or permission-scope problems. Testable with an empty or read-only account.
2. **Parsing / classification pipeline** — Given a real response body, do we map every
   `type`/`side`/`subtype` to the correct internal category, income flag, fee, and USD value?
   This is where the coverage gaps in §5 live. Best tested **offline with fixtures**, because
   the failure modes (e.g. staking rewards silently booked as non-taxable) never throw — they
   just produce wrong tax numbers.

---

## 2. How to test (no real funds needed)

### Gemini

**Verified facts:** Gemini runs a working sandbox at `https://api.sandbox.gemini.com` (public
endpoints return HTTP 200). `GeminiClient` **already supports it** via a `sandbox` boolean
constructor arg (`exchange-clients.ts:942-949`): when true it points `baseURL` at
`https://api.sandbox.gemini.com` instead of `https://api.gemini.com`. The sandbox account starts
with fake balances, so you can place trades and simulate deposits/withdrawals for free.

Step-by-step:

1. Create a free sandbox account at `https://exchange.sandbox.gemini.com`.
2. In sandbox settings, generate API keys (key + secret). Grant the trading/fund-management read
   scopes.
3. Use the sandbox's fake balance to place a few test trades (both a USD-quoted pair like
   `btcusd` and, ideally, a crypto/crypto pair to exercise the two-legged case), plus at least
   one simulated **deposit** and one **withdrawal**, and — if the sandbox supports it — an Earn/
   staking allocation so a `Reward`/`Interest` row exists.
4. Connect through our app and run the full **connect → sync → cost-basis** pipeline; verify the
   fills, transfers, fees, and (critically) any reward rows land with the right category and
   `is_income`.

**Does the route pass `sandbox:true`?** Yes — and no code change is required for the common case.
Both the connect route (`connect/route.ts:201-203`) and the sync route (`sync/route.ts:196-197`)
**auto-detect** sandbox from the key string:

```ts
const isSandbox = apiKey.startsWith("master-") || apiKey.includes("sandbox");
const geminiClient = new GeminiClient(apiKey, apiSecret, isSandbox);
```

Caveats worth flagging (the heuristic is fragile):
- An **account-scoped** sandbox key starts with `account-`, not `master-`. If such a key does not
  contain the substring `sandbox`, it will **not** be auto-detected and will hit production. If
  your sandbox key isn't detected, either use a master-scoped key or add its prefix to the check.
- Conversely, a **production master-scoped** key also starts with `master-`, so this heuristic
  would wrongly route it to the sandbox. If we ever support master keys in production, replace the
  prefix guess with an explicit "this is a sandbox connection" UI toggle passed through the
  request body (one added boolean field on the connect/sync payload → forwarded to the
  constructor).

### Kraken

**Verified facts:** Kraken has **no spot sandbox/testnet** (the Futures demo environment does not
cover spot ledgers/trades). `api.kraken.com` public endpoints return HTTP 200, so connectivity is
reachable. That leaves three complementary no-funds options:

**(a) Real free account, read-only key.** Create a free Kraken account and complete the minimum
verification needed to generate API keys. Grant a **read-only** key with only *Query Ledger
Entries* and *Query Closed Orders & Trades* permissions (no trade/withdraw scope). Point our
client at it with a small or **empty** account. This validates the real auth path (`API-Sign`
HMAC-SHA512, nonce handling) and our **empty-data handling** (empty `result.ledger`/
`result.trades` maps, `count = 0`) end-to-end, with zero funds at risk.

**(b) Unit-test the signing against Kraken's documented worked example.** Kraken's API docs
publish a canonical `API-Sign` example (fixed private key, nonce, path, and POST data → expected
signature). Extract our signing routine and assert it reproduces that exact signature. This proves
the auth implementation is correct with **no account at all**. To do it: pull the documented
inputs (URI path `/0/private/AddOrder`, the sample nonce + payload, the sample base64 secret) into
a vitest case, call the client's signer, and `expect(sig).toBe(<documented signature>)`.

**(c) Hit public endpoints to validate HTTP/error plumbing.** Call `GET /0/public/Time` and
`GET /0/public/AssetPairs`. These need no auth and confirm base URL, HTTP client, timeout, and
error-envelope parsing (Kraken returns `{ error: [...], result: {...} }`; assert we surface a
non-empty `error` array as a thrown error).

### Both (offline)

**Fixture-based parser tests** are the highest-value tests because they catch the classification
gaps in §5 that never throw. Capture representative response bodies (from each exchange's docs
examples and, where possible, a real read-only pull) for **trades**, **ledgers** (Kraken), and
**transfers** (Gemini), save them as JSON fixtures, and drive them through the real code path:
client parser → `getCategory` → cost-basis. Assert on the produced rows.

Add vitest cases such as:
- Kraken ledger fixture containing a `staking` row with **positive `amount`** → assert the row is
  categorized **income** and `is_income === true`.
- Kraken `deposit`/`withdrawal` rows → assert `deposit`/`withdrawal` categories (not `transfer`).
- Kraken trade fee in a non-USD quote → assert the fee is captured numerically, not just in
  `notes`.
- Gemini `Reward` transfer → assert **income**, not `deposit`.
- Gemini crypto/crypto `Buy` fill → assert both legs (or at minimum a non-zero `value_usd`).
- De-dup: Gemini `Advanced` + `Complete` transfer with the same `advanceEid` → assert one event.

---

## 3. Gemini — complete transaction/type reference

Base URL `https://api.gemini.com` (sandbox `https://api.sandbox.gemini.com`). All endpoints are
private HMAC-signed POSTs. Confidence tags from research: ✅ verified; ⚠️ needs-review.

### 3.1 `POST /v1/mytrades` — past trades (fills)

Request: `symbol`, `limit_trades`, `timestamp`, `account`. Key fields: `price`, `amount`, `type`,
`aggressor`, `fee_currency`, `fee_amount`, `tid`, `order_id`, `client_order_id`,
`is_auction_fill`, `is_clearing_fill`, `exchange` (deprecated `"gemini"`), `timestamp`/
`timestampms`, and `break` (present only on reversed trades).

| `type` (side) | Meaning | US tax treatment |
|---|---|---|
| `Buy` ✅ | Account acquired the base asset. | **Acquisition.** Cost basis = `amount × price + fee` for USD/GUSD-quoted pairs. Not a disposal by itself. |
| `Sell` ✅ | Account disposed of the base asset. | **Taxable disposal** (capital gain/loss). Proceeds = `amount × price − fee`. |
| any side, **crypto/crypto pair** ⚠️ | One fill is simultaneously a disposal of the quote asset and acquisition of the base (or vice-versa). | **Both legs taxable** — do not treat a "Buy" on a crypto/crypto market as a non-event. |

Fee & reversal handling:

| Field/value | Meaning | US tax treatment |
|---|---|---|
| `fee_amount` / `fee_currency` | Trading fee and the currency it was charged in. | Add to basis on a buy; subtract from proceeds on a sell. If paid in crypto, paying the fee is itself a **micro-disposal** of `fee_currency`. |
| `break` present ⚠️ (values recalled: `manual`, `credit`, `debit`) | Trade was reversed/broken. | **Exclude / net out** — not a real economic event; otherwise phantom gain/loss. |
| `aggressor`, `is_auction_fill`, `is_clearing_fill`, `exchange`, `tid`, `order_id` | Execution metadata. | No tax effect. |

### 3.2 `POST /v1/transfers` — deposits & withdrawals (v2 adds multichain fields)

Request: `currency`, `timestamp`, `limit_transfers`, `account`,
`show_completed_deposit_advances` (default → `true` as of 2025-12-16). Fields: `type`, `status`,
`currency`, `amount`, `feeAmount`, `feeCurrency`, `method`, `txHash`, `outputIdx`, `destination`,
`network` (v2), `eid`, `advanceEid`, `purpose`, `isDust`, `timestampms`.

| `type` | Meaning | US tax treatment |
|---|---|---|
| `Deposit` ✅ | Funds moved into Gemini (fiat funding or your own crypto arriving). | **Non-taxable transfer-in.** Basis carries over from origin — Gemini does not know your basis; importer must track it. |
| `Withdrawal` ✅ | Funds moved out of Gemini. | Default = **non-taxable self-transfer**. ⚠️ API can't distinguish a self-transfer from a payment/gift/sale — **flag for review**; a payment to a third party is a taxable disposal. Crypto `feeAmount` = small disposal of the fee asset. |
| `Reward` ✅ (added 2023-01-19) | Promotional/referral/credit-card-rewards crypto credited by Gemini. | **Ordinary income at FMV** on receipt (referral/signup/promo); basis = that FMV. Credit-card crypto-back is arguably a nontaxable rebate with basis = FMV — disambiguate via `purpose`. |

Status enum (de-dup critical):

| `status` | Meaning | Handling |
|---|---|---|
| `Advanced` ✅ | Deposit advance — provisionally credited before full on-chain confirmation. | Same deposit can appear **twice** (`Advanced` then `Complete`), linked by `advanceEid`. |
| `Complete` ✅ | Fully settled/confirmed. | With `show_completed_deposit_advances=true` (now default) you get both — **collapse to one economic event** via `advanceEid`. |
| other (pending/cancelled) ⚠️ | Not in documented enum. | Treat as needs-review. |

`method` (fiat rail, no tax effect): `ACH`, `Wire` ✅, `CreditCard` ✅ (2023-01-19), plus debit/
SEN/PayPal-style rails ⚠️.

### 3.3 `POST /v1/transactions` — unified account ledger (added 2022-09-14) ⚠️

A unified transaction ledger surfacing trades, transfers, fees, rewards, and staking/earn
movements with a `type`/`eid`/`timestampms`/`currency`/`amount`/`feeAmount` shape (exact schema
not verifiable verbatim). **Tax:** map each row's `type` to the corresponding rule in this
document; use as a reconciliation cross-check, not the sole source. Flag unknown `type` values.

### 3.4 Write endpoints that create Transfer records

| Endpoint | Produces | US tax treatment |
|---|---|---|
| `POST /v1/withdraw/:currency` | A `Withdrawal` transfer record (`destination`, `amount`, `txHash`, `withdrawalId`, `fee` ⚠️). | Non-taxable self-transfer by default; fee = crypto disposal; flag if a payment. |
| `POST /v1/account/transfer/:currency` ⚠️ | Internal master/sub-account move. | **Always non-taxable self-transfer** — never a disposal. Classify so cross-account moves aren't mistaken for buys/sells. |
| Fiat withdrawals (bank/wire) | — | Non-taxable. |

### 3.5 `POST /v1/custodyaccountfees` — custody fees (added 2022-05-18) ⚠️

Custody fee charges on Gemini Custody balances (fee `amount`, `currency`, `timestampms`, balance
snapshot). **Tax:** the fee is paid in the custodied crypto, so each charge is a **disposal** of
that quantity (capital gain/loss vs. its basis). The fee expense itself is generally a
nondeductible investment expense for individuals (post-TCJA). Book the disposal; don't book income.

### 3.6 Gemini Earn — `/v1/earn/history` (historical, program wound down) ⚠️

Still required for importing 2021–2023 history. `transactions[]` fields: `earnTransactionId`,
`transactionType`, `amount`, `amountCurrency`, `priceCurrency`, `priceAmount`, `dateTime`.

| `transactionType` | Meaning | US tax treatment |
|---|---|---|
| `Deposit` ✅ | Crypto moved into Earn (lent out). | Non-taxable self-transfer (⚠️ minority view treats lending-to-Genesis as a disposal; most software treats as transfer). |
| `Redeem` ✅ | Crypto moved out of Earn back to balance. | Non-taxable self-transfer. |
| `Interest` ✅ | Interest paid to you. | **Ordinary income at FMV** on receipt; sets basis. The key taxable Earn event. |
| `AdminDebit` ⚠️ | Administrative removal/clawback. | Correction/reversal; generally non-taxable adjustment (or a disposal if a real loss). **Flag.** |
| `AdminCredit` ⚠️ | Administrative crediting (make-good/bonus). | Ordinary income at FMV if a net gain; non-taxable if it reverses a prior debit. **Flag.** |

> Genesis default/recovery distributions are not fully captured here and typically require manual
> capital-loss / recovery treatment.

### 3.7 Staking — `/v1/staking/*` (current) — `/v1/staking/history` is the tax ledger

Fields ⚠️: `transactionId`/`earnTransactionId`, `transactionType`, `amountCurrency`, `amount`,
`priceCurrency`, `priceAmount`, `dateTime`, possibly `state`.

| `transactionType` | Meaning | US tax treatment |
|---|---|---|
| `Deposit` ✅ | Crypto staked. | Non-taxable self-transfer. |
| `Redeem` ✅ | Crypto unstaked/withdrawn. | Non-taxable self-transfer. |
| `Interest` ✅ | Staking reward paid (Gemini labels rewards `Interest` here). | **Ordinary income at FMV** when received/credited (dominion & control); sets basis. Core taxable staking event. |
| `AdminDebit` ⚠️ | Administrative removal. | Correction/reversal; generally non-taxable. **Flag.** |
| `AdminCredit` ⚠️ | Administrative credit. | Ordinary income if net gain, else reversal. **Flag.** |

Non-tax endpoints: `/v1/balances/staking`, `/v1/staking/rates`, `/v1/staking/rewards` (accrual/
APY — use only to reconcile `Interest` rows).

### 3.8 Other endpoints that can produce taxable events (lower priority)

| Area | Endpoint(s) | US tax treatment |
|---|---|---|
| Clearing / OTC block trades | `/v1/clearing/*` | Same as trades (Buy = acquisition, Sell = disposal); may show as `is_clearing_fill` in mytrades. |
| Derivatives / perpetuals | `/rest-api/trading/derivatives` | Not US-retail; funding payments + realized PnL taxable (ordinary/§1256 varies). **Flag** if non-US/institutional. |
| Margin trading | `/rest-api/trading/margin` | Interest paid and liquidations have tax effects. **Flag.** |
| Prediction markets | `/rest-api/prediction-markets/*` | Winnings/losses likely ordinary income / possibly gambling treatment. **Flag** (emerging). |

### 3.9 Gemini quick classification map

| Source field/value | Tax bucket |
|---|---|
| mytrades `type=Buy` (USD pair) | Acquisition (basis) |
| mytrades `type=Sell` (USD pair) | **Taxable disposal** (capital) |
| mytrades any side, crypto/crypto pair | **Both legs taxable** |
| mytrades `fee_amount` | Basis add (buy) / proceeds reduce (sell); crypto fee = micro-disposal |
| mytrades `break` present | **Exclude** (reversed) |
| transfers `Deposit` | Non-taxable transfer-in (carry basis) |
| transfers `Withdrawal` | Non-taxable self-transfer (flag if payment); fee = disposal |
| transfers `Reward` | **Ordinary income** at FMV (credit-card-back = rebate w/ basis) |
| transfers `Advanced` + `Complete` (same `advanceEid`) | **De-dup to one event** |
| earn/staking `Deposit` / `Redeem` | Non-taxable self-transfer |
| earn/staking `Interest` | **Ordinary income** at FMV |
| earn/staking `AdminCredit` / `AdminDebit` | Income if net gain / reversal (flag) |
| custody fee charge | **Disposal** of fee crypto (fee generally nondeductible) |
| internal `/account/transfer` | Non-taxable self-transfer |

---

## 4. Kraken — complete ledger + trade type reference

The **ledger** (`POST /0/private/Ledgers`) is the authoritative, per-asset, signed, double-entry
record and is the correct primary source for a tax importer. A trade of BTC for USD produces
**two** ledger rows (one negative BTC, one positive USD) sharing a `refid`. `TradesHistory` is
best used only to enrich price/pair/fee detail.

### 4.1 Ledger entry fields

| Field | Meaning |
|---|---|
| `refid` | Reference id of the parent transaction; multiple rows share it — join to reconstruct legs + fee. |
| `time` | Unix timestamp (UTC). |
| `type` | Category of entry (enum below). |
| `subtype` | Extra info "where applicable"; often `""`. |
| `aclass` | Asset class (`currency`; also forex/equity classes for xstocks). |
| `asset` | Kraken ticker (`ZGBP`, `XXBT`, `XETH`; staked variants carry `.S`/`.F`). |
| `amount` | **Signed** balance change — negative = outflow/debit, positive = inflow/credit. |
| `fee` | Fee charged in that asset. |
| `balance` | Resulting balance. Identity: `new = old + amount − fee`. |

### 4.2 Ledger `type` — complete list + US tax treatment

Two authoritative enumerations exist and differ; a robust importer should accept the **union**.
REST `Get Ledgers`: `none, trade, deposit, withdrawal, transfer, margin, adjustment, rollover,
spend, receive, settled, credit, staking, reward, dividend, sale, conversion, nfttrade,
nftcreatorfee, nftrebate, custodytransfer`. WebSocket-v2 `Balances` adds `reserve` and
`creator_fee` (WS spelling of `nftcreatorfee`) and omits the `nft*` REST spellings.
**[CSV/observed]** extra UI/CSV labels: `earn`, `invite bonus`.

| `type` | Plain meaning | US tax treatment |
|---|---|---|
| `trade` | Non-margin spot exchange; 2 rows share `refid` (negative = disposed, positive = acquired). | **Taxable disposal** of sold asset + **acquisition** (basis) of bought asset. `fee` adjusts proceeds/basis. Fiat legs aren't capital assets. |
| `deposit` | Incoming funds (external crypto, fiat, card, Futures→Spot). | **Non-taxable transfer-in** (crypto carries basis; fiat non-taxable). ⚠️ Rewards have been mislabeled `deposit` in some CSVs — see §4.5. |
| `withdrawal` | Outgoing funds (external address/bank, or Spot→Futures). | **Non-taxable transfer-out.** Crypto `withdrawal fee` is technically a disposal of the fee quantity (usually de-minimis). |
| `transfer` | Catch-all internal/exceptional move: **airdrops, hard forks**, OTC-desk, Futures-wallet moves; staking flows via `subtype`. | **Depends on context/`subtype`:** airdrop/fork w/ dominion & control = **ordinary income at FMV** (sets basis); wallet-to-wallet = non-taxable. **Flag ambiguous.** |
| `margin` | Ledger impact of opening/closing a leveraged position; realized P&L on close. | **Taxable capital gain/loss** on realized P&L (in collateral/quote ccy). |
| `rollover` | Periodic rollover fee to hold an open margin position. | **Fee/expense** — reduces net margin P&L; not a disposal. |
| `settled` | Settlement of a margin position back to spot. | **Realized capital gain/loss** component (or non-taxable return of collateral); pair via `refid`. |
| `adjustment` | Manual/system balance correction or out-of-band conversion (delistings, error fixes). | **Depends** — usually non-taxable correction; may be income if it credits new value, or disposal/acquisition if it swaps assets. **Flag.** |
| `spend` | Outgoing leg of Buy Crypto / Instant Buy (asset paid with); paired with `receive`. | Spent **crypto** → **taxable disposal**; spent **fiat** → non-taxable outflow (basis for received crypto). |
| `receive` | Incoming leg of Buy Crypto / Instant Buy; paired with `spend`. | **Acquisition** (sets basis). Not income. |
| `sale` | Instant Sell via Buy/Sell Crypto (materializes as paired `spend`/`receive` in CSV; also a UI filter). | **Taxable disposal** of the sold crypto; fiat received = proceeds. Treat like a `trade` disposal. |
| `credit` | Credit extended to the account (instant-funding, negative-balance/loan, or promo). | **Depends** — loan/instant-funding = non-taxable liability; promo/bonus = **ordinary income at FMV**. **Flag**; inspect `subtype`/`refid`. |
| `reserve` (WS only) | Funds reserved/held (e.g. locked against an open order). | **Non-taxable** internal hold. |
| `conversion` | Dust conversion, auto-conversion of delisted tokens, ticker/asset migration, fiat conversion. | **Depends** — cross-asset swap = **taxable disposal/acquisition**; pure 1:1 rename = non-taxable. **Flag**; inspect both legs. |
| `staking` | (a) Movement into/out of staking (via `subtype`); (b) historically the **reward payout** itself (positive `amount`). | **Movement legs = non-taxable transfer.** **Reward payout leg (positive `amount`) = ORDINARY INCOME at FMV**, sets basis. See §4.5 — the key case. |
| `reward` | Kraken Rewards / Earn reward accrual, opt-in bonuses. | **Ordinary income at FMV** on credit date; sets basis. |
| `dividend` | Dividend distributions (tokenized equities / xstocks, reward-style distributions). | **Ordinary/dividend income at FMV** when received. |
| `nfttrade` | NFT purchase or sale on Kraken's NFT marketplace. | Buy: disposal of paying currency + acquisition of NFT. Sell: **taxable disposal** of NFT (may be a collectible). |
| `nftcreatorfee` / `creator_fee` | NFT creator royalty paid or received. | Received (creator) = **ordinary/royalty income**; paid = fee/cost (adjusts proceeds/basis). |
| `nftrebate` | Rebate on an NFT transaction. | Usually reduces cost/fee of the related trade; standalone credit → income. **Flag.** |
| `custodytransfer` | Transfer into/out of qualified custody. | **Non-taxable transfer** (same owner, different venue). |
| `none` | Placeholder / unclassified. | Ignore (no economic event). |
| `earn` **[CSV]** | UI/CSV umbrella for staking + rewards (allocations, deallocations, payouts). | Movement subtypes = non-taxable; **reward** subtype/payouts = **ordinary income at FMV**. |
| `invite bonus` **[CSV]** | Referral / invite bonus credit. | **Ordinary income at FMV** when received. |

### 4.3 Ledger `subtype` — complete list

The only **officially enumerated** subtypes (WSv2 `Balances`) are the six wallet-to-wallet
transfer markers — all **non-taxable internal transfers**:

| `subtype` | When it appears | Meaning |
|---|---|---|
| `spottofutures` | `withdrawal`/`transfer` Spot → Futures | Internal move to Futures |
| `spotfromfutures` | `deposit`/`transfer` Futures → Spot | Internal move from Futures |
| `spottostaking` | `transfer`/`staking` allocation Spot → Earn | You allocate/stake an asset |
| `stakingfromspot` | Paired credit into staking/Earn balance | Asset now in staking wallet |
| `stakingtospot` | `unstake`/deallocation Staking → Spot | You deallocate/unstake |
| `spotfromstaking` | Paired credit back into Spot | Asset returned to Spot |

**[CSV/observed] additional subtype strings** (support/CSV, lower certainty): `allocation`,
`deallocation`, `autoallocate`, `migration` (staking allocation lifecycle incl. legacy-Staking→
Earn migration) — all **non-taxable transfers**; and `reward` (weekly/bi-weekly payout marker) =
**ordinary income**.

**Wallet context (WSv2):** wallet `type` is `spot` or `earn`; earn sub-wallets are `bonded`,
`flexible`, `liquid`, `locked` (spot = `main`).

**WSv2 `category`** (finer than `type`, useful tie-breaker): `deposit, withdrawal, trade,
margin-trade, margin-settle, margin-conversion, conversion, credit, marginrollover,
staking-rewards, instant, equity-trade, airdrop, equity-dividend, reward-bonus, nft, block-trade`.
Income-bearing: `staking-rewards`, `airdrop`, `equity-dividend`, `reward-bonus`. Disposal/
acquisition trade variants: `instant`, `equity-trade`, `block-trade`.

### 4.4 `POST /0/private/TradesHistory`

Individual fills; enrich `trade`/`margin` ledger rows with pair/price/fee. Fields: `ordertxid`,
`postxid`, `pair` (e.g. `XXBTZUSD` → split base/quote), `time`, `type` (`buy`/`sell`),
`ordertype` (`market`/`limit`/`stop-loss`/`take-profit`/`settle-position`/etc. — tax-neutral),
`price`, `cost`, `fee` (**quote currency**), `vol` (base), `margin`, `leverage`, `misc` (`closing`
= closed part of a position), `maker`, `aclass`, `trade_id`, `ledgers` (join key back to the
ledger), `tradeordertype`; position-close fields `posstatus`/`cprice`/`ccost`/`cfee`/`cvol`/
`cmargin`/**`net`** (realized P&L)/`trades`.

| Fill `type` | US tax treatment |
|---|---|
| `buy` | Acquisition of base (basis = `cost + fee`); disposal of quote (fiat → non-capital; crypto quote → taxable disposal). |
| `sell` | **Taxable disposal** of base; proceeds = `cost − fee`; quote received acquired. |

Notes: `ordertype` has no tax effect (audit only). Fees are quoted in the **quote currency** at
trade level and mirrored per-asset in the ledger `fee` column — don't double-count. For closed
margin positions use `net` as the taxable gain/loss; `rollover` reduces it. **Precision caveat:**
cost/fee/price/vol use pair-level precision, not asset precision — treat TradesHistory numbers as
display-rounded and prefer ledger `amount` for basis. The request `type` filter here is a
**position filter** (`all`/`any position`/`closed position`/`closing position`/`no position`),
distinct from the per-fill `buy`/`sell`.

### 4.5 IMPORTANT — how Kraken staking/rewards income lands in the ledger

Staking/earn rewards are **US ordinary income at FMV on the credit date** (Rev. Rul. 2023-14 —
includible when you gain dominion and control, reportable even if unsold). Kraken issues a
**Form 1099-MISC** aggregating staking + airdrops + rewards (VWAP→USD) at totals ≥ $600.

Reward rows appear differently by era/product — **accept all** as income:
- `type = reward` — the modern schema value.
- `type = staking` with **positive `amount`** (and no transfer subtype) — the classic reward row.
  Distinguish from `staking` rows carrying a transfer subtype (non-taxable movement).
- WSv2 `category = staking-rewards` — confirms a payout regardless of coarse `type`.
- **[CSV/observed]** In some CSV exports, rewards appear as **`deposit` rows on the staked-asset
  variant** (e.g. `DOT.S`) or under the `earn` label with a `reward` subtype. **Flag `deposit`
  rows whose asset carries a `.S`/`.F` suffix as candidate reward income** — a naive importer
  treats them as non-taxable transfers.

Practical income rule: **income = rows where `type ∈ {reward, dividend}` OR (`type = staking` AND
`amount > 0` AND subtype not a transfer marker) OR category ∈ {staking-rewards, airdrop,
equity-dividend, reward-bonus} OR type = "invite bonus"** → book as ordinary income at FMV(time)
and set basis. Anything with a `spot↔staking`/`spot↔futures`/`custodytransfer` subtype is a
non-taxable transfer.

### 4.6 Kraken importer classification cheat-sheet (US)

| Bucket | Ledger signals |
|---|---|
| Taxable disposal | `trade`(−leg), `sale`, `spend`(crypto), `margin`/`settled`(P&L), `conversion`(cross-asset), `nfttrade`(sell) |
| Acquisition (set basis) | `trade`(+leg), `receive`, `buy` fills, `deposit`(external crypto — carry basis) |
| Ordinary income (FMV @ credit) | `reward`, `dividend`, `staking`(+amount, non-transfer), `transfer`(airdrop/fork), `invite bonus`, category `staking-rewards`/`airdrop`/`equity-dividend`/`reward-bonus`, `nftcreatorfee` received |
| Non-taxable transfer | `deposit`/`withdrawal`(own funds), all `spot↔futures`/`spot↔staking` subtypes, `custodytransfer`, `reserve`, allocation/deallocation/migration subtypes |
| Fee / expense | trade `fee`, `rollover`, withdrawal `fee`, `nftcreatorfee` paid |
| Flag for review | `adjustment`, `credit`, `conversion` (rename vs swap), `nftrebate`, any `deposit` on a staked-suffix asset |

---

## 5. Coverage matrix — what our code handles today

Cross-referencing §3/§4 against the current code (`exchange-clients.ts`,
`transaction-categorizer.ts`). **Status:** handled / partial / GAP.

### 5.1 Gemini coverage

| Exchange | Source type | Our handling | Status | Notes |
|---|---|---|---|---|
| Gemini | mytrades `Buy` (USD pair) | `"buy"` → `buy` (`:1070-1086`, map `:311`) | handled | Basis/value correct for USD quotes. |
| Gemini | mytrades `Sell` (USD pair) | `"sell"` → `sell` (`:311/312`) | handled | Proceeds correct for USD quotes. |
| Gemini | mytrades crypto/crypto pair | one-legged `buy`/`sell`, `value_usd=0`, `price_per_unit=null` (`:1078,1089-1090`) | GAP | No two-sided rows emitted; non-USD trade recorded at $0 with fee only in `notes`. Both legs never booked. |
| Gemini | mytrades `fee_amount` (USD/DAI quote) | `fee_usd` set only when `isUsdFee` (`:1082`); `isUsdQuote` includes DAI but `isUsdFee` does not | partial | DAI-denominated fee dropped though trade value treated as USD (list inconsistency). |
| Gemini | mytrades `fee_amount` (non-USD quote) | fee only in `notes` (`:1065`), no numeric capture | GAP | Non-USD trade fees never captured as a number. |
| Gemini | mytrades `break` (reversed) | not read | GAP | Reversed trades not excluded → phantom gain/loss risk. |
| Gemini | transfers `Deposit` | `"deposit"` → `deposit` category (`:1137`, `:285`) | handled | Correctly non-taxable ($0). |
| Gemini | transfers `Withdrawal` | `"withdrawal"` → `withdrawal` (`:1143`, `:384`) | partial | Correct default, but no flag for possible third-party payment (taxable disposal). |
| Gemini | transfers `Reward` | in `depositTypes` → `"deposit"` (non-taxable) (`:1137`) | **GAP** | Rewards booked as non-taxable deposit; **`is_income` never set** for Gemini rewards/staking income. |
| Gemini | transfers `AdminCredit` | in `depositTypes` → `deposit` | partial | Should be income-if-net-gain / flag; currently silently non-taxable. |
| Gemini | transfers `AdminDebit` | falls to else → `"withdrawal"` | partial | Treated as withdrawal rather than reversal/adjustment; not flagged. |
| Gemini | transfers `Advanced`+`Complete` de-dup | both kept if status ∈ {Complete, Advanced} (`:1131`); no `advanceEid` collapse | GAP | Deposit advances can double-count; `advanceEid` never read. |
| Gemini | transfer `feeAmount` currency | stored into `fee_usd` regardless of `currency` (`:1148`) | GAP | Non-USD fee mislabeled as USD. |
| Gemini | unknown transfer types | else branch → `"withdrawal"` (`:1138,1143`) | GAP | Any new/unknown type silently treated as a withdrawal. |
| Gemini | `/v1/transactions` ledger | not called | GAP | No reconciliation ledger used. |
| Gemini | custody fees `/v1/custodyaccountfees` | not called | GAP | Custody-fee disposals never imported. |
| Gemini | Earn `/v1/earn/history` (`Interest`/`Deposit`/`Redeem`) | not called | GAP | 2021–2023 Earn interest income never imported. |
| Gemini | Staking `/v1/staking/history` (`Interest`) | not called | GAP | Staking reward income never imported. |
| Gemini | clearing / derivatives / margin / prediction | not called | GAP (low priority) | Out of current scope; flag if account is institutional/non-US. |
| Gemini | pagination (trades / transfers) | single call, `limit_trades:500` / `limit_transfers:50`, no loop, no `symbol` (`:1055,1117,1172`) | GAP | Trades > 500 and transfers > 50 silently truncated. |

### 5.2 Kraken coverage

| Exchange | Source type | Our handling | Status | Notes |
|---|---|---|---|---|
| Kraken | TradesHistory `buy` | `"buy"` → `buy` (`:442-455`) | handled | USD-quote basis correct. |
| Kraken | TradesHistory `sell` | `"sell"` → `sell` | handled | USD-quote proceeds correct. |
| Kraken | trade fee (USD quote) | `fee_usd` set only when `isUsdQuote && fee>0` (`:460`) | partial | Correct only for USD-equivalent quotes. |
| Kraken | trade fee (non-USD quote, e.g. ETH/BTC) | fee only in `notes` (`:465`) | GAP | Non-USD trade fees never captured numerically. |
| Kraken | non-USD trade valuation | `value_usd=0`, `price_per_unit=null` (`:458-459`); "no enrich phase" (`sync/route.ts:386-388`) | GAP | Non-USD trades may persist at $0. |
| Kraken | ledger `deposit` | requested via `getLedgers(...,"deposit")` → `"Receive"` → **`transfer`** (`:519,:396,:581`) | partial/GAP | Reaches code, but mapped to `transfer` (non-$0) instead of the dedicated `deposit` ($0) category. |
| Kraken | ledger `withdrawal` | `getLedgers(...,"withdrawal")` → `"Send"` → **`transfer`** (`:523,:395,:582`) | partial/GAP | Same mislabel: `transfer` instead of `withdrawal`. |
| Kraken | ledger `staking` (+amount, reward) | branch maps to `"Staking Reward"` → income (`:526,:386`) **but unreachable** | **GAP** | `getLedgers` only ever requests `deposit`/`withdrawal`, so staking rows are never fetched → **no staking income; `is_income` effectively never set for Kraken.** |
| Kraken | ledger `staking` (−amount, movement) | `"Staking"` → `staking` (`:432`) but unreachable | GAP | Never fetched. |
| Kraken | ledger `reward` | default branch → `reward` → income (`:302`) but unreachable | GAP | Never fetched (type not requested). |
| Kraken | ledger `dividend` | not mapped; would hit default → `other` | GAP | Dividend income not handled and not fetched. |
| Kraken | ledger `transfer` (airdrop/fork) | `amount>0`→`Receive`/`<0`→`Send` → `transfer` (`:530-532`) but unreachable | GAP | Airdrop/fork income never recognized (and not fetched). |
| Kraken | ledger `margin` | `"Margin"` → `buy` for both signs (`:387`) but unreachable | GAP | Sign ignored (loss not a sell) and not fetched. |
| Kraken | ledger `settled` / `rollover` | not mapped; unreachable | GAP | Margin settlement/rollover not handled or fetched. |
| Kraken | ledger `trade` | explicitly `continue` (skipped, `:533`) | handled (by design) | Trades come from TradesHistory instead; acceptable. |
| Kraken | ledger `spend`/`receive`/`sale` | default → categorizer (`spend`/`receive`→transfer) but unreachable | GAP | Instant Buy/Sell legs never fetched; `sale` disposal not booked. |
| Kraken | ledger `conversion` | not mapped; unreachable | GAP | Cross-asset conversions not handled/fetched. |
| Kraken | ledger `credit` / `adjustment` | not mapped; unreachable | GAP | No flag-for-review path; not fetched. |
| Kraken | ledger `nfttrade`/`nftcreatorfee`/`nftrebate`/`custodytransfer`/`reserve`/`none` | not mapped; unreachable | GAP (mostly low priority) | Not fetched; NFT income/fees and custody transfers unhandled. |
| Kraken | ledger `earn`/`invite bonus` (CSV labels) | not mapped; unreachable | GAP | API emits `staking`/`reward`/`credit`; still not fetched. |
| Kraken | subtypes (`spottostaking`, etc.) | `entry.subtype` is read (`:508-553`) but branches unreachable | GAP | Subtype read but never used because only deposit/withdrawal fetched. |
| Kraken | reward-as-`deposit` on `.S`/`.F` asset | `deposit` → `transfer`, no staked-suffix detection | GAP | Hidden reward income mis-booked as non-taxable transfer. |
| Kraken | ledger `fee` currency | `fee_usd = fee>0 ? Decimal(fee) : null` (`:548`) regardless of `entry.asset` | GAP | Ledger fee (in asset, e.g. BTC) mislabeled as USD. |
| Kraken | pagination (trades / ledgers) | 5000-row cap on both (`:475,:561`) | GAP | Large histories silently truncated. |

**Root cause of the biggest Kraken gaps:** `getDepositsAndWithdrawals` calls `getLedgers` only
with `type=deposit` and `type=withdrawal` (`:581-582`). Kraken therefore returns *only* those
ledger rows, so every other branch (`staking`, `reward`, `transfer`, `margin`, `settled`,
`conversion`, `spend`/`receive`/`sale`, default) is **dead code in the sync path**. All Kraken
income is effectively invisible.

---

## 6. Recommended fixes

Prioritized; each tied to the file to change. P0 = wrong tax numbers today.

**P0 — Kraken income is never imported (`exchange-clients.ts`, `getDepositsAndWithdrawals`
`:578-582` / `getAllTransactions` `:591-594`).** Stop restricting the ledger pull to
`deposit`/`withdrawal`. Fetch the **full ledger** (no server-side `type` filter, or iterate the
needed types) and classify by `type`/`subtype`/sign. This single change activates the already-
written `staking`/`reward`/`transfer`/`margin` branches (`:518-539`) and is the prerequisite for
every Kraken income fix below.

**P0 — Gemini `Reward` booked as non-taxable deposit (`exchange-clients.ts:1137`).** Remove
`Reward` (and reassess `AdminCredit`) from `depositTypes`; map `Reward`/`Interest` to an income
internal type so `getCategory(...) === "income"` and `is_income` is set (`sync/route.ts:335`).

**P0 — Kraken staking reward classification (`exchange-clients.ts` ledger switch `:518-539`;
`transaction-categorizer.ts`).** Once the full ledger is fetched: book `type=reward`/`dividend`,
`type=staking` with `amount>0` and no transfer subtype, and `deposit` rows on `.S`/`.F` assets as
**income**; keep transfer-subtype staking rows as non-taxable. Add the staked-suffix detection so
hidden rewards aren't mis-booked.

**P1 — Fee-currency mislabeling (both clients).** Kraken ledger fee `:548` and Gemini transfer fee
`:1148` store an asset-denominated fee into `fee_usd`. Store the fee amount with its actual
currency (or convert to USD) instead of assuming USD. Fix the Gemini `isUsdQuote`/`isUsdFee` DAI
inconsistency (`:1077` vs `:1082`).

**P1 — Deposits/withdrawals mislabeled as `transfer` (Kraken `exchange-clients.ts:395-396,
519-523`).** Map `deposit`→`deposit` and `withdrawal`→`withdrawal` categories so they are $0
internal movements under the CSV P&L model, not non-$0 `transfer`s.

**P1 — Non-USD trade valuation/fees left at $0 (both clients: Kraken `:458-460`, Gemini
`:1078,1082,1089-1090`).** Emit two-sided swap rows (populate `incoming_asset_symbol` etc.) for
crypto/crypto trades, or ensure a price-enrichment phase runs for exchange rows (the sync route
currently assumes exchange txns "arrive priced", `sync/route.ts:386-388`). Capture non-USD fees
numerically instead of only in `notes`.

**P1 — Gemini deposit-advance double-count (`exchange-clients.ts:1131`).** Read `advanceEid` and
collapse `Advanced`+`Complete` pairs to a single economic event.

**P1 — Pagination truncation.** Add offset loops: Gemini trades > 500 and transfers > 50 (single
calls, `:1055,1117`, no loop) and raise/paginate past Kraken's 5000-row caps (`:475,:561`).

**P2 — Unknown/ambiguous types default silently.** Gemini unknown transfer types fall to
`withdrawal` (`:1138,1143`) and Kraken unknowns fall to `other`. Route unrecognized types (and
Kraken `adjustment`/`credit`/`conversion`, Gemini `AdminDebit`) to a **flag-for-review** state
rather than a silent bucket. Add `break`-trade exclusion for Gemini (`:1063-1096`).

**P2 — Kraken margin sign + settlement (`exchange-clients.ts:387`, ledger switch).** Respect the
sign of `margin`/`settled` (loss = disposal/sell), use TradesHistory `net` for realized P&L, and
treat `rollover` as a fee.

**P2 — Add the missing Gemini income endpoints.** Wire up `/v1/earn/history` and
`/v1/staking/history` (`Interest` → income) for historical 2021–2023 coverage, plus
`/v1/custodyaccountfees` (each charge = disposal of the fee crypto).

**P3 — Reconciliation & lower-priority types.** Optionally use Gemini `/v1/transactions` and
Kraken WSv2 `category` as cross-checks; handle NFT/clearing/derivatives/prediction-market types
behind a flag for institutional/non-US accounts.

**Testing to lock these in:** add the vitest fixture cases from §2 (offline) — especially a Kraken
`staking` +amount row asserting `is_income === true`, a Gemini `Reward` asserting income, and
fee-currency assertions — so these regressions can't silently return.
