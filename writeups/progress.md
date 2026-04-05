# Crypto Tax Calculator — Comprehensive Progress Document

*Last updated: April 2026*

---

## 1. What This Software Does

A web-based tax calculator for cryptocurrency and traditional securities. Users connect their wallets and exchange accounts, the system pulls their full transaction history, enriches it with historical market prices, computes cost basis and capital gains/losses using jurisdiction-specific rules (US, UK, Germany), and generates IRS-compliant tax forms (Form 8949, Schedule D, Schedule 1) as fillable PDFs and CSV exports.

The platform has two tax engines running in parallel:
- **Crypto engine** — handles on-chain transactions from Solana (Helius API), 12 EVM chains (Moralis API), and centralized exchanges (Coinbase, Binance, Kraken, KuCoin, Gemini)
- **Securities engine** — handles traditional brokerage transactions (stocks, ETFs, options, futures, forex) imported via CSV, with lot tracking, wash sale detection, and special IRS sections (1256, 475, 988)

Both engines feed into a unified Tax Reports page that generates combined forms.

---

## 2. Technology Stack

### Core Framework
| Technology | Version | Purpose |
|---|---|---|
| Next.js | 15.5.9 | Full-stack React framework (App Router) |
| React | 18.3.1 | UI component library |
| TypeScript | 5.8.3 | Type-safe development |
| Tailwind CSS | 3.4.1 | Utility-first styling (Horizon Design System) |

### Database & ORM
| Technology | Purpose |
|---|---|
| PostgreSQL | Primary database (hosted on Supabase) |
| Prisma 6.6.0 | ORM with type-safe queries, schema migrations |
| Supabase | Managed PostgreSQL with Row Level Security, backups, dashboard |

### Authentication
| Technology | Purpose |
|---|---|
| NextAuth.js 4.24.11 | Session management, credential + OAuth providers |
| bcryptjs | Password hashing (10 rounds) |
| jsonwebtoken | JWT generation for Coinbase CDP API |
| Server-side middleware | Auth checks on all protected routes via `src/middleware.ts` |

### External APIs
| Service | Purpose |
|---|---|
| Helius | Solana transaction parsing — swaps, NFTs, staking, transfers |
| Moralis | EVM transaction history across 12 chains |
| CoinGecko | Historical + current token prices, symbol resolution |
| Frankfurter (ECB) | Daily FX rates for USD to GBP/EUR |
| Binance | Minute-level OHLCV for price enrichment fallback |
| Anthropic Claude | Tax AI assistant (Opus model, streaming SSE) |

### Exchange Integrations
| Exchange | Connection Method |
|---|---|
| Coinbase | CDP API with ES256 JWT + OAuth refresh tokens |
| Binance | HMAC-SHA256 signed API (spot trades + deposits/withdrawals) |
| Kraken | HMAC-SHA512 signed API (trades + ledger entries) |
| KuCoin | HMAC-SHA256 with signed passphrase (V2 API) |
| Gemini | HMAC-SHA384 with BASE64 payload |

All exchange API credentials are encrypted at rest using AES-256-GCM with PBKDF2 key derivation (100,000 iterations). Format: `salt:iv:tag:encrypted_hex`.

### UI Components
| Library | Purpose |
|---|---|
| Radix UI | Headless accessible components (Dialog, Select, Tabs, etc.) |
| Lucide React | Icon library |
| D3.js | Custom SVG visualizations (P&L breakdown, activity heatmap) |
| Chart.js + Recharts | Data visualization |
| Sonner | Toast notifications |
| pdf-lib | Fill IRS PDF forms programmatically |

### Monitoring & Infrastructure
| Service | Purpose |
|---|---|
| Sentry | Production error tracking and alerting |
| Vercel | Hosting, deployment, edge functions (13-min max duration) |
| GitHub | Version control, CI/CD trigger |

### Not Yet Integrated
| Service | Would Enable |
|---|---|
| Stripe | Paid plans, subscription management, billing portal |
| Cloudflare | DDoS protection, WAF, edge caching |
| Resend | Transactional emails (verification, alerts, reminders) |
| Upstash Redis | Shared rate limiting across serverless instances, faster caching |

