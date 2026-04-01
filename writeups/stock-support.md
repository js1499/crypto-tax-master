# Stock & Securities Support — Updated Implementation Plan

## Architecture

### Dual-Engine, Unified Accounts

The crypto and securities tax engines are independent calculation systems — separate lot tracking, separate wash sale detection, separate taxable events. They never share cost basis data. However, they share the same account infrastructure and unified brokerage connections.

When a user connects a brokerage that supports both crypto and stocks (Coinbase, Robinhood), the account appears on both the Crypto Accounts page and Securities Accounts page. On sync, each transaction is classified by asset type and routed to the correct engine:

- Blockchain tokens, DeFi activity, on-chain transactions → crypto engine
- Equities, options, futures, forex, ETFs, mutual funds, bonds → securities engine

Classification is determined by the brokerage API response metadata (Coinbase, Robinhood, and all major platforms distinguish between crypto and equity trades in their API payloads). For CSV imports, the `asset_class` column explicitly declares the type.

### UI Structure

```
Sidebar:
  Crypto (collapsible)
    ├ Accounts
    └ Transactions
  Securities (collapsible)
    ├ Accounts
    └ Transactions
  Tax Reports (combined, with filter tabs)
  Tax AI
  Settings
```

**Tax Reports page** has three filter tabs:
- **All** — every form, combined and engine-specific
- **Crypto** — crypto-only forms (crypto Form 8949, crypto CSVs)
- **Securities** — securities-only forms (securities Form 8949, Form 4797, Form 6781, Schedule B, securities CSVs)
- **Combined** — forms that merge both engines (Schedule D, Schedule C, Schedule 1)

Combined forms show a note: "Includes both crypto and securities data."

### Shared vs Separate

| Component | Shared or Separate | Why |
|-----------|-------------------|-----|
| User accounts, auth, sessions | Shared | Same user, same login |
| Brokerage connections | Shared | One Coinbase connection serves both engines |
| Transaction storage | Separate | `transactions` (crypto) and `securities_transactions` (securities) |
| Cost basis lots | Separate | Different rules, different methods |
| Wash sale detection | Separate | IRS wash sale for securities ≠ crypto wash sale (currently) |
| Tax report generation | Merged at form level | Schedule D combines both; Form 8949 stays separate |
| Settings (country, timezone) | Shared | User-level preferences |
| Settings (tax status, cost basis method) | Separate per engine | Securities has Investor/Trader/MTM; crypto has FIFO/per-wallet |
| Tax AI | Shared | Can query both engines |

---

## Brokerage Account Integration

### Shared Account Model

**Table: `brokerages`**
A brokerage connection that can serve both engines.

| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| userId | TEXT FK → User | |
| name | TEXT | "Coinbase", "Robinhood", "Schwab" |
| provider | TEXT | coinbase, robinhood, schwab, fidelity, ibkr, etc. |
| account_number | TEXT | User-provided reference |
| account_type | TEXT | TAXABLE, IRA_TRADITIONAL, IRA_ROTH, 401K, HSA, 529 |
| supports_crypto | BOOLEAN | true for Coinbase, Robinhood; false for Schwab |
| supports_securities | BOOLEAN | true for Robinhood, Schwab; false for on-chain wallets |
| api_key_encrypted | TEXT | Encrypted credentials |
| api_secret_encrypted | TEXT | |
| is_connected | BOOLEAN | |
| last_sync_at | TIMESTAMPTZ | |
| created_at | TIMESTAMPTZ | |

On-chain wallets (Solana, Ethereum, Bitcoin) only support crypto. Traditional brokerages (Schwab, Fidelity, Vanguard) only support securities. Dual-asset platforms (Coinbase, Robinhood) support both.

### Sync Flow for Dual-Asset Brokerages

```
User clicks "Sync" on Coinbase account
  → API fetches all transactions from Coinbase
  → For each transaction:
      If asset is crypto (BTC, ETH, SOL, etc.):
        → Insert into crypto `transactions` table
        → Show on Crypto Transactions page
      If asset is equity/option/ETF:
        → Insert into `securities_transactions` table
        → Show on Securities Transactions page
  → Account appears on both Accounts pages
  → Each engine processes its own data independently
```

