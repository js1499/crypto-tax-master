# Complete Swap Handling Implementation

## Overview

This implementation provides complete swap handling for crypto-to-crypto swaps, properly tracking both sides of the transaction:
1. **Disposal of outgoing asset** (taxable sale event)
2. **Acquisition of incoming asset** (establishes new cost basis)

## What Was Implemented

### 1. Database Schema Updates

Added three new fields to the `Transaction` model:
- `incoming_asset_symbol` - The asset received in the swap
- `incoming_amount_value` - The amount of incoming asset received
- `incoming_value_usd` - The USD value of incoming asset at swap time

**Migration Required:**
```bash
npx prisma migrate dev --name add_swap_fields
```

### 2. Tax Calculator Updates

**Enhanced `parseSwapTransaction` function:**
- First checks database fields for stored swap information
- Falls back to parsing from notes/asset_symbol if not in database
- Improved pattern matching for various swap formats
- Calculates incoming value USD when possible

**Swap Processing Logic:**
- **Outgoing Asset**: Creates taxable event (disposal)
  - Calculates capital gains/losses
  - Subtracts fees from proceeds
  - Tracks holding period
  
- **Incoming Asset**: Adds to cost basis
  - Cost basis = Fair Market Value at swap time + fees
  - Establishes new lot for future sales
  - Properly tracks acquisition date

### 3. CSV Parser Updates

**New `parseSwapInfo` method:**
- Detects swaps from transaction type, notes, and asset symbols
- Supports multiple patterns:
  - `"1.5 ETH → 3000 USDC"`
  - `"Swapped ETH for USDC"`
  - `"ETH/USDC"` (from asset symbol)
  
**Exchange-Specific Handling:**

**Coinbase:**
- Parses swap info from notes field
- Extracts both assets and amounts when available

**Binance:**
- Treats all trades (Buy/Sell) as swaps
- For "Sell": baseAsset is outgoing, quoteAsset is incoming
- For "Buy": quoteAsset is outgoing, baseAsset is incoming
- Automatically calculates incoming amounts and values

**Other Exchanges:**
- Generic swap detection from notes and asset symbols
- Can be extended for exchange-specific formats

### 4. Transaction Import Updates

**CSV Import Route:**
- Stores swap fields when detected during parsing
- Preserves swap information in database