---

## 3. Database Schema

**25 tables** across 5 domains:

### Authentication (4 tables)
- `User` — id, email, password, name, country, timezone, costBasisMethod
- `Account` — OAuth provider linkage (Google, Coinbase)
- `Session` — NextAuth session tokens (7-day expiry)
- `VerificationToken` — Email verification

### Crypto (4 tables)
- `Wallet` — address, provider, chains, lastSyncAt. Unique on (address, provider, userId) — multiple users can connect the same wallet
- `Exchange` — name, encrypted API credentials, isConnected, lastSyncAt
- `Transaction` — 27 columns: type, asset, amounts (Decimal 30,15), pricing, fees, cost_basis_usd, gain_loss_usd, holding_period, date_acquired, is_income, edit_version. Indexed on wallet_address, timestamp, type, chain, source_type
- `HeliusRawTransaction` — raw Helius API JSON for audit trail

### Securities (9 tables)
- `Brokerage` — name, provider, accountType (TAXABLE/IRA/401K/HSA/529), encrypted API keys
- `SecuritiesTaxSettings` — per-user per-year: tax status (INVESTOR/TRADER), cost basis method, Section 988 election
- `SecuritiesTransaction` — date, type (19 types), symbol, assetClass, quantity, price, fees, option fields
- `SecuritiesLot` — open/closed lots with cost basis, wash sale adjustments, holding period tacking
- `SecuritiesTaxableEvent` — Form 8949 line items with box assignment (A-F)
- `SecuritiesWashSale` — disallowed loss, basis adjustment, IRA permanent flag, daisy-chain tracking
- `SecuritiesDividend` — qualified/ordinary/ROC classification for Schedule B
- `SecuritiesEquivalenceGroup` — user-defined "substantially identical" security groups
- `SecuritiesSection1256Symbol` — configurable list of Section 1256 qualifying symbols

### Caching & History (3 tables)
- `TaxReportCache` — computed reports cached by (userId, year, method) as JSON
- `OhlcvMintCache` — persistent cache for on-chain price lookups
- `TransactionEditHistory` — full audit trail of edits with old/new values, version, revert flag

---

## 4. Application Pages

### Public
| Route | Purpose |
|---|---|
| `/login` | Email/password + OAuth login |
| `/register` | Account creation (resets onboarding for same-device new accounts) |

### Crypto
| Route | Purpose |
|---|---|
| `/accounts` | Connected wallets + exchanges. Sync, Pull Prices, Refresh. Account type breakdown bar. Bulk select + actions. Detail sheet per account. Suggested wallets section. |
| `/transactions` | Full transaction ledger. Filters: type, year, wallet, chain, source, value range. Sort by any column. Advanced view (price, cost basis, proceeds). P&L breakdown chart (D3). Activity heatmap. Bulk reclassify. Edit history. Per-wallet or universal FIFO toggle. |

### Securities
| Route | Purpose |
|---|---|
| `/securities/accounts` | Brokerage accounts with account type pills (Taxable/IRA/Roth/401k). Add Brokerage dialog with Manual Setup / CSV Import tabs. |
| `/securities/transactions` | Securities transaction ledger with Horizon-styled table. Compute Lots button. CSV import sheet. |
| `/securities/lots` | Open/closed lot viewer |
| `/securities/wash-sales` | Wash sale detail reports |
| `/securities/settings` | Per-year tax status, cost basis method, Section 988 election, equivalence groups |

### Reports & Tools
| Route | Purpose |
|---|---|
| `/tax-reports` | Unified report hub. Year picker, engine filter (Crypto/Securities/Combined). Generates fillable PDFs (Form 8949, Schedule D, Schedule 1) and CSV exports (TurboTax, Capital Gains, Income Report). Per-form download buttons with spinner. |
| `/tax-ai` | Claude-powered chat. SQL generation against transaction DB. File upload (10MB) for CSV reformatting. Streaming responses. CSV download blocks suppressed from chat stream. |
| `/tutorial` | 8-step getting started guide (Connect → Sync → Enrich → Review → Compute → Add Brokerages → Compute Lots → Download Reports). Section filter tabs. Restart Interactive Guide button. |
| `/settings` | Country, timezone, cost basis method |