### Brokerage API Integrations

**Phase 1 — CSV + existing crypto APIs:**
- Crypto: Helius (Solana), Moralis (EVM), Coinbase API, exchange APIs (existing)
- Securities: CSV import only (universal template)

**Phase 2 — Brokerage APIs for securities:**

| Broker | API | Notes |
|--------|-----|-------|
| Robinhood | Unofficial API / CSV export | No official API; use transaction export |
| Charles Schwab | Schwab API (successor to TD Ameritrade API) | Official, requires developer registration |
| Fidelity | No public API; CSV export | Fidelity doesn't offer a transaction API |
| E*Trade / Morgan Stanley | E*Trade API | Official REST API |
| Interactive Brokers | Client Portal API / Flex Query | Most comprehensive API in the industry |
| Vanguard | No public API; CSV export | |
| Tastytrade | Open API | Official, well-documented |
| Webull | Unofficial API / CSV export | |
| Alpaca | Official API | Designed for algo trading, excellent API |

Reality: most traditional brokerages don't have public transaction APIs the way crypto exchanges do. For Phase 1, CSV import covers all brokerages. Phase 2 adds direct integrations where APIs exist (Schwab, E*Trade, IBKR, Tastytrade, Alpaca) and polished CSV parsers for the rest.

For dual-asset platforms that we already connect to (Coinbase), the existing API connection is extended to also pull equity trades and route them to the securities engine.

---

## Securities Tax Engine

### Investor vs Trader Tax Status

Per-user, per-year setting stored in `securities_tax_settings`:

| Status | Capital/Ordinary | Wash Sales | Forms | Loss Cap | Expenses |
|--------|-----------------|------------|-------|----------|----------|
| **Investor** (default) | Capital (ST/LT) | Full wash sale rules | 8949 + Schedule D | $3,000/year | Not deductible |
| **Trader (No MTM)** | Capital (ST/LT) | Full wash sale rules | 8949 + Schedule D + Schedule C | $3,000/year | Deductible on Schedule C |
| **Trader (MTM)** | Ordinary | No wash sales | Form 4797 + Schedule C | Unlimited | Deductible on Schedule C |

### Supported Asset Classes

| Asset Class | Lot Tracking | Wash Sales | Special Rules |
|-------------|-------------|------------|---------------|
| Stocks (common/preferred) | Full | Yes | Corporate actions |
| ETFs | Full | Yes | Same as stocks |
| Mutual Funds | Full + Average Cost | Yes | DRIP, cap gain distributions |
| Options (equity) | Full | Yes (configurable substantially identical) | Exercise/assignment/expiration |
| Options (index — SPX, NDX, etc.) | Section 1256 | No | 60/40, year-end MTM, Form 6781 |
| Futures | Section 1256 | No | 60/40, year-end MTM, Form 6781 |
| Forex | Section 988 | N/A | Ordinary income, opt-out election |
| Bonds | Basic | Yes | OID/premium deferred to v2 |
| Warrants | Full | Yes | Exercise adjusts stock basis |
| Short Sales | Inverted | Yes | Cover-at-loss wash sales |

### Cost Basis Methods (per account)

| Method | Available For | Description |
|--------|--------------|-------------|
| FIFO | All | First In, First Out (default) |
| LIFO | All | Last In, First Out |
| HIFO | All | Highest cost first (minimize current gain) |
| Specific ID | All | User designates lots via lot_id on sell |
| Average Cost | Mutual funds only | Weighted average across all lots |
| Minimum Tax | All (Phase 3) | Automated lot selection minimizing tax |

### Wash Sale Engine

The most complex component. Handles all IRS Section 1091 requirements:

- **Same-account:** Basic 61-day window matching
- **Cross-account:** Scans all accounts (taxable + retirement)
- **IRA permanent disallowance:** Replacement in retirement account = loss permanently gone
- **Partial:** Prorated when fewer shares repurchased than sold
- **Daisy-chaining:** Cascading wash sales, iterative up to 100 passes
- **Cross-year carry-forward:** December losses deferred into January
- **Options-to-stock:** Configurable (Method 1: all options on same underlying, Method 2: same strike/type/exp)
- **Short sales:** Cover at loss + re-short within 30 days
- **30-day lookback priority:** Pre-sale purchases matched first
- **User equivalence groups:** Custom substantially identical groupings
- **Holding period tacking:** Replacement lot inherits disposed lot's holding period

