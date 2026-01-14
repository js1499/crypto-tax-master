# How to Share Logs for Debugging

## Where to Find Logs

The logs appear in the **terminal/command prompt** where you're running the dev server (`npm run dev`).

## What to Look For

When you visit the tax reports page, you should see logs like:

```
[Tax Reports API] Calculating tax report for year 2024, user ...
[Tax Calculator] Fetching transactions for year 2024
[Tax Calculator] Found X total transactions
[Tax Calculator] CSV imports: X
[Tax Calculator] Processing X Solana, X Ethereum, and X unchain transactions
[processTransactionsForTax] Processing X transactions for tax year 2024
[processTransactionsForTax] Transaction types: { sell: X, buy: X, ... }
[processTransactionsForTax] Generated X taxable events and X income events
[Tax Reports API] Tax report calculated:
  - Taxable events: X
  - Income events: X
  - Short-term gains: $X.XX
  - Long-term gains: $X.XX
```

## How to Share Logs

### Option 1: Copy from Terminal (Easiest)

1. **Open the terminal** where `npm run dev` is running
2. **Visit the tax reports page** in your browser (http://localhost:3000/tax-reports)
3. **Select year 2024** (or the year with your data)
4. **Scroll up in the terminal** to find the log messages
5. **Copy the relevant logs** (look for lines starting with `[Tax` or `[processTransactionsForTax]`)
6. **Paste them here** in the chat

### Option 2: Save Logs to File

If your terminal supports it:
1. Right-click in the terminal
2. Select "Select All" or highlight the relevant log section
3. Copy and paste into a text file
4. Share the file contents

### Option 3: Use PowerShell to Capture

Run this in a **new PowerShell window** (not the one running the server):

```powershell
# This will show you the last 50 lines of any process output
# But you'll need to manually copy from the dev server terminal
```

## What I Need to See

Please share:
1. **The log output** when you visit `/tax-reports?year=2024`
2. **Any error messages** (lines with "Error" or "Failed")
3. **The numbers** for:
   - "Found X total transactions"
   - "CSV imports: X"
   - "Generated X taxable events"
   - "Short-term gains: $X.XX"

## Quick Test

To generate fresh logs:
1. Open the tax reports page: http://localhost:3000/tax-reports
2. Make sure **2024** is selected in the year dropdown
3. Wait a few seconds for the API call
4. Check the terminal for the log messages
5. Copy and paste the relevant lines here
