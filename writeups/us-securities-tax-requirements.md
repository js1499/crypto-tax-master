# US Securities Tax Support — Complete Feature Requirements

## Scope

Full US tax calculation and reporting for all tradeable security types, imported exclusively via CSV. This document defines every feature required to reach or exceed feature parity with TradeLog (the deepest existing engine) and TraderFyles (the most modern existing platform). The securities tax engine is a standalone product, fully independent from the existing crypto tax engine. The two engines do not share data, calculations, wash sale detection, or report generation. Each produces its own complete set of IRS forms and reports.

---

## 0. Investor vs. Trader Tax Status

The entire tax engine branches on a single user-level setting: **Investor** (default) or **Trader (Section 475 MTM)**. Every section below specifies how behavior differs between these two modes. This is not a preference — it's a fundamentally different tax regime that changes what forms are generated, whether wash sales apply, how gains/losses are classified, and where they're reported.

### 0.1 Investor Status (Default)

The standard treatment for anyone who buys and sells securities. All gains and losses are **capital** (short-term or long-term). Wash sale rules apply in full. Net capital losses are capped at **$3,000/year** against ordinary income; excess carries forward indefinitely. Reported on **Form 8949 and Schedule D**. Trading expenses are **not deductible** post-TCJA (2018+).

### 0.2 Trader Tax Status (TTS)

A taxpayer who trades frequently, substantially, and continuously with the intent to profit from short-term price movements — not dividends or long-term appreciation. There is no statutory bright-line test. The IRS and Tax Court evaluate: frequency (hundreds to thousands of trades/year), regularity (trading most market days), average holding period (days, not months), time devoted, and whether trading is the primary activity. Key cases: Endicott, Chen, Assaderaghi, Nelson.

A trader who does NOT make the 475(f) election retains capital gain/loss treatment and wash sale rules, but CAN deduct trading business expenses on **Schedule C** (data feeds, software, home office, education). This is "trader status without mark-to-market."

### 0.3 Section 475(f) Mark-to-Market Election

A trader who makes the 475(f) election gets mark-to-market accounting:

**What changes:**
- All positions are **deemed sold at FMV on December 31** each year. Open positions generate gain/loss as if sold. On January 1 they are deemed reacquired at that FMV (new cost basis).
- All gains and losses become **ordinary income/loss**, not capital. Reported on **Form 4797 Part II**, not Form 8949/Schedule D.
- Ordinary losses are **fully deductible** against all income — no $3,000 cap. A $200K trading loss offsets $200K of W-2 income dollar for dollar.
- **Wash sale rules do not apply.** Section 1091 only applies to capital losses; MTM losses are ordinary.
- Trading business expenses are deductible on **Schedule C**.
- The holding period resets annually — no long-term/short-term distinction.

**Election mechanics:**
- Must be filed by the due date of the return for the year PRIOR to the election year. (To use MTM for 2026, attach election to the 2025 return due April 2026.)
- New taxpayers: 75 days from the start of the tax year.
- Applies to the entire trading account. The taxpayer CAN segregate investment positions by clearly identifying them on their books before the start of the year (Section 475(f)(1)(B)). Segregated investment positions retain capital gain treatment and ARE subject to wash sales.
- Revocation requires IRS consent — effectively a one-way door.

**Transition year logic:**
- First year of election: all open positions on January 1 are deemed sold on the last business day of the prior year. This generates a **Section 481(a) adjustment** — a one-time gain/loss recognition event for every open lot.
- The Section 481(a) adjustment is reported on Form 4797.
- Our engine must generate a "Section 481 Adjustment Report" listing every position, its cost basis, its deemed sale price, and the resulting gain/loss.

**Implementation:**
- User setting: `tax_status` = `INVESTOR` | `TRADER_NO_MTM` | `TRADER_MTM`, set per tax year.
- When `TRADER_MTM`: bypass wash sale engine entirely, generate year-end deemed sale/repurchase events for all open positions, route all gains/losses to Form 4797, generate Section 481(a) report for transition year.
- When `TRADER_NO_MTM`: apply full wash sale rules (same as investor), additionally generate Schedule C for business expenses.
- When `INVESTOR`: standard capital gain treatment, full wash sales, Form 8949 + Schedule D.

---

## 1. Supported Asset Classes

Every asset class below must be importable via CSV and processed through the appropriate tax engine.

### 1.1 Stocks (Common and Preferred)
Standard equity shares. Full lot tracking, all cost basis methods, wash sales, corporate actions, dividends.

### 1.2 ETFs (Exchange-Traded Funds)
Treated identically to stocks for tax purposes. Full lot tracking, wash sales, dividends, corporate actions (splits, mergers). Capital gain distributions from the fund are captured as dividend events.

### 1.3 Mutual Funds
Same as ETFs plus: **average cost basis method** (Section 1012), DRIP lot generation, capital gain distributions, return of capital distributions. Average cost is only available for regulated investment companies.

### 1.4 Options (Equity and Index)
Equity options (on individual stocks/ETFs): standard capital gain treatment. Exercise, assignment, expiration, and close events. Premium adjustments to underlying cost basis on exercise/assignment.

Broad-based index options (SPX, NDX, RUT, VIX, DJX): **Section 1256 contracts** with 60/40 treatment and year-end mark-to-market. Must auto-identify qualifying index options by symbol.

Section 1092 straddle rules apply when offsetting positions exist. See Section 5.

### 1.5 Futures (Regulated Futures Contracts)
**Section 1256 contracts.** 60/40 treatment (60% long-term, 40% short-term regardless of holding period). Year-end mark-to-market: all open positions deemed closed at FMV on December 31. Reported on **Form 6781**. No wash sale rules apply to Section 1256 contracts.

