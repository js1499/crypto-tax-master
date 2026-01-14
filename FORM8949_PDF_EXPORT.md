# Form 8949 PDF Export Implementation

## Overview

This implementation provides complete IRS Form 8949 PDF generation for reporting capital gains and losses from cryptocurrency transactions. Form 8949 is required by the IRS when filing taxes and reporting sales/exchanges of capital assets.

## What Was Implemented

### 1. Fixed Acquisition Date Tracking

**Problem**: Form 8949 requires actual acquisition dates, but the code was using sale dates.

**Solution**:
- Updated `TaxableEvent` interface to include `dateAcquired` field
- Modified all taxable event creation to track actual acquisition dates from cost basis lots
- Updated `generateForm8949Data` to use actual acquisition dates

**Files Modified**:
- `src/lib/tax-calculator.ts`
  - Added `dateAcquired?: Date` to `TaxableEvent` interface
  - Updated sell, swap, bridge, and liquidity removal handlers to track acquisition dates
  - Enhanced Form 8949 description to include chain and transaction hash

### 2. PDF Generator Library

**Installed**:
- `pdfkit` - Professional PDF generation library
- `@types/pdfkit` - TypeScript definitions

### 3. Form 8949 PDF Generator

**File**: `src/lib/form8949-pdf.ts`

**Features**:
- Generates official IRS Form 8949 format
- Separates short-term and long-term transactions (Parts I and II)
- Includes all required columns:
  - Description of property
  - Date acquired
  - Date sold
  - Proceeds
  - Cost basis
  - Adjustments (codes)
  - Gain/(Loss)
- Automatic pagination for large transaction lists
- Totals and subtotals calculation
- Professional formatting matching IRS form layout

**Key Functions**:
- `generateForm8949PDF()` - Main function to generate PDF buffer
- `formatDate()` - Formats dates as MM/DD/YYYY
- `formatCurrency()` - Formats currency with parentheses for losses

### 4. API Endpoint

**File**: `src/app/api/tax-reports/form8949/route.ts`

**Endpoint**: `GET /api/tax-reports/form8949?year=2023`

**Features**:
- Rate limited (10 PDFs per minute)
- Authenticated (requires user login)
- Generates PDF for specified tax year
- Returns PDF as downloadable file
- Optional taxpayer name and SSN parameters (for future enhancement)

**Response**:
- Content-Type: `application/pdf`
- Content-Disposition: `attachment; filename="Form8949-{year}.pdf"`

### 5. UI Integration

**File**: `src/app/tax-reports/page.tsx`

**Changes**:
- Updated "IRS Form 8949" form entry to indicate PDF export
- Added `handleDownloadForm8949()` function
- Connected download button to PDF generation API
- Automatic file download with proper filename

## Form 8949 Structure

### Part I: Short-Term Capital Gains and Losses
- Transactions held 1 year or less
- Taxed as ordinary income
- Higher tax rates

### Part II: Long-Term Capital Gains and Losses
- Transactions held more than 1 year
- Lower tax rates
- More favorable treatment

### Required Information Per Transaction

1. **Description**: Asset name, amount, chain, transaction hash
   - Example: "1.5 ETH (ethereum) - 0x1234abcd..."

2. **Date Acquired**: When the asset was purchased/received
   - Format: MM/DD/YYYY
   - From cost basis lot tracking

3. **Date Sold**: When the asset was sold/disposed
   - Format: MM/DD/YYYY
   - Transaction timestamp

4. **Proceeds**: Amount received from sale (after fees)
   - In USD
   - Net of transaction fees

5. **Cost Basis**: Original purchase price (including fees)
   - In USD
   - Includes purchase fees per IRS rules

6. **Adjustments**: Adjustment codes if applicable
   - Currently empty (can be extended for wash sales, etc.)

7. **Gain/(Loss)**: Net gain or loss
   - Proceeds - Cost Basis
   - Negative values shown in parentheses

## Usage

### From UI

1. Navigate to Tax Reports page
2. Select tax year
3. Go to "Tax Forms" tab
4. Find "IRS Form 8949 (PDF)"
5. Click "Download" button
6. PDF will download automatically

### From API

```bash
# Generate Form 8949 for 2023
GET /api/tax-reports/form8949?year=2023

# With optional taxpayer info (for future use)
GET /api/tax-reports/form8949?year=2023&name=John%20Doe&ssn=123-45-6789
```

### Programmatic Usage

```typescript
import { generateForm8949PDF } from "@/lib/form8949-pdf";
import { calculateTaxReport } from "@/lib/tax-calculator";

// Calculate tax report
const report = await calculateTaxReport(prisma, walletAddresses, 2023, "FIFO");

// Generate PDF
const pdfBuffer = await generateForm8949PDF(
  report.form8949Data,
  2023,
  "John Doe", // Optional
  "123-45-6789" // Optional
);

// Save or send PDF
fs.writeFileSync("Form8949-2023.pdf", pdfBuffer);
```