Bypassed entirely for Trader MTM users and Section 1256 contracts.

### Section 1256 Contracts (60/40)

Qualifying: regulated futures, broad-based index options (SPX, NDX, RUT, VIX, DJX, XSP). Configurable symbol list.

- 60% long-term / 40% short-term regardless of holding period
- Year-end mark-to-market: open positions deemed sold at FMV on Dec 31
- Jan 1 deemed reacquisition at FMV
- No wash sales
- Reported on Form 6781 Part I
- Loss carryback data (3 years) generated for user's election

### Section 475(f) Mark-to-Market

For Trader MTM users:

- All positions deemed sold at FMV on Dec 31 each year
- All gains/losses are ordinary (not capital)
- No $3,000 loss cap — fully deductible
- No wash sales
- Reported on Form 4797 Part II
- Section 481(a) adjustment report for transition year (first year of election)
- Segregated investment positions retain capital treatment if identified before year start

### Section 988 — Forex

- Default: ordinary income/loss (not capital)
- Opt-out election: converts to capital (and Section 1256 if qualifying)
- Currency futures on regulated exchanges: always Section 1256 regardless
- Reported on Schedule 1 Line 8z (investors) or Schedule C (traders)

### Corporate Actions (Phase 2)

| Action | Tax Treatment |
|--------|--------------|
| Forward split | Adjust lot quantity × ratio, cost ÷ ratio, no taxable event |
| Reverse split | Adjust lots, cash-in-lieu for fractional shares is taxable |
| Stock-for-stock merger | Re-symbol lots, adjust quantity, basis/dates carry over |
| Cash merger | Treated as sell at merger price |
| Mixed merger | Cash portion triggers gain, stock portion carries over |
| Spinoff | Allocate parent basis by FMV ratio, new lots inherit dates |
| Return of capital | Reduce basis; excess becomes capital gain |
| DRIP | New lot per reinvestment, dividend separately taxable |
| Ticker change | Rename across lots, no taxable event |

### Employee Equity (Phase 2)

| Type | Treatment |
|------|-----------|
| RSU vest | Lot at FMV, sell-to-cover = immediate zero-gain disposal |
| ESPP purchase | Lot at discounted price, qualifying vs disqualifying disposition rules |

### Options (Phase 2)

| Event | Treatment |
|-------|-----------|
| Long call exercise | Premium + strike = stock cost basis |
| Short call assignment | Shares sold at strike + premium |
| Long put exercise | Shares sold at strike - premium |
| Short put assignment | Shares acquired at strike - premium |
| Expiration (long) | Capital loss |
| Expiration (short) | Short-term gain (always) |
| Close | Standard capital gain/loss on contract |

---

## Tax Report Unification

### Forms That Combine Both Engines

| Form | How Combined |
|------|-------------|
| **Schedule D** | Part I (short-term): sum crypto 8949 totals + securities 8949 totals + Section 1256 40% portion. Part II (long-term): same + Section 1256 60% portion. One form, one set of numbers. |
| **Schedule 1** | Line 8z: crypto staking income + forex Section 988 income. Single total. |
| **Schedule B** | Part I: bond interest + any crypto lending interest. Part II: stock dividends. Combined if either exceeds $1,500. |
| **Schedule C** | For traders: net trading P&L from securities + crypto (if both are trading activities). Business expenses. One Schedule C. |

### Forms That Stay Engine-Specific