Includes: CME/CBOT/NYMEX/COMEX futures, E-mini S&P, Micro E-mini, Treasury futures, commodity futures, currency futures.

### 1.6 Forex (Foreign Currency)
**Section 988** treatment by default: all gains and losses are **ordinary income/loss**, not capital. Reported on Schedule 1 (Line 8z) or Schedule C for traders.

Taxpayers can elect OUT of Section 988 into Section 1256 treatment for qualifying forward contracts, but this election must be made prospectively and internally documented. Our system flags this as a user setting per tax year.

Includes: spot forex, forward contracts, currency futures (which are Section 1256 by default regardless of Section 988 election).

### 1.7 Bonds and Fixed Income
Basic buy/sell lot tracking with capital gain/loss on disposal. For v1, we handle bonds as standard securities with the following limitations noted in "What's Not Covered": OID accrual, market discount, premium amortization, and accrued interest at purchase are deferred. Treasury/municipal bond interest income classification (taxable vs. tax-exempt) is user-provided via CSV flags.

### 1.8 Warrants and Rights
Treated as standard securities for lot tracking and capital gains. Exercise of warrants adjusts cost basis of acquired shares (warrant premium added to exercise price). Expiration is a capital loss.

### 1.9 Short Sales
Inverted timing: sale occurs before purchase. `SELL_SHORT` opens a position (proceeds recorded, no taxable event). `BUY_TO_COVER` closes (taxable event: gain/loss = short proceeds − cover cost − fees). Holding period rules differ: short sale gains are generally short-term unless specific conditions met. See Section 4.8.

---

## 2. CSV Import System

### 2.1 Universal Template

A standardized CSV format that accepts all asset types and transaction types.

**Core columns (required for all transactions):**

| Column | Type | Description |
|--------|------|-------------|
| `date` | Date | Trade date (not settlement date) |
| `type` | Enum | See Section 2.2 for full list |
| `symbol` | String | Ticker. Options use OCC symbology: `AAPL 250620C00200000` |
| `asset_class` | Enum | `STOCK`, `ETF`, `MUTUAL_FUND`, `OPTION`, `FUTURE`, `FOREX`, `BOND`, `WARRANT` |
| `quantity` | Decimal | Number of shares/contracts (always positive; `type` determines direction) |
| `price` | Decimal | Per-share/contract price in USD |
| `fees` | Decimal | Commissions + regulatory fees combined |
| `account` | String | Brokerage account identifier |
| `account_type` | Enum | `TAXABLE`, `IRA_TRADITIONAL`, `IRA_ROTH`, `401K`, `HSA`, `529`, `OTHER_TAX_ADVANTAGED` |

**Extended columns (required for specific transaction types):**

| Column | Type | Used For |
|--------|------|----------|
| `total_amount` | Decimal | Override for price × quantity ± fees |
| `lot_id` | String | Specific identification matching |
| `new_symbol` | String | Merger/spinoff resulting ticker |
| `ratio_from` | Decimal | Split/merger ratio — original |
| `ratio_to` | Decimal | Split/merger ratio — new |
| `allocation_pct` | Decimal | Spinoff cost basis allocation |
| `cash_in_lieu` | Decimal | Fractional share cash from splits/mergers |
| `underlying_symbol` | String | For options: the underlying stock/ETF ticker |
| `option_type` | Enum | `CALL` or `PUT` |
| `strike_price` | Decimal | Option strike price |
| `expiration_date` | Date | Option expiration date |
| `dividend_type` | Enum | `QUALIFIED`, `ORDINARY`, `RETURN_OF_CAPITAL`, `CAP_GAIN_DISTRIBUTION`, `SECTION_199A`, `TAX_EXEMPT` |
| `foreign_tax_paid` | Decimal | Withholding on foreign dividends |
| `fmv_at_vest` | Decimal | RSU/ESPP: fair market value at vest/purchase |
| `offering_date` | Date | ESPP: plan offering date |
| `shares_withheld` | Decimal | RSU: shares sold for tax withholding |
| `section_988_election` | Boolean | Forex: true if user elected OUT of Section 988 |
| `is_section_1256` | Boolean | Override: force Section 1256 treatment |
| `is_covered` | Boolean | Whether broker reports cost basis to IRS (post-2011 equities) |
| `notes` | String | Free text |

### 2.2 Transaction Types

| Type | Description | Asset Classes |
|------|-------------|---------------|
| `BUY` | Purchase | All |
| `SELL` | Disposal | All |
| `SELL_SHORT` | Open short position | Stocks, ETFs, futures, forex |
| `BUY_TO_COVER` | Close short position | Stocks, ETFs, futures, forex |
| `DIVIDEND` | Cash distribution | Stocks, ETFs, mutual funds, bonds |
| `DIVIDEND_REINVEST` | DRIP — dividend reinvested in shares | Stocks, ETFs, mutual funds |
| `INTEREST` | Bond/savings interest income | Bonds |
| `SPLIT` | Stock split (forward or reverse) | Stocks, ETFs, mutual funds |
| `MERGER` | Merger/acquisition | Stocks, ETFs |
| `SPINOFF` | Corporate spinoff | Stocks |
| `RETURN_OF_CAPITAL` | Non-dividend distribution reducing basis | Stocks, ETFs, mutual funds |
| `OPTION_EXERCISE` | Long option exercised into underlying | Options |
| `OPTION_ASSIGNMENT` | Short option assigned | Options |
| `OPTION_EXPIRATION` | Option expires worthless | Options |
| `RSU_VEST` | Restricted stock unit vesting | Stocks |
| `ESPP_PURCHASE` | Employee stock purchase plan acquisition | Stocks |
| `TRANSFER_IN` | Shares received (gift, inheritance, account transfer) | All |
| `TRANSFER_OUT` | Shares sent | All |
| `YEAR_END_FMV` | Year-end fair market value for MTM / Section 1256 | Futures, options (1256), all (if 475 MTM) |

