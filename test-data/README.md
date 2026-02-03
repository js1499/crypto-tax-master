# Test Data Directory

This directory contains test CSV files for debugging, development, and testing purposes.

## Sample Test Files

### Exchange-Specific Formats

| File | Format | Transactions | Description |
|------|--------|-------------|-------------|
| `sample-coinbase.csv` | Coinbase | 10 | Standard Coinbase export (Buy, Sell, Swap, Staking, Receive, Send) |
| `sample-binance.csv` | Binance | 10 | Binance trade history with trading pairs |
| `sample-kraken.csv` | Kraken | 10 | Kraken ledger format (deposits, trades, staking) |

### Other Formats

| File | Format | Transactions | Description |
|------|--------|-------------|-------------|
| `sample-tax-report-format.csv` | Tax Report | 10 (creates 20) | Format with Date Purchased, Date Sold, Proceeds, Cost Basis |
| `sample-custom-format.csv` | Generic | 8 | Simple custom format with common column names |
| `sample-edge-cases.csv` | Coinbase | 12 | Edge cases: zero amounts, negatives, wash sales, missing data |

## Testing Scenarios

### 1. Basic Import Test
- Import `sample-coinbase.csv` with "Coinbase" format
- Expected: 10 transactions imported successfully

### 2. Tax Report Format Test
- Import `sample-tax-report-format.csv` with "Custom" format
- Expected: 20 transactions (10 buys + 10 sells) - the parser creates paired transactions

### 3. Cost Basis Verification
After importing tax report format:
- Check that sell transactions have "Cost Basis: $X.XX" in notes
- Verify tax report shows correct gains/losses

### 4. Edge Case Handling
Import `sample-edge-cases.csv`:
- Zero amount transactions should be filtered
- Negative amounts should be rejected or handled
- Sells without buys should show 0 cost basis warning
- Wash sale scenario (ETH in May) should be detected

### 5. Duplicate Detection
1. Import any sample file
2. Re-import the same file
3. Second import should skip all as duplicates

## Creating Your Own Test Data

### Adding Test Files

1. Place your CSV file in this directory
2. Name it descriptively: `tax-report-2024.csv`, `sample-transactions.csv`
3. Run import test through the UI

### CSV Column Requirements

**Minimum required columns:**
- Date/Timestamp
- Asset/Symbol
- Amount/Quantity
- Value (USD) or Price

**Recommended columns:**
- Transaction Type (Buy, Sell, Swap, etc.)
- Fees
- Notes

## Privacy Note

⚠️ **Important**: CSV files may contain sensitive financial data. Consider:
- Using a private GitHub repository
- Redacting or anonymizing sensitive information before uploading
- Removing the file after debugging is complete
- Using the sample files provided rather than real transaction data