| Form | Engine | Why |
|------|--------|-----|
| Form 8949 (crypto) | Crypto | Boxes H/I/K/L (no 1099-B, DeFi/exchange distinction) |
| Form 8949 (securities) | Securities | Boxes A-F (covered/noncovered/no 1099-B) |
| Form 4797 | Securities | Section 475 MTM (crypto doesn't use this) |
| Form 6781 | Securities | Section 1256 (crypto doesn't use this) |
| SA108 Summary | Crypto (UK) | UK crypto-specific |
| Anlage SO | Crypto (DE) | Germany crypto-specific |

### Tax Reports Page UI

Three filter tabs at top:

**All** — everything:
- Combined Schedule D
- Crypto Form 8949
- Securities Form 8949
- Form 4797 (if MTM)
- Form 6781 (if 1256 activity)
- Schedule B (if dividends/interest)
- Schedule C (if trader)
- Schedule 1
- All CSV exports from both engines

**Crypto** — crypto-only:
- Crypto Form 8949
- Crypto Capital Gains CSV
- Crypto Income Report
- Crypto Transaction History
- UK/DE specific reports (if applicable)

**Securities** — securities-only:
- Securities Form 8949
- Form 4797
- Form 6781
- Schedule B
- Realized Gains/Losses
- Wash Sale Detail
- Wash Sale Carry-Forward
- Permanently Disallowed Losses
- Dividend & Income Summary
- Section 1256 Summary
- Section 475 MTM Summary

**Combined** — forms merging both:
- Schedule D (always combined)
- Schedule C (if trader)
- Schedule 1 (if income from both)
- Summary Report (unified P&L across both engines)

Each combined form shows a badge: "Crypto + Securities"

---

## Database Schema

### New Tables

```
brokerages                    — Unified account connections (serves both engines)
securities_tax_settings       — Per-user, per-year tax status
securities_transactions       — Raw imported/synced transactions
securities_lots               — Tax lots (open and closed)
securities_taxable_events     — Generated gain/loss events per lot disposal
securities_wash_sales         — Every wash sale with full detail
securities_dividends          — Dividend/income tracking for Schedule B
securities_equivalence_groups — User-defined substantially identical groups
securities_section_1256_symbols — Configurable qualifying symbol list
```

### Modified Tables

```
User                          — Add securities-specific settings if needed
```

### Existing Crypto Tables (Unchanged)

```
transactions                  — Crypto transactions (no changes)
tax_report_cache              — May need to include securities data in cached reports
```

---

## File Structure

### Phase 1 — Core

```
src/
├── lib/
│   ├── securities-csv-parser.ts          — Universal CSV parser + validation
│   ├── securities-lot-engine.ts          — Core lot tracking and consumption
│   ├── securities-wash-sale-engine.ts    — Full wash sale detection
│   ├── securities-section-1256.ts        — 60/40 treatment + year-end MTM
│   ├── securities-section-475.ts         — Mark-to-market + Form 4797
│   ├── securities-section-988.ts         — Forex ordinary income/loss
│   ├── securities-dividends.ts           — Dividend classification + Schedule B
│   └── securities-report-generator.ts    — All report/form generation
├── app/
│   ├── api/
│   │   └── securities/
│   │       ├── import/route.ts           — CSV import endpoint
│   │       ├── compute/route.ts          — Run lot + wash sale engine
│   │       ├── reports/route.ts          — Report generation
│   │       ├── settings/route.ts         — Tax status + method settings
│   │       ├── lots/route.ts             — Lot viewer
│   │       └── wash-sales/route.ts       — Wash sale detail
│   └── securities/
│       ├── page.tsx                      — Main securities transactions page
│       ├── accounts/page.tsx             — Securities accounts (shows brokerage connections)
│       ├── lots/page.tsx                 — Open/closed lot viewer
│       ├── wash-sales/page.tsx           — Wash sale reports
│       └── settings/page.tsx             — Per-year tax status, cost basis, equivalence groups
└── components/
    └── sidebar.tsx                       — Updated with collapsible Crypto/Securities sections
```

### Phase 2 — Additions

```
src/lib/
├── securities-corporate-actions.ts       — Splits, mergers, spinoffs, RoC
├── securities-options.ts                 — Exercise, assignment, expiration
├── securities-short-sales.ts             — Short sale handling
├── securities-employee-equity.ts         — RSU, ESPP
└── securities-broker-parsers/
    ├── schwab.ts
    ├── fidelity.ts
    ├── etrade.ts
    ├── robinhood.ts
    ├── ibkr.ts
    ├── vanguard.ts
    ├── tastytrade.ts
    └── webull.ts
```

---

## Implementation Order

### Phase 1 — Core Engine (ship first)

| Step | Component | Depends On |
|------|-----------|------------|
| 1 | Database schema (all tables) | Nothing |
| 2 | Sidebar restructure (Crypto/Securities dropdowns) | Nothing |
| 3 | Securities Accounts page (connects to brokerages table) | Step 1 |
| 4 | CSV import parser + validation + import endpoint | Step 1 |
| 5 | Securities Transactions page (display imported data) | Step 4 |
| 6 | Lot tracking engine (all cost basis methods) | Step 1 |
| 7 | Wash sale engine (full spec) | Step 6 |
| 8 | Section 1256 engine | Step 6 |
| 9 | Section 475 MTM engine | Step 6 |
| 10 | Section 988 forex engine | Step 6 |
| 11 | Dividend/income engine + Schedule B | Step 4 |
| 12 | Securities tax settings page (per-year status, methods) | Step 1 |
| 13 | Report generation: Form 8949 (securities, boxes A-F) | Step 7 |
| 14 | Report generation: Schedule D (combined crypto + securities) | Step 13 |
| 15 | Report generation: Form 4797 | Step 9 |
| 16 | Report generation: Form 6781 | Step 8 |
| 17 | Report generation: Schedule B | Step 11 |
| 18 | Report generation: Schedule C | Step 9 |
| 19 | Report generation: all CSV exports (realized, wash sale, carry-forward, etc.) | Steps 7-11 |
| 20 | Tax Reports page update (filter tabs, combined forms) | Steps 13-19 |
| 21 | TurboTax CSV export (securities) | Step 7 |

### Phase 2 — Corporate Actions, Options, Broker APIs

| Step | Component |
|------|-----------|
| 22 | Corporate actions engine (splits, mergers, spinoffs, RoC, DRIP) |
| 23 | Options engine (exercise, assignment, expiration, close) |
| 24 | Short sale engine |
| 25 | Employee equity (RSU, ESPP) |
| 26 | Broker-specific CSV parsers (Schwab, Fidelity, E*Trade, IBKR, etc.) |
| 27 | Brokerage API integrations (where available) |
| 28 | Dual-asset sync routing (Coinbase/Robinhood crypto + securities split) |
| 29 | 1099-B import and reconciliation |
| 30 | H&R Block, TaxAct, Drake, ATX, CCH export formats |
| 31 | Lot viewer page (open/closed, filters, search) |
| 32 | Wash sale reports page (detail, carry-forward, permanently disallowed) |

### Phase 3 — Differentiation

| Step | Component |
|------|-----------|
| 33 | Tax-loss harvesting report with wash sale risk flags |
| 34 | Market data API integration for real-time FMV |
| 35 | Section 1092 straddle detection and loss deferral |
| 36 | Minimum Tax cost basis method |
| 37 | Worthless securities deduction (Section 165) |
| 38 | Section 1256 loss carryback data |
| 39 | Multi-year data reconstruction |
| 40 | Trading journal with P&L analytics |

---

## Fillable PDFs Needed

Already have:
- Form 8949
- Schedule D
- Schedule 1

Need from IRS:
- Form 4797 (Sales of Business Property)
- Form 6781 (Gains and Losses From Section 1256 Contracts and Straddles)
- Schedule B (Interest and Ordinary Dividends)
- Schedule C (Profit or Loss From Business)

---

## Performance Considerations

**Wash sale engine:** For active traders with 50K+ transactions, use indexed approach — sort by date + symbol, build symbol → sorted transaction map, binary search 61-day windows. O(N log N) instead of O(N²).

**Lot consumption:** In-memory sorted lot queue per symbol per account. O(1) for FIFO/LIFO, O(N) for HIFO/MinTax.

**Cross-account scanning:** Pre-build unified symbol → transactions index across all accounts, partition by account for basis adjustment routing.

**Report generation:** Combined Schedule D queries both crypto and securities engines. Cache results in `tax_report_cache` with a flag distinguishing crypto-only vs securities-only vs combined.

**Dual-asset sync:** Classify transactions as they arrive (stream processing), not as a batch after sync. This prevents the user from waiting for classification after a potentially long sync.