---

## 5. API Routes (58 total)

### Authentication (8)
Registration, login, logout, session check, Coinbase OAuth flow.

### Wallets (3)
- `GET/POST/DELETE /api/wallets` — CRUD + wallet suggestions
- `POST /api/wallets/sync` — Helius (Solana) or Moralis (EVM) sync. Accepts walletId, chains, fullSync params. 13-min max. Does NOT auto-compute cost basis.
- `GET /api/wallets/suggestions` — counterparty address analysis

### Exchanges (4)
- `POST /api/exchanges/connect` — encrypt + store API credentials
- `POST /api/exchanges/sync` — pull trades, deposits, withdrawals from exchange APIs. Incremental via lastSyncAt.

### Transactions (13)
CRUD, CSV import (6 exchange formats + custom), export, categorize, resolve symbols, duplicates, bulk operations, edit history, revert.

### Tax Reports (7)
- `GET /api/tax-reports` — aggregate from DB (same source as transactions page). Cached in TaxReportCache.
- `GET /api/tax-reports/pdf` — generate fillable PDFs. All data from DB (single source of truth). Form 8949 aggregates by symbol for large datasets.
- `GET /api/tax-reports/combined` — combined crypto + securities Schedule D.

### Pricing (3)
- `POST /api/prices/enrich-historical` — multi-phase: swap pricing → NFT pricing → transfer pricing → mirror pricing → OHLCV fallback. Accepts walletId for per-wallet scoping.

### Cost Basis (1)
- `POST /api/cost-basis/compute` — runs FIFO/LIFO/HIFO. Writes cost_basis_usd, gain_loss_usd, holding_period, date_acquired to each transaction row.

### Securities (9)
Import, compute (lot engine + wash sales + dividends + Sections 1256/475/988), reports, settings, brokerages, lots, wash sales, equivalence groups, Section 1256 symbols.

### Tax AI (1)
- `POST /api/tax-ai` — Claude Opus with streaming. 32K tokens when file attached. System prompt includes both crypto and securities CSV format specs for reformatting. CSV download blocks suppressed from stream.

---

## 6. Tax Calculation Engines

### 6.1 Crypto — US (IRS)

**Cost Basis Methods:**
- FIFO (default), LIFO, HIFO
- Per-wallet FIFO for 2025+ (IRS T.D. 10000). Lot key format: `"walletAddress:ASSET"`
- Universal FIFO for 2024 and prior. Lot key: `"ASSET"`

**Stablecoin Override:**
USDC, USDT, DAI, PYUSD, BUSD, TUSD, FRAX, USDP, GUSD, LUSD, MIM, SUSD, USDD — forced cost basis = proceeds (zero gain) to prevent phantom gains from DeFi transfers depleting lot queues.

**Income Detection (4 rules):**
1. CLAIM_REWARDS type
2. Known airdrop program IDs (Streamflow vesting, JUP Jupuary)
3. HARVEST/PAYOUT types
4. Staking Reward type

**Gambling Detection (6 layers):**
1. Helius transaction types (PLACE_BET, CREATE_BET, BUY_TICKETS)
2. Known gambling wallet addresses (Stake.com, Flip.gg)
3. Gambling token mints (RLB, FLIPGG, SCS)
4. Gambling program IDs (Flip.gg, ORAO VRF)
5. Helius source labels (FOXY_COINFLIP, etc.)
6. Prediction market detection

**Transaction Categories (10):**
buy, sell, transfer, swap, staking, defi, nft, income, gambling, other — with 200+ raw type mappings in `transaction-categorizer.ts`.

**Wash Sales:**
Crypto wash sales are tracked and flagged (30-day window, loss sales tracked with remaining amounts) but not formally disallowed on forms, since IRS hasn't explicitly required it for crypto pre-2025. The infrastructure is ready for when they do.

