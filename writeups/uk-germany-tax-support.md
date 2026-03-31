# UK and Germany Crypto Tax Support

## Overview

We added full tax calculation support for the United Kingdom (HMRC) and Germany (Finanzamt) alongside the existing US (IRS) support. A user selects their tax jurisdiction in Settings, and the entire tax engine — cost basis calculation, income classification, thresholds, currency, and report generation — adapts accordingly.

---

## What We Built

### 1. Country/Jurisdiction Setting

Users select their country in Settings > Tax Jurisdiction. The options are United States, United Kingdom, and Germany. This setting persists on the user record and flows through every tax calculation, report generation, and export.

### 2. Cost Basis Engines

Each country uses a fundamentally different method for computing cost basis on crypto disposals.

**United States — FIFO (First In, First Out)**
The existing engine. For 2025 onwards, FIFO is applied per-wallet per IRS final regulations (T.D. 10000). For 2024 and prior, universal FIFO across all wallets. Users can choose between per-wallet and universal at compute time.

**United Kingdom — HMRC Share Pooling**
An entirely new calculation engine (`processTransactionsForTaxUK`). HMRC mandates a three-tier matching system applied in strict priority order:

1. *Same-Day Rule* — If you buy and sell the same token on the same calendar day, those transactions are matched together first.
2. *30-Day Bed & Breakfast Rule* — If you sell a token and re-acquire the same token within the next 30 days, the disposal is matched against the re-acquisition. This prevents selling to crystallize a loss and immediately buying back.
3. *Section 104 Pool* — Any remaining disposals are matched against a running weighted-average cost pool per token. The pool tracks total quantity and total cost. Disposals reduce the pool proportionally at the average cost.

This is a two-pass algorithm. Pass 1 collects all disposals and acquisitions chronologically and builds the Section 104 pools. Pass 2 applies the three-tier matching to each disposal. When a same-day or B&B match occurs, the matched cost is removed from the Section 104 pool to prevent double-counting.

The UK has no short-term vs long-term distinction for crypto — all disposals are taxed at the same CGT rate regardless of holding period.

**Germany — FIFO with 1-Year Exemption**
Germany uses FIFO (same as the US engine) but with a critical addition: disposals of assets held for more than one year are completely tax-free. Both gains and losses from long-term holdings are zeroed out, since under Section 23 EStG, private sale transactions are only taxable within the one-year speculation period.

### 3. Tax Thresholds and Exemptions

**US** — No annual capital gains exemption.

**UK — GBP 3,000 Annual Exempt Amount**
The first GBP 3,000 of net capital gains each year is tax-free. This is a straight deduction (not all-or-nothing). We compute the lesser of GBP 3,000 or the total taxable gain and include it as `annualExemption` in the tax report. It covers all capital gains combined, not just crypto.

**Germany — EUR 1,000 Capital Gains Freigrenze**
If total net short-term gains are positive but below EUR 1,000, all gains are completely exempt. If at or above EUR 1,000, the entire amount is taxable — not just the excess. This is a cliff threshold (Freigrenze), not a deduction (Freibetrag). We apply this after computing all taxable events: if the net is under EUR 1,000, we zero out all short-term gain/loss events.

**Germany — EUR 256 Staking Income Freigrenze**
Same all-or-nothing logic applies to staking, mining, and lending income under Section 22 Nr. 3 EStG. If total income from these sources is under EUR 256, it's fully exempt. At or above EUR 256, it's fully taxable. We apply this after computing all income events.

### 4. FX Conversion

All transaction prices in the database are stored in USD (sourced from CoinGecko). For UK and German users, amounts must be reported in their local currency.

We use the Frankfurter API (free, based on European Central Bank data, no API key required) to fetch daily USD-to-GBP and USD-to-EUR exchange rates. The conversion happens inside `calculateTaxReport`:

- A single API call fetches the full year's daily rates as a time series.
- Each taxable event and income event is converted using the daily rate for its transaction date.
- A 5-day lookback handles weekends and holidays (markets are closed Saturday/Sunday).
- Rates are cached in memory to prevent duplicate fetches within the same computation.
- Summary totals are recomputed from the converted amounts.
- US users skip FX entirely — no API calls, no conversion, no overhead.

Daily rates are the accepted standard for tax reporting. HMRC references "the exchange rate for the date of the transaction" and all major crypto tax software (Koinly, CoinTracker, etc.) use daily rates.

### 5. Currency Display

The tax reports page and all exports display the correct currency symbol based on the user's country:
- US: $ (USD)
- UK: GBP
- Germany: EUR

The `formatTaxReport` function uses `Intl.NumberFormat` with the appropriate locale and currency code. Non-US users see a note "(amounts in USD)" in the tax summary subtitle as a transparency measure, since the underlying price data is USD-based and converted.

### 6. Income Classification

**US** — Staking rewards, airdrops from known programs, and harvest rewards are taxed as ordinary income at fair market value on receipt.