### 2.3 Broker-Specific CSV Parsers (Phase 2)

Not in v1. Planned parsers for: Charles Schwab, Fidelity, E*Trade/Morgan Stanley, Robinhood, Interactive Brokers (Flex Query), Vanguard, TD Ameritrade (legacy), Tastytrade, Webull, Alpaca, TradeStation, Cobra Trading.

Each parser maps broker-specific column names, date formats, transaction type codes, and symbol conventions to the universal schema.

### 2.4 1099-B Import / Reconciliation (Phase 2)

Import broker-provided 1099-B data (CSV or PDF via OCR, matching TraderFyles' 1099-B Match feature). Compare broker-reported figures against our independently calculated figures. Flag discrepancies in proceeds, cost basis, and wash sale adjustments. This is a reconciliation/audit tool, not a replacement for the lot tracking engine.

### 2.5 Import Validation

| Check | Severity | Behavior |
|-------|----------|----------|
| Sell without open lots | Warning | Cost basis marked UNKNOWN; user prompted to provide or import earlier history |
| Negative lot quantity after disposal | Error | Block — missing buy or incorrect quantity |
| Split on zero-balance position | Warning | Likely stale position or missing history |
| Duplicate transactions (same date/type/symbol/qty/price) | Warning | Prompt user to confirm or deduplicate |
| Tax-advantaged account disposals | Info | "Not reported on 8949. Tracked for wash sale purposes only." |
| Future-dated transactions | Error | Block |
| Corporate action missing required fields | Error | Block — split without ratio, spinoff without allocation_pct |
| Option missing underlying/type/strike/expiration | Error | Block — required for wash sale and 1256 determination |
| Year-end FMV missing for Section 1256 contracts | Warning | Required for year-end MTM; prompt user |
| Year-end FMV missing for Section 475 MTM positions | Warning | Required for deemed sale; prompt user |
| Wash sale convergence failure (>100 passes) | Error | Flag for manual review |
| Unknown symbol | Warning | Flag; user can map or ignore |
| Total amount inconsistent with price × quantity ± fees | Warning | Use total_amount if provided; flag discrepancy |

---

## 3. Lot Tracking Engine

### 3.1 Tax Lot Data Model

Every acquisition creates a tax lot:

| Field | Description |
|-------|-------------|
| `lot_id` | Unique identifier |
| `symbol` | Ticker |
| `asset_class` | Stock, ETF, mutual fund, option, future, forex, bond, warrant |
| `quantity` | Shares remaining in lot (decremented on partial disposals) |
| `original_quantity` | Shares at creation (never changes) |
| `cost_basis_per_share` | Adjusted per-share cost |
| `total_cost_basis` | quantity × cost_basis_per_share |
| `date_acquired` | Trade date of acquisition |
| `adjusted_acquisition_date` | Modified by wash sale holding period tacking or option exercise |
| `date_sold` | Trade date of disposal (null if open) |
| `holding_period` | `SHORT_TERM` (≤ 1 year) or `LONG_TERM` (> 1 year) |
| `account` | Brokerage account |
| `account_type` | Taxable, IRA, etc. |
| `wash_sale_adjustment` | Disallowed loss added to this lot's basis |
| `wash_sale_holding_period_tack` | Days tacked from disposed lot |
| `is_covered` | Broker reports basis to IRS (post-2011 equities) |
| `source` | How created: `PURCHASE`, `DRIP`, `RSU`, `ESPP`, `OPTION_EXERCISE`, `SPLIT`, `MERGER`, `SPINOFF`, `TRANSFER`, `GIFT`, `INHERITANCE`, `MTM_DEEMED_REACQUIRE` |
| `is_section_1256` | Subject to 60/40 and year-end MTM |
| `is_segregated_investment` | For MTM traders: exempt from 475 treatment |
| `section_988` | Forex: gains/losses are ordinary |

### 3.2 Cost Basis Methods

| Method | Description | Available For |
|--------|-------------|---------------|
| **FIFO** | First In, First Out (default) | All securities |
| **LIFO** | Last In, First Out | All securities |
| **Specific Identification** | User designates lots via `lot_id` on sell transactions | All securities |
| **HIFO** | Highest In, First Out — automated specific ID selecting highest-basis lots | All securities |
| **LIFO by Date** | Alias for LIFO; consumes newest lots first | All securities |
| **Average Cost** | Weighted-average across all lots for the fund | Mutual funds only (per IRS rules) |
| **Minimum Tax** | Automated specific ID: sells long-term gain lots first, then long-term loss, then short-term gain, then short-term loss — minimizes current-year tax | All securities |

Cost basis method is set **per account** (matching broker-level conventions). Changes apply prospectively only.

When no `lot_id` is provided on a sell, the account's selected method determines lot consumption order. If `lot_id` IS provided, it overrides the method for that specific transaction (specific identification).

### 3.3 Lot Consumption on Disposal

When shares are sold, the engine:
1. Selects lots per the cost basis method.
2. Reduces lot quantity. A single sale can consume multiple lots.
3. Generates a taxable event per lot consumed, with: proceeds, cost basis, gain/loss, holding period, wash sale adjustment (if any), Form 8949 box assignment.
4. For Section 475 MTM users: classification is ordinary, not capital. Route to Form 4797.
5. For Section 1256 contracts: apply 60/40 split. Route to Form 6781.
6. For Section 988 forex: classification is ordinary. Route to Schedule 1 / Schedule C.

---

## 4. Wash Sale Engine

Applies to **Investor** and **Trader (No MTM)** status only. Fully bypassed for **Trader (MTM)** status. Does NOT apply to Section 1256 contracts.

### 4.1 Core Rule (IRC Section 1091)

If a taxpayer sells a security at a loss and acquires substantially identical securities within a 61-day window (30 days before through 30 days after the sale), the loss is disallowed. The disallowed loss is added to the cost basis of the replacement shares. The holding period of the replacement shares is adjusted to include the holding period of the disposed shares.

### 4.2 Substantially Identical Securities

| Scenario | Substantially Identical? | Handling |
|----------|------------------------|----------|
| Same ticker (AAPL sold, AAPL bought) | Yes | Automatic |
| Different share classes, same company (GOOG / GOOGL) | Yes | Maintain equivalence mapping table |
| Option on same underlying (buy AAPL call within 30 days of selling AAPL stock at a loss) | Yes (configurable) | **Method 1 (conservative):** All options on the same underlying are substantially identical to stock and to each other. **Method 2 (narrow):** Only same type, strike, and expiration. User selects method in settings. Default: Method 1 (matches TradeLog's recommended approach). |
| Mutual fund / ETF tracking same index (e.g., VOO and SPY) | No (by default) | Not automatically flagged. User can manually create equivalence groups. |
| Convertible bonds on same issuer | No (by default) | Out of scope for auto-detection |
| Preferred vs. common of same issuer | Case-by-case | Not auto-flagged; user can create equivalence groups |
| Crypto and crypto ETF (e.g., BTC and IBIT) | N/A | Out of scope — crypto is handled by a separate engine |

**User-configurable equivalence groups:** Users can define groups of symbols treated as substantially identical. This handles edge cases the auto-detection doesn't cover.

### 4.3 Cross-Account Wash Sales

IRS rules apply across ALL accounts owned by the taxpayer. The engine scans all imported accounts for matching purchases within the 61-day window:

| Replacement Account | Disallowed Loss Treatment |
|---------------------|--------------------------|
| Same taxable account | Loss deferred; added to replacement lot basis |
| Different taxable account | Loss deferred; added to replacement lot basis in that account |
| Traditional IRA | Loss **permanently disallowed** — cannot be added to IRA lot basis |
| Roth IRA | Loss **permanently disallowed** |
| 401K | Loss **permanently disallowed** |
| HSA | Loss **permanently disallowed** |

Permanently disallowed losses are flagged separately in reports. This is the worst-case scenario and must be prominently warned.

### 4.4 Partial Wash Sales

If 100 shares sold at a loss but only 60 repurchased within the window:
- 60 shares' worth of loss is disallowed (prorated: `disallowed = total_loss × (60/100)`)
- 40 shares' worth of loss is realized

### 4.5 Basis Adjustment and Holding Period Tacking

The disallowed loss is added to the replacement lot's cost basis per share. The replacement lot's holding period is adjusted to include the disposed lot's holding period (stored as `adjusted_acquisition_date`). This can convert a short-term lot into long-term.

### 4.6 Daisy-Chaining

If replacement shares are themselves sold at a loss and a new acquisition exists within that sale's 61-day window, a second wash sale occurs. The engine handles cascading wash sales across unlimited depth through iterative processing:
1. Process all disposals chronologically.
2. For each loss, scan the 61-day window for acquisitions.
3. Apply wash sale adjustments.
4. Re-process any newly created losses (from adjusted basis).
5. Repeat until no new wash sales are triggered or 100 iterations (convergence limit).

### 4.7 Cross-Year Wash Sales

Losses disallowed in December that are deferred into January of the next tax year must carry forward. The engine:
- Identifies wash sales triggered by year-end transactions where the replacement purchase is in the next year.
- Creates "W" carry-forward records that become the opening basis for next-year lots.
- Generates a **Wash Sale Carry-Forward Report** listing all deferred adjustments.

This matches TradeLog's "next year file" functionality and is critical for multi-year accuracy.

### 4.8 Short Sale Wash Sales

- Cover a short at a loss, re-short the same security within 30 days = wash sale.
- Short sale reporting date rule: gains on short sales held open over year-end use the **closing date**, not the opening date, for reporting purposes.
- Constructive sale detection (Section 1259): If a taxpayer holds appreciated long stock and opens a short position on the same security ("short against the box"), flag a potential constructive sale. Full analysis requires knowledge of entire portfolio — we flag but do not fully automate.

### 4.9 Wash Sales Involving Options

Per the configurable substantially-identical methods (Section 4.2):
- Buying an in-the-money call on AAPL within 30 days of selling AAPL stock at a loss = wash sale (Method 1).
- Writing (selling) a deep-in-the-money put = potentially substantially identical.
- Exercising an option that results in acquisition of underlying within the window of a prior loss sale = wash sale.

### 4.10 30-Day Lookback Priority

When matching a loss to potential replacement shares, the engine checks the 30 days BEFORE the sale first. If a qualifying purchase exists in the pre-sale window, it takes priority over post-sale purchases. This reduces unnecessary deferrals (the loss would have been disallowed regardless of the post-sale purchase). Matches TradeLog's approach.

### 4.11 Wash Sale Reports

| Report | Description |
|--------|-------------|
| Wash Sale Detail | Every wash sale: triggering loss sale, replacement purchase, disallowed amount, basis-adjusted lot, permanent vs. deferred |
| Potential Wash Sales | Proactive: open positions where a sale today would trigger a wash sale based on recent 30-day purchase history |
| Wash Sale Carry-Forward | Year-end: all deferred adjustments carrying into next tax year |
| Permanently Disallowed Losses | Losses lost to IRA/retirement account wash sales |

---

## 5. Section 1256 Contracts — 60/40 Treatment

### 5.1 Qualifying Contracts

Regulated futures contracts, broad-based index options (SPX, NDX, RUT, VIX, DJX, XSP), foreign currency contracts (if elected), and certain commodity options.

Maintain a **configurable qualifying symbols list** that the user can edit. Default list includes all major Section 1256-qualifying index options and futures symbols.

### 5.2 Tax Treatment

- 60% of gain/loss treated as long-term, 40% as short-term — regardless of actual holding period.
- **Year-end mark-to-market:** All open Section 1256 positions on December 31 are deemed closed at FMV. User provides FMV via `YEAR_END_FMV` transaction type.
- On January 1, positions are deemed reopened at the December 31 FMV (new cost basis).
- Wash sale rules do NOT apply.
- Reported on **Form 6781 Part I**.

### 5.3 Loss Carryback Election

Section 1256 net losses can be carried back 3 years against Section 1256 gains only. We generate the data needed for this election (prior 3 years' Section 1256 gains) but the actual carryback amendment is manual.

---

## 6. Section 1092 Straddle Rules

This is a gap in every existing product. We implement it.

### 6.1 What Triggers a Straddle

A straddle exists when a taxpayer holds offsetting positions in the same or substantially identical securities — where a decline in one position is substantially offset by a gain in the other. Common examples:
- Long stock + long put on the same stock.
- Long call + long put on the same stock (not a qualified covered call).
- Long futures + short futures on the same commodity in different months.
- Any combination of options/stock/futures creating a hedged position.

### 6.2 Tax Consequences

- **Loss deferral:** Losses on one leg of a straddle cannot be recognized to the extent of unrealized gains on the other leg(s). The deferred loss is recognized when the offsetting position is closed.
- **Holding period suspension:** The holding period of a position that is part of a straddle is suspended while the straddle exists. This can prevent long-term treatment.
- **Capitalization of carrying costs:** Interest and other carrying charges on straddle positions must be capitalized (added to basis) rather than deducted currently.

### 6.3 Identified Straddle Election

Taxpayers can make an identified straddle election, which:
- Limits the loss deferral to the amount of the straddle (not the entire loss).
- Allows the holding period to continue (not suspended).
- Requires the taxpayer to identify the straddle on their books on the day it's established.

We allow users to flag transactions as part of an identified straddle via a CSV column or post-import editing.

### 6.4 Implementation

- **Auto-detection:** Scan for offsetting positions in the same underlying held simultaneously. Flag potential straddles.
- **User confirmation:** Present flagged straddles to user for confirmation (auto-detection can false-positive on unrelated positions).
- **Loss deferral calculation:** For confirmed straddles, defer losses on closed legs to the extent of unrealized gains on open legs.
- **Holding period adjustment:** Suspend holding period for straddle positions unless identified straddle elected.
- **Reporting:** Form 6781 Part II (for straddle transactions involving Section 1256 contracts) and Form 8949 with straddle adjustment codes.

---

## 7. Section 988 — Forex Treatment

### 7.1 Default Treatment

All forex gains and losses are **ordinary income/loss** under Section 988. Not capital. Not subject to the $3,000 capital loss limitation — fully deductible against all income.

Reported on:
- **Schedule 1, Line 8z** ("Other income") for investors.
- **Schedule C** for traders.

### 7.2 Section 988 Opt-Out Election

Taxpayers can elect out of Section 988 treatment for qualifying transactions (forward contracts, futures). The election converts gains/losses to capital (and potentially Section 1256 if the contract qualifies). User sets this per tax year via the `section_988_election` flag.

### 7.3 Currency Futures

Currency futures traded on regulated exchanges (CME euro futures, yen futures, etc.) are **Section 1256 contracts by default**, regardless of Section 988. They receive 60/40 treatment automatically.

---

## 8. Corporate Actions

### 8.1 Stock Splits (Forward and Reverse)

**Forward split** (e.g., 4-for-1): Multiply lot quantities by ratio, divide per-share cost by ratio. Total basis unchanged. Holding period preserved.

**Reverse split** (e.g., 1-for-10): Divide quantities by ratio, multiply per-share cost by ratio. Cash-in-lieu for fractional shares generates a taxable disposal event.

Applied to ALL open lots for the symbol.

### 8.2 Mergers and Acquisitions

**Stock-for-stock (tax-free reorg):** Re-symbol old lots to new ticker, adjust quantities by exchange ratio. Cost basis and holding period carry over.

**Cash merger:** Treated as sell transactions at the merger price. Each lot generates gain/loss.

**Mixed consideration (cash + stock):** Cash portion ("boot") triggers gain recognition up to the boot amount. Stock portion is tax-free with basis carryover. User enters stock and cash components as separate CSV rows.

### 8.3 Spinoffs

Parent cost basis allocated between parent and spinoff by FMV ratio on distribution date. `allocation_pct` column specifies the spinoff's share. All open parent lots are split proportionally. Spinoff lots inherit original acquisition dates (holding period tacks).

### 8.4 Return of Capital

Reduces cost basis proportionally across all lots for the symbol. If cumulative RoC exceeds total basis, excess is capital gain.

### 8.5 DRIP (Dividend Reinvestment Plans)

Each reinvestment creates a new lot: acquisition date = payment date, cost basis = reinvestment price, quantity = dividend amount ÷ reinvestment price. The dividend itself is separately taxable income.

### 8.6 Ticker Changes / Symbol Updates

Simple rename across all open lots. No taxable event.

### 8.7 Warrant Exercise

Warrant premium added to exercise price = cost basis of acquired shares. Warrant lot is consumed (not a separate taxable event). Holding period starts on exercise date.

---

## 9. Options Handling

### 9.1 Long Call Exercise

Option premium added to strike price = cost basis of acquired shares. Option lot consumed. Holding period of stock starts day after exercise.

### 9.2 Short Call Assignment (Covered Call)

Shares sold at strike price. Option premium added to proceeds. Taxable disposal of underlying lots.

### 9.3 Long Put Exercise

Shares sold at strike price. Option premium reduces proceeds. Taxable disposal of underlying lots.

### 9.4 Short Put Assignment

Shares acquired at strike price. Option premium reduces cost basis of acquired shares.

### 9.5 Option Expiration

**Long option:** Premium paid is a capital loss (short-term or long-term based on holding period).
**Short option:** Premium received is a **short-term capital gain** (always short-term per IRS rules, regardless of holding period).

### 9.6 Close (Buy/Sell to Close)

Standard capital gain/loss on the option contract itself.

### 9.7 Section 1256 Index Options

Broad-based index options auto-identified by symbol. Receive 60/40 treatment and year-end MTM. Reported on Form 6781, not Form 8949.

---

## 10. Dividend and Income Classification

### 10.1 Dividend Types

| Type | Tax Treatment | 1099-DIV Box | Report |
|------|--------------|-------------|--------|
| Qualified | LTCG rates (0/15/20%) | 1b | Schedule B, Form 1040 |
| Ordinary (non-qualified) | Ordinary income rates | 1a − 1b | Schedule B |
| Return of capital | Reduces cost basis | 3 | Not current-year income |
| Capital gain distribution | LTCG | 2a | Schedule D Line 13 |
| Section 199A (REIT) | 20% QBI deduction eligible | 5 | Form 8995 |
| Tax-exempt interest | Not taxable (may affect AMT) | — | Form 1040 Line 2a |
| Foreign tax paid | Credit or deduction | 7 | Form 1116 |

We accept the qualified/ordinary classification from the user's CSV (sourced from their 1099-DIV). We do NOT re-derive qualification status.

### 10.2 Interest Income

Bond interest, savings interest, money market interest. Classified as `INTEREST` transaction type. Ordinary income. Reported on Schedule B if total interest exceeds $1,500.

### 10.3 Schedule B Threshold

If total ordinary dividends + interest > $1,500, Schedule B is required. We generate:
- Part I: Interest income by payer.
- Part II: Dividend income by payer.
- Part III: Foreign accounts question (user-provided answer).
- Summary: total qualified dividends, total capital gain distributions, total foreign tax paid.

---

## 11. Employee Equity Compensation

### 11.1 RSU (Restricted Stock Units)

On vest: cost basis = FMV at vest date. Ordinary income portion (FMV × shares vested) is W-2 income handled by employer — not our calculation. If sell-to-cover: withheld shares are an immediate zero-gain disposal. Net shares received create a lot.

CSV: `RSU_VEST` with quantity (net shares), price (FMV at vest), optionally shares_withheld.

### 11.2 ESPP (Employee Stock Purchase Plan)

Purchase price typically discounted 15% from FMV. Two components:
- **Qualifying disposition** (held >2 years from offering date AND >1 year from purchase): ordinary income = lesser of actual discount or gain on sale. Rest is LTCG.
- **Disqualifying disposition:** ordinary income = FMV at purchase minus purchase price. Remaining gain/loss is capital.

CSV: `ESPP_PURCHASE` with price (discounted purchase price), fmv_at_vest (FMV on purchase date), offering_date.

We compute correct cost basis and holding period categorization. Ordinary income portion flagged for user awareness but not reported on 8949 (it's W-2).

---

## 12. Tax-Loss Harvesting Report (Value-Add)

Real-time (or on-demand) analysis of all open positions:

| Data Point | Description |
|------------|-------------|
| Unrealized loss | Current FMV vs. cost basis for each lot |
| Wash sale risk | Whether harvesting this loss today would trigger a wash sale based on 30-day purchase history |
| Safe to harvest | No substantially identical purchase in prior 30 days; warn user not to repurchase within 30 days |
| Tax savings estimate | At user-specified marginal rate (default: 37% short-term, 20% long-term) |
| Short-term vs. long-term | Which lots are short-term losses (higher tax value) vs. long-term |

This requires current market prices. For v1: user provides current prices via CSV upload or manual entry. Phase 2: integrate market data API.

---

## 13. Report and Form Generation

### 13.1 IRS Forms (PDF, Fillable)

| Form | Used By | Description |
|------|---------|-------------|
| **Form 8949** | Investors, Trader (No MTM) | All capital gain/loss transactions from securities. Categories A–F with correct box assignment based on holding period and covered/noncovered status. Wash sale code "W" in column (f), adjustment in column (g). Securities only — crypto generates its own 8949 from the separate crypto engine. |
| **Schedule D** | Investors, Trader (No MTM) | Summary of 8949 totals. Part I (short-term), Part II (long-term). Lines 1a/8a for transactions matching broker-reported basis. |
| **Form 4797** | Trader (MTM) | Part II: ordinary gains/losses from Section 475 MTM trades. Section 481(a) adjustment for transition year. |
| **Form 6781** | All (if applicable) | Part I: Section 1256 gains/losses with 60/40 split. Part II: Straddle transactions. |
| **Schedule B** | All (if applicable) | Interest and dividend income when >$1,500 total. Payer details. |
| **Schedule C** | Traders (both MTM and No MTM) | Trading business income/loss. Net trading P&L on Line 1. Expense deductions for data feeds, software, etc. (user-entered). |
| **Schedule 1** | All (if applicable) | Line 8z for Section 988 forex ordinary income (investors). |

### 13.2 Tax Software Export CSVs

| Export | Format |
|--------|--------|
| TurboTax 1099-B CSV | Unified format covering all asset classes |
| H&R Block import CSV | Matching their import spec |
| TaxAct import CSV | Matching their import spec |
| Drake / ATX / CCH ProSystem FX | Professional tax software formats (matching TraderFyles' integrations) |
| Generic TXF | Universal tax exchange format |

### 13.3 Detail Reports (CSV / PDF)

| Report | Description |
|--------|-------------|
| Realized Gains/Losses | All closed positions. Per-lot detail: symbol, quantity, date acquired, date sold, proceeds, basis, wash sale adjustment, gain/loss, holding period, Form 8949 box. |
| Unrealized Gains/Losses | All open positions. Per-lot: symbol, quantity, date acquired, current basis, estimated FMV, unrealized gain/loss, holding period. |
| Wash Sale Detail | Every wash sale event. Triggering sale, replacement purchase, disallowed amount, permanently vs. temporarily disallowed, basis-adjusted lot. |
| Wash Sale Carry-Forward | Deferred wash sales crossing into next tax year. |
| Permanently Disallowed Losses | IRA/retirement wash sale losses that can never be recovered. |
| Potential Wash Sales | Proactive: positions at risk of wash sale if sold today. |
| Dividend & Income Summary | All dividends by type, payer, amount. Total qualified, ordinary, RoC, cap gain distributions, foreign tax paid. |
| Section 1256 Summary | All 1256 contract gains/losses with 60/40 breakdown. Year-end MTM events. |
| Section 475 MTM Summary | All deemed sale/repurchase events. Year-end positions and valuations. |
| Section 481(a) Adjustment | Transition year only: every position's deemed sale gain/loss. |
| Straddle Positions | Identified straddles, deferred losses, holding period suspensions. |
| Tax-Loss Harvesting | Harvestable losses, wash sale risk flags, estimated tax savings. |
| Capital Gains by Asset Class | Summary totals broken out by stocks, options, futures, forex, bonds. |
| Broker Audit / Reconciliation | Our calculations vs. 1099-B reported figures. Discrepancies flagged. (Phase 2, after 1099-B import.) |
| Transaction History | Complete chronological transaction log across all accounts. |

---

## 14. Account Type Awareness

| Account Type | Taxable Events? | Wash Sale Trigger? | Reported on 8949? | Form 4797? |
|--------------|-----------------|--------------------|--------------------|------------|
| Taxable | Yes | Yes (both directions) | Yes | Yes (if MTM) |
| Traditional IRA | No | Can trigger on taxable losses (replacement side). Loss permanently disallowed. | No | No |
| Roth IRA | No | Same as Traditional IRA | No | No |
| 401K | No | Same as Traditional IRA | No | No |
| HSA | No | Same as Traditional IRA | No | No |
| 529 | No | Same as Traditional IRA | No | No |

Tax-advantaged transactions are ingested solely for wash sale cross-account detection. No tax reports generated for these accounts.

---

## 15. Data Validation and Error Handling

### 16.1 Missing Cost Basis

When partial history imported and sells reference unknown lots:
- Lot created with `cost_basis = UNKNOWN`, `is_covered = false`.
- Form 8949 Box B (short-term) or E (long-term).
- Prominent warning: "X transactions have unknown cost basis."
- User can manually enter basis via edit flow.

### 16.2 Missing Year-End FMV

Required for Section 1256 MTM and Section 475 MTM:
- If `YEAR_END_FMV` transactions not provided for open 1256 or 475 positions, warn user.
- Cannot generate accurate Form 6781 or Form 4797 without year-end prices.
- For v1: user provides. Phase 2: auto-fetch from market data API.

### 16.3 Wash Sale Convergence

Iterative engine caps at 100 passes. In practice converges in 2-3. If failure: flag transactions involved and route to manual review.

---

## 16. What's Not Covered (v1) and Why

**Bond-specific calculations:** OID accrual, market discount, premium amortization, accrued interest at purchase. These require specialized engines and issue-level data (CUSIP, maturity, coupon). Deferred to v2.

**Real-time market data integration:** Tax-loss harvesting and unrealized positions require current prices. v1 uses user-provided FMV. v2 integrates market data APIs.

**Broker API integrations:** v1 is CSV-only. v2 adds direct broker connections.

**Electronic filing:** No direct e-file to IRS. All exports are for import into tax preparation software.

**Partnership K-1 passthrough:** Investments in partnerships, hedge funds, PE funds report on K-1. Entirely separate product category.

**AMT (Alternative Minimum Tax) adjustments:** ISO (incentive stock option) exercise creates AMT preference items. Requires Form 6251 and full AMT calculation with data we don't have.

**State-specific tax calculations:** State capital gains rates, state-level exemptions, state wash sale rules (some states don't follow federal). We report federal taxable amounts only.

**Germany: commercial trading reclassification:** N/A — this is US-only. (Documented in UK/DE writeup.)

**Full constructive sale analysis (Section 1259):** Flagged but not fully automated. Would require real-time portfolio analysis of all long and short positions.

---

## 17. Implementation Priority

### Phase 1 — Core Engine (Ship First)
1. User setting: Investor / Trader (No MTM) / Trader (MTM) per tax year
2. CSV import with universal template — all asset classes
3. Lot tracking engine with full data model
4. Cost basis methods: FIFO, LIFO, Specific ID, HIFO, Average Cost (mutual funds)
5. Wash sale engine: same-account, cross-account, partial, daisy-chain, cross-year carry-forward, holding period tacking, 30-day lookback priority
6. Options-to-stock substantially identical detection (configurable Method 1/2)
7. IRA permanently disallowed loss tracking
8. Stock splits (forward/reverse)
9. Dividend classification (qualified/ordinary/RoC/cap gain distributions)
10. Section 475 MTM: year-end deemed sales, Section 481(a) transition report, Form 4797
11. Section 1256: 60/40 split, year-end MTM, qualifying symbol list, Form 6781
12. Section 988 forex: ordinary income/loss, opt-out election
13. Form 8949 (securities only, all boxes A-F)
14. Schedule D (combined)
15. Schedule B (dividends + interest)
16. Schedule C (trader business expenses)
17. All detail reports: realized, unrealized, wash sale detail, carry-forward, permanently disallowed
18. TurboTax CSV export

### Phase 2 — Corporate Actions, Options, Employee Equity
1. Mergers, spinoffs, return of capital, ticker changes
2. Option exercise/assignment/expiration/close with basis adjustments
3. Short sale handling with reporting date rules
4. RSU and ESPP support
5. DRIP lot generation
6. Warrant exercise
7. Section 1092 straddle detection and loss deferral
8. Constructive sale flagging (Section 1259)
9. Broker-specific CSV parsers (Schwab, Fidelity, E*Trade, IBKR, Robinhood, etc.)
10. 1099-B import and reconciliation
11. H&R Block, TaxAct, Drake, ATX, CCH export formats

### Phase 3 — Differentiation
1. Tax-loss harvesting report with wash sale risk flags
2. Market data API integration for real-time FMV
3. Broker audit tool (our calculations vs. 1099-B)
4. Minimum Tax cost basis method
5. Multi-year historical data reconstruction
6. Trading journal with P&L analytics
7. Straddle identified election workflow
8. Section 1256 loss carryback data generation

---

## 18. Competitive Parity Checklist

### vs. TradeLog

| TradeLog Feature | Our Status | Notes |
|------------------|------------|-------|
| Wash sales: cross-account | Phase 1 | ✅ |
| Wash sales: daisy-chaining | Phase 1 | ✅ |
| Wash sales: options-to-stock (Method 1/2) | Phase 1 | ✅ |
| Wash sales: IRA permanently disallowed | Phase 1 | ✅ |
| Wash sales: short sale | Phase 2 | |
| Wash sales: 30-day lookback priority | Phase 1 | ✅ |
| Wash sales: cross-year carry-forward | Phase 1 | ✅ |
| Wash sales: potential wash sale report | Phase 1 | ✅ |
| Section 475 MTM + Form 4797 | Phase 1 | ✅ |
| Section 481(a) transition report | Phase 1 | ✅ |
| Section 1256 + Form 6781 | Phase 1 | ✅ |
| Section 1092 straddles | Phase 2 | TradeLog doesn't have this either |
| Section 988 forex | Phase 1 | ✅ |
| Corporate actions (splits/mergers/spinoffs) | Phase 2 | TradeLog has this in all tiers |
| FIFO + Specific ID | Phase 1 | ✅ |
| Average cost (mutual funds) | Phase 1 | ✅ |
| LIFO, HIFO, Minimum Tax | Phase 1 (LIFO/HIFO), Phase 3 (MinTax) | TradeLog is FIFO + manual specific ID only — we exceed |
| Form 8949 (all boxes) | Phase 1 | ✅ |
| Schedule D | Phase 1 | ✅ |
| Schedule B | Phase 1 | TradeLog doesn't generate this — we exceed |
| Schedule C | Phase 1 | ✅ |
| 1099-B reconciliation | Phase 2 | ✅ |
| 30+ broker imports | Phase 2 | TradeLog has this in v1; we start CSV-only |
| Windows desktop | N/A | We are cloud-native — we exceed |
| Phone support | N/A | Not a software feature |

### vs. TraderFyles

| TraderFyles Feature | Our Status | Notes |
|---------------------|------------|-------|
| Cloud-based access | Phase 1 | ✅ |
| Section 475 MTM + Form 4797 | Phase 1 | ✅ |
| 1099-B Match (PDF OCR import) | Phase 2 | |
| Audit My Broker | Phase 2 | Equivalent to our reconciliation |
| Drake/ATX/CCH export | Phase 2 | |
| Credit-based pricing | N/A | Business model decision |
| Form 8949 | Phase 1 | ✅ |
| Schedule D | Phase 1 | ✅ |
| Form 6781 | Phase 1 | TraderFyles doesn't have this — we exceed |
| Section 1256 support | Phase 1 | TraderFyles doesn't have this — we exceed |
| Section 1092 straddles | Phase 2 | TraderFyles doesn't have this — we exceed |
| Section 988 forex | Phase 1 | TraderFyles doesn't have this — we exceed |
| Schedule B | Phase 1 | TraderFyles doesn't have this — we exceed |
| Advanced wash sale engine | Phase 1 | TraderFyles doesn't document depth — we exceed |
| Corporate actions | Phase 2 | TraderFyles only in Enterprise — we exceed |
| Futures support | Phase 1 | TraderFyles doesn't have this — we exceed |
| Bonds support | Phase 1 | TraderFyles doesn't have this — we exceed |