### 6.2 Crypto — UK (HMRC)

**Share Pooling (three-tier matching):**
1. Same-Day Rule — buy + sell same token same calendar day matched first
2. 30-Day B&B Rule — sell matched to re-acquisition within 30 days (prevents loss harvesting)
3. Section 104 Pool — weighted average cost pool per token

Two-pass algorithm: Pass 1 builds pools + collects disposals/acquisitions. Pass 2 applies matching with pool adjustments to prevent double-counting.

**Thresholds:**
- Annual Exempt Amount: GBP 3,000 (straight deduction from net gains)
- No short-term vs long-term distinction (all gains taxed at same rate)
- Tax year: April 6 to April 5

**FX Conversion:**
USD to GBP via Frankfurter API (ECB daily rates). 5-day lookback for weekends/holidays. In-memory cache.

### 6.3 Crypto — Germany (Finanzamt)

**Cost Basis:** Universal FIFO per-token (NOT per-wallet — explicitly `perWallet = false`).

**1-Year Holding Exemption:** Gains AND losses from disposals held >1 year are zeroed out (Section 23 EStG). Both sides zero — no strategic loss harvesting.

**Freigrenze (all-or-nothing thresholds):**
- Capital gains: EUR 1,000. If net short-term gains < EUR 1,000, ALL gains zeroed. If >= EUR 1,000, ALL gains fully taxable.
- Income: EUR 256. Same logic for staking/mining/airdrop income.

These are cliffs, not deductions. EUR 999 = tax free. EUR 1,001 = fully taxed on EUR 1,001.

**FX Conversion:** USD to EUR via same Frankfurter API.

### 6.4 Securities — US (IRS)

**Lot Engine (`securities-lot-engine.ts`):**
- 6 cost basis methods: FIFO, LIFO, HIFO, Specific ID, Average Cost
- 19 transaction types: BUY, SELL, SELL_SHORT, BUY_TO_COVER, DIVIDEND, DIVIDEND_REINVEST, INTEREST, SPLIT, MERGER, SPINOFF, RETURN_OF_CAPITAL, OPTION_EXERCISE, OPTION_ASSIGNMENT, OPTION_EXPIRATION, RSU_VEST, ESPP_PURCHASE, TRANSFER_IN, TRANSFER_OUT, YEAR_END_FMV
- SELL_SHORT consumes existing long lots first, then opens short position for remainder
- BUY_TO_COVER matches against open shorts FIFO
- DIVIDEND_REINVEST records dividend income AND creates DRIP lot
- SPLIT reads ratioFrom/ratioTo from transaction
- All financial values rounded to 2 decimal places via `round2()` helper

**Wash Sale Engine (`securities-wash-sale-engine.ts`):**
Full IRS Section 1091 compliance:
- 61-day window (30 days before + sale day + 30 days after)
- 30-day lookback has priority over post-sale matches
- Cross-account detection (losses in Account A, replacement in Account B)
- IRA replacement = permanent disallowance (loss never recoverable)
- Partial wash sales (sold 100 shares at loss, repurchased 60 = 60% disallowed)
- Daisy-chaining: iterative multi-pass (max 100 passes) to catch cascading wash sales
- Cross-year carry-forward detection (`replYear > saleYear`)
- Binary search for O(N log N) performance on replacement matching
- Options: substantially identical matching via equivalence groups

**Section 1256 (`securities-section-1256.ts`):**
60/40 long-term/short-term split for regulated futures and broad-based index options. Year-end mark-to-market for open positions. Configurable qualifying symbol list (SPX, NDX, RUT, VIX, etc.).

**Section 475(f) (`securities-section-475.ts`):**
Mark-to-market election for trader status. All gains/losses become ordinary income. Year-end deemed sales for all open positions. Section 481(a) transition adjustment in election year. No wash sale rules apply.

**Section 988 (`securities-section-988.ts`):**
Forex transactions default to ordinary income/loss. Opt-out election available to treat as capital gains or Section 1256 (if qualifying).