**UK** — Earned airdrops (where the user performed an action to receive them, like interacting with a protocol) are taxed as miscellaneous income. Random/unsolicited airdrops are NOT income — they have a zero cost basis and are only taxed as capital gains when disposed of. Our income detection rules (CLAIM_REWARDS, known airdrop program IDs, Streamflow vesting) only flag earned/active interactions, which is correct for UK treatment.

**Germany** — Same as UK for random airdrops (not taxable on receipt, zero cost basis). Earned staking/mining rewards are taxed under Section 22 Nr. 3 EStG, subject to the EUR 256 Freigrenze. The holding period for staked assets remains one year (the BMF confirmed in 2022 and 2025 that staking does not extend it to ten years).

### 7. Tax Reports and Exports

The tax reports page filters available exports based on the user's country. IRS-specific forms are hidden for non-US users, and country-specific reports appear only for the relevant jurisdiction.

**US-specific reports:**
- IRS Form 8949 (fillable PDF with correct box selection: H/I for short-term, K/L for long-term)
- IRS Schedule D (fillable PDF)
- IRS Schedule 1 (fillable PDF)
- TurboTax 1099-B CSV

**UK-specific reports:**
- SA108 Summary CSV — Capital gains summary matching Self Assessment fields. Includes disposal count, total proceeds, allowable costs, net gains, the GBP 3,000 annual exempt amount, and taxable gains. All amounts in GBP.
- UK Disposals CSV — Per-transaction detail with a matching rule column indicating whether each disposal was matched via Same Day, 30-Day B&B, or Section 104 Pool.

**Germany-specific reports:**
- Anlage SO Summary CSV — Section 23 private disposal summary (proceeds, acquisition costs, Freigrenze, taxable gain) and Section 22 Nr. 3 staking income summary (income, Freigrenze, taxable income). Includes a row for tax-free disposals held longer than one year. All amounts in EUR with German-language field labels.
- DE Disposals CSV — Per-transaction detail with holding period in days and a Steuerfrei (tax-free) flag for holdings exceeding one year.

**Universal reports (shown to all countries):**
- Capital Gains CSV
- Income Report
- Transaction History
- Capital Gains by Asset
- Summary Report

### 8. Tax Year Configuration

A helper function `getTaxYearBounds` returns the correct date boundaries for each jurisdiction:
- US and Germany: January 1 to December 31 (calendar year)
- UK: April 6 to April 5 (HMRC fiscal year, e.g., 2025/26 runs April 6, 2025 to April 5, 2026)

---

## Why This Covers All Relevant Issues

### Cost Basis Accuracy
The UK share pooling engine implements all three HMRC-mandated matching tiers. The German engine correctly exempts long-term holdings and applies per-wallet FIFO. The US engine supports the 2025 per-wallet requirement. Each country gets the exact calculation method required by its tax authority.

### Threshold Handling
The UK GBP 3,000 deduction and both German Freigrenze thresholds (EUR 1,000 capital gains, EUR 256 income) are applied correctly — including the all-or-nothing cliff behavior of the Freigrenze, which is the most common source of errors in German crypto tax software.

### Currency Compliance
Tax authorities require reporting in local currency. The FX conversion uses ECB daily rates (the most authoritative source for European currencies) applied to each transaction's specific date. This matches the standard accepted by HMRC and German Finanzamt.

### Income Classification
The distinction between earned and random airdrops matters for UK and German users. Our income detection rules inherently only flag earned interactions (explicit claims, known airdrop programs, vesting contracts), which is the correct treatment for all three jurisdictions. Random token receipts are not flagged as income for any country.

### Reporting Formats
UK users get SA108-aligned summaries they can directly reference when filing Self Assessment online. German users get Anlage SO-aligned summaries with the exact field structure and German terminology used in ELSTER. Both include detailed per-transaction CSVs for record-keeping and accountant handoff.

### What's Not Covered (and Why)

**Electronic filing integration** — We don't submit directly to HMRC or ELSTER. Both systems have official APIs, but integrating with them requires government accreditation (HMRC's Making Tax Digital program, ELSTER's ERiC interface). This is a separate regulatory process, not a software limitation.

**Full FX conversion at the transaction level** — Amounts in the transaction database remain in USD. Conversion happens at report generation time. Storing GBP/EUR per-transaction would require re-enriching all prices in the target currency, which means separate CoinGecko API calls per currency. The current approach (convert at report time using daily FX rates) produces identical results for tax purposes and avoids tripling the price data storage.

**National Insurance (UK) and Solidarity Surcharge (Germany)** — These are secondary tax calculations that depend on the user's total income from all sources (employment, rental, etc.), not just crypto. Computing them would require income data we don't have. We report the taxable amounts; the user or their accountant applies the correct tax rates.

**Scottish income tax rates** — Scotland has different income tax bands than the rest of the UK. Since crypto gains are taxed at CGT rates (not income tax rates), this doesn't affect our calculations. If the user has crypto income (staking rewards classified as miscellaneous income), the Scottish rates would apply, but the amount reported by our software is the same regardless.

**Church tax (Germany)** — An 8-9% surcharge on income tax for registered church members. Like NI and Soli, this depends on the user's personal circumstances and total tax liability, not something we can compute from crypto data alone.