**Blockchain API Fetch Route:**
- Ready to store swap fields (currently blockchain APIs don't extract swap info)
- Can be enhanced to parse DEX contract interactions

## How It Works

### Example: ETH → USDC Swap

**Transaction Data:**
- Type: "Swap"
- Asset: "ETH"
- Amount: 1 ETH
- Value USD: $2,000
- Fee USD: $10
- Notes: "Swapped 1 ETH for 2000 USDC"

**Parsed Swap Info:**
- Outgoing Asset: ETH
- Outgoing Amount: 1 ETH
- Outgoing Value: $2,000
- Incoming Asset: USDC
- Incoming Amount: 2000 USDC
- Incoming Value: $2,000

**Tax Calculation:**

1. **Disposal of ETH (Taxable Event):**
   - Proceeds: $2,000 - $10 (fees) = $1,990
   - Cost Basis: (from previous ETH purchases)
   - Gain/Loss: $1,990 - Cost Basis
   - Creates taxable event for tax year

2. **Acquisition of USDC (Cost Basis):**
   - Cost Basis: $2,000 + $10 (fees) = $2,010
   - Amount: 2000 USDC
   - Price per unit: $1.005
   - Creates new lot for future USDC sales

## Usage Examples

### CSV Import

When importing a CSV with swaps, the parser automatically detects and stores swap information:

```csv
Timestamp,Transaction Type,Asset,Quantity,Total,Fees,Notes
2024-01-15,Swap,ETH,1.5,3000,10,"Swapped 1.5 ETH for 3000 USDC"
```

Result:
- Transaction type: "Swap"
- Asset: "ETH"
- Incoming asset: "USDC"
- Incoming amount: 3000
- Incoming value: $3000

### Manual Entry

For manually entered swaps, ensure the notes field contains swap information:
- `"1.5 ETH → 3000 USDC"`
- `"Swapped ETH for USDC"`
- `"ETH/USDC"` (in asset symbol)

### Binance Trades

Binance trades are automatically treated as swaps:
- **Sell BTC/USDT**: Selling BTC (outgoing) for USDT (incoming)
- **Buy ETH/BTC**: Buying ETH (incoming) with BTC (outgoing)

## Tax Compliance

### IRS Rules for Swaps

1. **Like-Kind Exchange Rules Eliminated**: As of 2017, crypto swaps are taxable events (no like-kind exchange treatment)

2. **Outgoing Asset**: Treated as a sale
   - Proceeds = Fair Market Value at swap time
   - Fees reduce proceeds
   - Capital gains/losses calculated

3. **Incoming Asset**: Treated as a purchase
   - Cost basis = Fair Market Value at swap time
   - Fees added to cost basis
   - Establishes new lot for future sales

4. **Holding Period**: 
   - Outgoing asset: Uses original purchase date
   - Incoming asset: Starts from swap date

## Testing

### Test Swap Import

1. Create a CSV with swap transactions:
```csv
Timestamp,Transaction Type,Asset,Quantity,Total,Fees,Notes
2024-01-15,Swap,ETH,1,2000,10,"1 ETH → 2000 USDC"
```

2. Import via `/api/transactions/import`

3. Verify in database:
   - `type` = "Swap"
   - `asset_symbol` = "ETH"
   - `incoming_asset_symbol` = "USDC"
   - `incoming_amount_value` = 2000
   - `incoming_value_usd` = 2000

4. Generate tax report:
   - Should show disposal of ETH (taxable event)
   - Should show acquisition of USDC (new cost basis)

### Test Tax Calculation

1. Create test transactions:
   - Buy 1 ETH for $1,000 (cost basis)
   - Swap 1 ETH → 2000 USDC (value $2,000, fee $10)

2. Expected results:
   - **ETH Disposal**: 
     - Proceeds: $1,990 ($2,000 - $10)
     - Cost Basis: $1,000
     - Gain: $990
   - **USDC Acquisition**:
     - Cost Basis: $2,010 ($2,000 + $10)
     - Amount: 2000 USDC
     - Available for future USDC sales

## Future Enhancements

### Blockchain API Swap Detection

Currently, blockchain APIs mark contract calls as "Swap" but don't extract incoming asset info. Future enhancements:

1. **DEX Contract Parsing**:
   - Parse Uniswap, SushiSwap, PancakeSwap contract interactions
   - Extract token0/token1 from swap events
   - Calculate amounts from contract logs

2. **Multi-Hop Swaps**:
   - Detect complex swaps (ETH → USDC → SOL)
   - Break down into individual swap events
   - Track each leg separately

3. **Swap Aggregators**:
   - Parse 1inch, 0x, Paraswap transactions
   - Extract final received asset
   - Calculate effective swap rate

### UI Enhancements

1. **Swap Visualization**:
   - Show both sides of swap in transaction list
   - Display swap rate
   - Highlight taxable events

2. **Swap Editing**:
   - Allow users to manually correct swap information
   - Edit incoming asset/amount if not detected
   - Add swap info to existing transactions

3. **Swap Reports**:
   - Summary of all swaps
   - Swap frequency analysis
   - Most swapped assets

## Migration Instructions

1. **Run Migration**:
   ```bash
   npx prisma migrate dev --name add_swap_fields
   ```

2. **Regenerate Prisma Client**:
   ```bash
   npx prisma generate
   ```

3. **Verify Schema**:
   - Check that `Transaction` model has new fields
   - Verify database columns were created

4. **Test Import**:
   - Import a CSV with swap transactions
   - Verify swap fields are populated
   - Check tax calculation includes both sides

## Notes

- Swap detection relies on transaction notes and asset symbols
- For best results, ensure CSV exports include swap information in notes
- Manual review may be needed for complex swaps
- Blockchain API swap detection can be enhanced with DEX contract parsing

## Support

For issues or questions:
1. Check transaction notes field contains swap information
2. Verify CSV format matches expected patterns
3. Review tax calculation logs for swap processing
4. Check database for stored swap fields