**Dividends (`securities-dividends.ts`):**
Classification: qualified, ordinary, return of capital, capital gain distributions. DRIP support. Schedule B aggregation.

---

## 7. Key Architecture Decisions

### Single Source of Truth for Tax Numbers
All IRS forms (Form 8949, Schedule D, Schedule 1) read from the same `gain_loss_usd`, `cost_basis_usd`, `holding_period`, and `date_acquired` columns in the transactions table. There is no separate tax calculation at form generation time. The tax calculator writes to the DB during "Compute Cost Basis", and forms read from the DB. This prevents the forms and the transactions page from ever showing different numbers.

**How proceeds are derived:**
```
totalCostBasis = abs(SUM(cost_basis_usd)) WHERE gain_loss_usd IS NOT NULL
netGain = SUM(gain_loss_usd) WHERE gain_loss_usd IS NOT NULL
totalProceeds = totalCostBasis + netGain
```
Same formula used by the transactions page API, tax reports API, and Schedule D PDF generation.

### Per-Wallet FIFO Lot Keys
Composite lot keys `"walletAddress:ASSET"` for US 2025+ ensure lots from different wallets don't intermix. The stablecoin override extracts the bare asset from composite keys (`"addr:USDC"` → `"USDC"`) to match the STABLECOINS set.

### Sync Pipeline (Client-Side Chaining)
When a user adds wallets, the system chains: Sync each wallet → Enrich each wallet → Compute cost basis. Each API call is its own serverless invocation (stays under 13-min Vercel limit). A global React context (`SyncPipelineProvider`) manages state across page navigation with a floating progress bar.

### Form 8949 Performance
Large datasets (>11 disposals per holding period) use per-symbol aggregation instead of per-transaction PDF pages. Each row: `"BTC (12 txns) — See attached"` with aggregated proceeds/cost/gain. Detail rows available via CSV export. This avoids O(N) PDF template loads that previously took minutes.

### Wallet Ownership Model
The unique constraint on wallets is `(address, provider, userId)` — multiple users can independently connect the same wallet address. The "Exclusive" toggle (default off) checks if another user already has the wallet and blocks if enabled. Transactions are linked by `wallet_address` column, not by userId directly.

### Exchange API Normalization
All 5 exchange clients normalize to a common `ExchangeTransaction` interface. Non-USD trading pairs (e.g., ETH/BTC on Kraken) set `value_usd = 0` and `price_per_unit = null` so price enrichment fills correct USD values — prevents storing BTC costs as USD. Coinbase swap transactions pair both sides via `trade.id` to populate `incoming_asset_symbol`.

---

## 8. Security Measures

### Authentication
- Passwords hashed with bcryptjs (10 rounds)
- NextAuth JWT sessions with NEXTAUTH_SECRET validation on every request
- Server-side auth middleware (`src/middleware.ts`) on all protected routes
- OAuth: Google, Coinbase (with encrypted token refresh)

### API Security
- Rate limiting: per-IP and per-user (LRU-cache based, note: resets on cold start without Redis)
- Security headers: X-Content-Type-Options, X-Frame-Options, X-XSS-Protection, strict Referrer-Policy, restrictive Permissions-Policy
- All Prisma queries filter by userId — no cross-user data access
- Tax AI SQL queries wrapped in CTE ownership filter — only SELECT allowed
- API key encryption: AES-256-GCM with PBKDF2 (100K iterations)

### Data Protection
- Transaction edit history with full audit trail (old values, new values, editor, version)
- Immutable raw data storage (HeliusRawTransaction)
- Tax report cache invalidated on any transaction mutation
- No sensitive data in client-side localStorage (onboarding state only)

---

## 9. Design System (Horizon)

### Color Palette
| Token | Light | Dark |
|---|---|---|
| Primary text | `#1A1A1A` | `#F5F5F5` |
| Secondary text | `#6B7280` | `#9CA3AF` |
| Muted text | `#9CA3AF` | `#6B7280` |
| Borders | `#E5E5E0` | `#333` |
| Row dividers | `#F0F0EB` | `#2A2A2A` |
| Background | `white` | `#1A1A1A` |
| Table header bg | `#FAFAF8` | `#161616` |
| Hover | `#FAFAF7` | `rgba(255,255,255,0.03)` |