## PDF Features

### Layout
- Letter size (8.5" x 11")
- Professional margins
- Clear column headers
- Consistent row spacing

### Pagination
- Automatic page breaks when content exceeds page
- Headers repeated on each page
- Running totals maintained across pages
- Final totals on last page

### Formatting
- Currency values right-aligned
- Losses shown in parentheses: `($1,234.56)`
- Dates in MM/DD/YYYY format
- Transaction descriptions truncated if too long

### Summary Section
- Total proceeds
- Total cost basis
- Net gain/(loss)
- Separate totals for short-term and long-term

## IRS Compliance

### What's Included
✅ All capital gains/losses from cryptocurrency transactions
✅ Proper separation of short-term vs long-term
✅ Accurate acquisition dates from cost basis tracking
✅ Net proceeds (after fees)
✅ Cost basis (including purchase fees)
✅ Transaction descriptions with chain and hash

### What's Not Included (Future Enhancements)
- Adjustment codes (wash sales, etc.)
- Taxpayer identification (name, SSN) - currently optional
- Form 8949 checkboxes (A, B, C, D, E, F, G)
- Schedule D summary totals
- Multiple Form 8949 pages for different categories

## Testing

### Test PDF Generation

1. **Generate test data**:
   - Import transactions with various dates
   - Ensure mix of short-term and long-term
   - Include swaps, sells, and other disposals

2. **Generate PDF**:
   ```bash
   # Via API
   curl -H "Cookie: session_token=..." \
     http://localhost:3000/api/tax-reports/form8949?year=2023 \
     --output Form8949-2023.pdf
   ```

3. **Verify PDF**:
   - Open PDF in viewer
   - Check all transactions are listed
   - Verify dates are correct
   - Confirm totals match tax report
   - Check pagination works for large lists

### Test Edge Cases

1. **No transactions**:
   - Should generate PDF with "No taxable events" message

2. **Only short-term**:
   - Should only show Part I

3. **Only long-term**:
   - Should only show Part II

4. **Large transaction list**:
   - Should paginate correctly
   - Headers should repeat on each page
   - Totals should be accurate

## Future Enhancements

### 1. Official IRS Form Layout
- Use actual IRS Form 8949 template
- Include form instructions
- Add checkboxes (A, B, C, D, E, F, G)
- Match exact IRS formatting

### 2. Taxpayer Information
- Add name, SSN, address fields
- Store securely (encrypted)
- Pre-fill from user profile

### 3. Adjustment Codes
- Implement wash sale detection
- Add adjustment code logic
- Track basis adjustments

### 4. Schedule D Integration
- Generate Schedule D summary
- Link Form 8949 totals to Schedule D
- Complete tax package

### 5. Multiple Forms
- Generate separate forms for different categories
- Form 8949-A, B, C, D, E, F, G
- Based on transaction characteristics

### 6. PDF Styling
- Add official IRS colors
- Include IRS logo (if permitted)
- Match exact form dimensions
- Add form instructions

## Security Considerations

### Current Implementation
- ✅ Authentication required
- ✅ Rate limiting applied
- ✅ User can only access their own data
- ⚠️ SSN parameter exists but not recommended for production

### Production Recommendations
1. **Encrypt SSN**: Never store or log SSN in plain text
2. **Secure transmission**: Use HTTPS only
3. **Access control**: Verify user owns the data
4. **Audit logging**: Log PDF generation events
5. **Data retention**: Define retention policy for generated PDFs

## Troubleshooting

### PDF Not Generating
- Check authentication (must be logged in)
- Verify tax year has transactions
- Check browser console for errors
- Verify API endpoint is accessible

### PDF Format Issues
- Ensure PDFKit is installed correctly
- Check font availability
- Verify page dimensions
- Test with different transaction counts

### Missing Transactions
- Verify transactions are in correct tax year
- Check transaction status (must be confirmed/completed)
- Ensure transactions are taxable events (sells, swaps, etc.)

### Incorrect Dates
- Verify acquisition dates are tracked in cost basis lots
- Check transaction timestamps
- Ensure date formatting is correct

## Notes

- Form 8949 is required when you have capital gains/losses
- If no taxable events, Form 8949 is not required
- PDF format is suitable for printing and filing
- Can be imported into tax software (TurboTax, H&R Block, etc.)
- Should be reviewed before filing with IRS

## Support

For issues:
1. Check browser console for errors
2. Verify API endpoint returns PDF
3. Test with different tax years
4. Verify transaction data is correct
5. Check PDF opens in standard PDF viewer