### Typography
| Element | Classes |
|---|---|
| Page title | `text-[28px] font-light tracking-[-0.02em]` |
| Large numbers | `text-[36px] font-bold` with `fontVariantNumeric: 'tabular-nums'` |
| Section headers | `text-[16px] font-semibold` |
| Table headers | `text-[14px] font-semibold text-[#4B5563]` |
| Body | `text-[14px]` or `text-[13px]` |
| Labels | `text-[11px] font-semibold tracking-wide uppercase` |

### Pill Badge System
10 color-coded pill types using custom Tailwind tokens:
- `bg-pill-green-bg text-pill-green-text` — buy, connected
- `bg-pill-red-bg text-pill-red-text` — sell, error
- `bg-pill-blue-bg text-pill-blue-text` — transfer in, taxable account
- `bg-pill-purple-bg text-pill-purple-text` — swap, exchange, IRA
- `bg-pill-yellow-bg text-pill-yellow-text` — income, dividend
- `bg-pill-orange-bg text-pill-orange-text` — gambling, warning
- `bg-pill-teal-bg text-pill-teal-text` — staking, RSU, Roth IRA
- `bg-pill-indigo-bg text-pill-indigo-text` — transfer out, DeFi
- `bg-pill-pink-bg text-pill-pink-text` — NFT
- `bg-pill-gray-bg text-pill-gray-text` — other, unknown

Dark mode overrides use `rgba(R,G,B,0.12)` for backgrounds.

### Table Pattern
Sticky headers, vertical cell dividers (`border-r border-[#F0F0EB]`), skeleton loading rows, row hover with `transition-colors`, group hover for action buttons.

---

## 10. CSV Import System

### Crypto (6 exchange formats + custom)
| Format | Key Columns |
|---|---|
| Coinbase | Timestamp, Transaction Type, Asset, Quantity, Spot Price, Total, Fees |
| Binance | Date(UTC), Pair, Type, Order Amount, AvgTrading Price, Total |
| Kraken | time, type, asset, amount, fee |
| KuCoin | Time, Side, Amount, Price, Volume, Fee |
| Gemini | Date, Time, Type, Symbol, Quantity, USD Amount, USD Fee |
| Custom | Date, Type, Asset, Amount, Price, Value, Notes |

All parsers use fuzzy column matching (normalizes spaces, punctuation, case). Template CSV downloads available per exchange. Tax AI can reformat arbitrary CSVs into any of these formats.

### Securities (universal template)
Required: `date, type, symbol, asset_class, quantity, price`
Optional: `fees, account, account_type, total_amount, lot_id, underlying_symbol, option_type, strike_price, expiration_date, dividend_type, is_covered, is_section_1256, notes`

Auto-creates brokerage accounts from the `account` column during import.

---

## 11. Feature Completion Status

### Completed
- [x] User auth (email/password + Google OAuth)
- [x] Wallet connection (Solana + 12 EVM chains)
- [x] Exchange API connections (Coinbase, Binance, Kraken, KuCoin, Gemini)
- [x] Transaction sync with deduplication
- [x] Price enrichment (CoinGecko, on-chain OHLCV, Binance, mirror pricing)
- [x] Cost basis: US FIFO/LIFO/HIFO, per-wallet FIFO 2025+
- [x] Cost basis: UK share pooling (same-day, B&B, Section 104)
- [x] Cost basis: Germany universal FIFO + 1-year exemption + Freigrenze
- [x] FX conversion (USD to GBP/EUR via ECB rates)
- [x] Income detection (staking, airdrops, mining, rewards)
- [x] Gambling detection (6-layer)
- [x] Transaction categorization (200+ type mappings, 10 categories)
- [x] Form 8949 PDF (per-symbol aggregation for large datasets)
- [x] Schedule D PDF (single source of truth from DB)
- [x] Schedule 1 PDF (income from DB)
- [x] CSV exports (TurboTax 1099-B, capital gains, income, transaction history)
- [x] Tax AI (Claude Opus, streaming, CSV reformat, 10MB file upload)
- [x] Securities lot engine (6 cost basis methods, 19 transaction types)
- [x] Securities wash sale engine (full Section 1091)
- [x] Securities Section 1256 (60/40), Section 475 (MTM), Section 988 (forex)
- [x] Securities dividends + Schedule B
- [x] Securities CSV import with template + format guidance
- [x] Transaction edit history with version tracking + revert
- [x] Multi-wallet bulk add (row-based, mixed types, pipeline sync)
- [x] Sync pipeline (chained sync → enrich → compute with floating progress bar)
- [x] Tutorial page (8-step guide)
- [x] Onboarding tooltips (resets for new accounts on same device)
- [x] Rate limiting + security headers
- [x] Sentry error tracking

### Phase 2 Securities (Planned)
- [ ] Corporate actions (splits, mergers, spinoffs with fractional shares)
- [ ] Options exercise/assignment/expiration engine
- [ ] Short sale reporting date rules
- [ ] RSU/ESPP with supplemental income
- [ ] Broker-specific CSV parsers (Schwab, Fidelity, E*Trade, IBKR)
- [ ] Brokerage API integrations (when available)
- [ ] 1099-B import and reconciliation

### Phase 3 Securities (Future)
- [ ] Tax-loss harvesting optimization
- [ ] Real-time market data for year-end FMV
- [ ] Section 1092 straddle detection
- [ ] Worthless securities deduction
- [ ] Multi-year data reconstruction

### Infrastructure (Planned)
- [ ] Stripe billing + subscription management
- [ ] Upstash Redis for shared rate limiting + faster caching
- [ ] Cloudflare WAF + DDoS protection
- [ ] Resend transactional emails
- [ ] Background job system (QStash) for >13-min operations

---

## 12. User Accounts & Test Data

| Email | Name | Wallets | Transactions | Notes |
|---|---|---|---|---|
| jatinsawlani@gmail.com | (Jatin) | 7 Solana | ~53,103 | Primary test account, largest dataset |
| aaravsawlani1@gmail.com | Aarav Sawlani | 0 | 0 | Clean account for verification testing |
| psawlani@outlook.com | Prakash | varies | varies | Admin/dev account |
| danielboubes411@gmail.com | (Daniel) | varies | ~60,000 | Second-largest dataset |
| andy205jones@proton.me | Andy Jones | varies | ~2,000 | Smaller test account |

---

## 13. Known Architecture Notes

### Two Computation Paths (Resolved)
Previously, the tax calculator (`calculateTaxReport`) and the cost basis engine (`recomputeCostBasis`) both ran independent FIFO lot matching, producing different numbers. This was resolved by making the DB the single source of truth — `recomputeCostBasis` writes to the DB, all forms and pages read from the DB. `calculateTaxReport` is no longer called during form generation.

### Vercel Timeout Strategy
13-minute max duration per serverless function. Operations that could exceed this (multi-wallet sync, enrichment across many wallets) are chained client-side — each wallet is its own API call with its own 13-minute clock. The sync pipeline context persists across page navigation.

### Price Enrichment Order
The enrichment engine runs 6 phases in order:
1. Price SWAPs from Helius swap events (on-chain data)
2. Price NFT sales from Helius nft events
3. Price transfers via CoinGecko symbol lookup
4. Mirror priced swap sides to unpriced counterparties
5. OHLCV fallback for remaining unknown tokens
6. Contract address resolution for unmatched symbols

Enrichment must run BEFORE cost basis computation — unpriced transactions get zero cost basis.

### Transaction Ownership
Transactions are linked by `wallet_address`, not `userId`. When a wallet is connected, all transactions for that address become visible. The unique constraint `(address, provider, userId)` allows multiple users to independently connect the same address. CSV imports use `userId` directly. Exchange imports use `source` (exchange name) matched to the user's connected exchanges.
