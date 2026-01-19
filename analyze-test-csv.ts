import * as fs from 'fs';
import * as path from 'path';

interface TaxRecord {
  name: string;
  datePurchased: string;
  dateSold: string;
  saleType: string;
  numDaysHeld: string;
  purchasedTxn: string;
  soldTxn: string;
  soldTxnNotes: string;
  amount: string;
  asset: string;
  proceeds: number;
  costBasis: number;
  gainLoss: number;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());

  return result;
}

function parseAmount(value: string): number {
  const cleaned = value.replace(/[$,]/g, '').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

async function main() {
  const csvPath = path.join(__dirname, 'test-data', 'test-data.csv');
  console.log('Reading CSV file:', csvPath);
  console.log();

  const fileContent = fs.readFileSync(csvPath, 'utf-8');
  const lines = fileContent.split('\n').filter(line => line.trim());

  console.log(`Total lines in CSV: ${lines.length}`);
  console.log(`Total records (excluding header): ${lines.length - 1}`);
  console.log();

  // Skip header
  const header = parseCsvLine(lines[0]);
  console.log('CSV Columns:', header);
  console.log();

  const records: TaxRecord[] = [];
  let parseErrors = 0;

  for (let i = 1; i < lines.length; i++) {
    try {
      const fields = parseCsvLine(lines[i]);

      if (fields.length < 12) {
        parseErrors++;
        continue;
      }

      const proceeds = parseAmount(fields[10]);
      const costBasis = parseAmount(fields[11]);
      const gainLoss = proceeds - costBasis;

      records.push({
        name: fields[0],
        datePurchased: fields[1],
        dateSold: fields[2],
        saleType: fields[3],
        numDaysHeld: fields[4],
        purchasedTxn: fields[5],
        soldTxn: fields[6],
        soldTxnNotes: fields[7],
        amount: fields[8],
        asset: fields[9],
        proceeds,
        costBasis,
        gainLoss,
      });
    } catch (error) {
      parseErrors++;
    }
  }

  console.log(`Successfully parsed: ${records.length} records`);
  console.log(`Parse errors: ${parseErrors}`);
  console.log();

  // Calculate statistics
  // Note: Records with empty/missing sale type should default to short-term
  // IRS: If holding period can't be determined, default to short-term (conservative approach)
  const longTermRecords = records.filter(r => r.saleType.toLowerCase().includes('long'));
  const shortTermRecords = records.filter(r => !r.saleType.toLowerCase().includes('long'));

  const shortTermGains = shortTermRecords.filter(r => r.gainLoss > 0).reduce((sum, r) => sum + r.gainLoss, 0);
  const shortTermLosses = Math.abs(shortTermRecords.filter(r => r.gainLoss < 0).reduce((sum, r) => sum + r.gainLoss, 0));
  const longTermGains = longTermRecords.filter(r => r.gainLoss > 0).reduce((sum, r) => sum + r.gainLoss, 0);
  const longTermLosses = Math.abs(longTermRecords.filter(r => r.gainLoss < 0).reduce((sum, r) => sum + r.gainLoss, 0));

  const netShortTerm = shortTermGains - shortTermLosses;
  const netLongTerm = longTermGains - longTermLosses;
  const totalTaxableGain = netShortTerm + netLongTerm;

  // Count unique assets
  const uniqueAssets = new Set(records.map(r => r.asset));

  // Analyze by asset
  const assetStats: Record<string, { count: number; totalGainLoss: number; proceeds: number; costBasis: number }> = {};
  records.forEach(r => {
    if (!assetStats[r.asset]) {
      assetStats[r.asset] = { count: 0, totalGainLoss: 0, proceeds: 0, costBasis: 0 };
    }
    assetStats[r.asset].count++;
    assetStats[r.asset].totalGainLoss += r.gainLoss;
    assetStats[r.asset].proceeds += r.proceeds;
    assetStats[r.asset].costBasis += r.costBasis;
  });

  // Sort assets by transaction count
  const topAssets = Object.entries(assetStats)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 10);

  // Format currency
  const fmt = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  // Display results
  console.log('='.repeat(100));
  console.log(' TAX REPORTS PAGE - ACTUAL DATA FROM test-data.csv');
  console.log(' Based on 16,986 transaction records from 2024');
  console.log('='.repeat(100));
  console.log();

  console.log('┌─────────────────────────────────────────┬──────────────────────┐');
  console.log('│ Short-Term Gains                        │ ' + fmt(shortTermGains).padStart(20) + ' │');
  console.log('├─────────────────────────────────────────┼──────────────────────┤');
  console.log('│ Long-Term Gains                         │ ' + fmt(longTermGains).padStart(20) + ' │');
  console.log('├─────────────────────────────────────────┼──────────────────────┤');
  console.log('│ Short-Term Losses                       │ ' + fmt(shortTermLosses).padStart(20) + ' │');
  console.log('├─────────────────────────────────────────┼──────────────────────┤');
  console.log('│ Long-Term Losses                        │ ' + fmt(longTermLosses).padStart(20) + ' │');
  console.log('├─────────────────────────────────────────┼──────────────────────┤');
  console.log('│ Net Short-Term Gain/Loss                │ ' + fmt(netShortTerm).padStart(20) + ' │');
  console.log('├─────────────────────────────────────────┼──────────────────────┤');
  console.log('│ Net Long-Term Gain/Loss                 │ ' + fmt(netLongTerm).padStart(20) + ' │');
  console.log('├─────────────────────────────────────────┼──────────────────────┤');
  console.log('│ Total Taxable Gain/Loss                 │ ' + fmt(totalTaxableGain).padStart(20) + ' │');
  console.log('├─────────────────────────────────────────┼──────────────────────┤');
  console.log('│ Taxable Events                          │ ' + records.length.toString().padStart(20) + ' │');
  console.log('├─────────────────────────────────────────┼──────────────────────┤');
  console.log('│ Est. Tax Liability (20% rate)           │ ' + fmt(Math.max(0, totalTaxableGain) * 0.2).padStart(20) + ' │');
  console.log('└─────────────────────────────────────────┴──────────────────────┘');
  console.log();

  console.log('='.repeat(100));
  console.log(' TAX SUMMARY DETAILS');
  console.log('='.repeat(100));
  console.log();
  console.log(`  Short-term Capital Gains:        ${fmt(shortTermGains)}`);
  console.log(`  Short-term Capital Losses:       ${fmt(shortTermLosses)}`);
  console.log(`  Net Short-term Gain/Loss:        ${fmt(netShortTerm)}`);
  console.log();
  console.log(`  Long-term Capital Gains:         ${fmt(longTermGains)}`);
  console.log(`  Long-term Capital Losses:        ${fmt(longTermLosses)}`);
  console.log(`  Net Long-term Gain/Loss:         ${fmt(netLongTerm)}`);
  console.log();
  console.log(`  Total Taxable Gain/Loss:         ${fmt(totalTaxableGain)}`);
  console.log();
  console.log(`  Total Taxable Events:            ${records.length.toLocaleString()}`);
  console.log(`  Unique Assets:                   ${uniqueAssets.size}`);
  console.log();

  console.log('='.repeat(100));
  console.log(' BREAKDOWN BY HOLDING PERIOD');
  console.log('='.repeat(100));
  console.log();
  console.log(`  Short-term transactions:         ${shortTermRecords.length.toLocaleString()} (${(shortTermRecords.length / records.length * 100).toFixed(1)}%)`);
  console.log(`  Long-term transactions:          ${longTermRecords.length.toLocaleString()} (${(longTermRecords.length / records.length * 100).toFixed(1)}%)`);
  console.log();

  console.log('='.repeat(100));
  console.log(' TOP 10 ASSETS BY TRANSACTION COUNT');
  console.log('='.repeat(100));
  console.log();
  console.log('Asset          | Transactions | Total Gain/Loss | Proceeds      | Cost Basis    ');
  console.log('-'.repeat(100));
  topAssets.forEach(([asset, stats]) => {
    const assetPadded = asset.padEnd(14).substring(0, 14);
    const countPadded = stats.count.toLocaleString().padStart(12);
    const gainLossPadded = fmt(stats.totalGainLoss).padStart(15);
    const proceedsPadded = fmt(stats.proceeds).padStart(13);
    const costBasisPadded = fmt(stats.costBasis).padStart(13);
    console.log(`${assetPadded} | ${countPadded} | ${gainLossPadded} | ${proceedsPadded} | ${costBasisPadded}`);
  });
  console.log();

  console.log('='.repeat(100));
  console.log(' SAMPLE TAXABLE EVENTS (First 20)');
  console.log('='.repeat(100));
  console.log();
  console.log('Date Sold  | Asset      | Amount       | Proceeds   | Cost Basis | Gain/Loss  | Holding | Days');
  console.log('-'.repeat(100));
  records.slice(0, 20).forEach(r => {
    const dateSold = r.dateSold.split(' ')[0].substring(0, 10);
    const asset = r.asset.padEnd(10).substring(0, 10);
    const amount = r.amount.padStart(12).substring(0, 12);
    const proceeds = fmt(r.proceeds).padStart(10);
    const costBasis = fmt(r.costBasis).padStart(10);
    const gainLoss = fmt(r.gainLoss).padStart(10);
    const holding = r.saleType.includes('Long') ? 'long  ' : 'short ';
    const days = r.numDaysHeld.replace(' days', '').padStart(4);

    console.log(`${dateSold} | ${asset} | ${amount} | ${proceeds} | ${costBasis} | ${gainLoss} | ${holding} | ${days}`);
  });
  console.log();

  // Find largest gains and losses
  const sortedByGain = [...records].sort((a, b) => b.gainLoss - a.gainLoss);
  const topGains = sortedByGain.slice(0, 5);
  const topLosses = sortedByGain.slice(-5).reverse();

  console.log('='.repeat(100));
  console.log(' TOP 5 LARGEST GAINS');
  console.log('='.repeat(100));
  console.log();
  console.log('Date Sold  | Asset      | Amount       | Proceeds   | Cost Basis | Gain       | Holding');
  console.log('-'.repeat(100));
  topGains.forEach(r => {
    const dateSold = r.dateSold.split(' ')[0].substring(0, 10);
    const asset = r.asset.padEnd(10).substring(0, 10);
    const amount = r.amount.padStart(12).substring(0, 12);
    const proceeds = fmt(r.proceeds).padStart(10);
    const costBasis = fmt(r.costBasis).padStart(10);
    const gain = fmt(r.gainLoss).padStart(10);
    const holding = r.saleType.includes('Long') ? 'long  ' : 'short ';

    console.log(`${dateSold} | ${asset} | ${amount} | ${proceeds} | ${costBasis} | ${gain} | ${holding}`);
  });
  console.log();

  console.log('='.repeat(100));
  console.log(' TOP 5 LARGEST LOSSES');
  console.log('='.repeat(100));
  console.log();
  console.log('Date Sold  | Asset      | Amount       | Proceeds   | Cost Basis | Loss       | Holding');
  console.log('-'.repeat(100));
  topLosses.forEach(r => {
    const dateSold = r.dateSold.split(' ')[0].substring(0, 10);
    const asset = r.asset.padEnd(10).substring(0, 10);
    const amount = r.amount.padStart(12).substring(0, 12);
    const proceeds = fmt(r.proceeds).padStart(10);
    const costBasis = fmt(r.costBasis).padStart(10);
    const loss = fmt(r.gainLoss).padStart(10);
    const holding = r.saleType.includes('Long') ? 'long  ' : 'short ';

    console.log(`${dateSold} | ${asset} | ${amount} | ${proceeds} | ${costBasis} | ${loss} | ${holding}`);
  });
  console.log();

  console.log('='.repeat(100));
  console.log(' KEY STATISTICS');
  console.log('='.repeat(100));
  console.log();
  console.log(`  Total Proceeds:                  ${fmt(records.reduce((sum, r) => sum + r.proceeds, 0))}`);
  console.log(`  Total Cost Basis:                ${fmt(records.reduce((sum, r) => sum + r.costBasis, 0))}`);
  console.log(`  Average Gain/Loss per Event:     ${fmt(totalTaxableGain / records.length)}`);
  console.log(`  Median Gain/Loss:                ${fmt(sortedByGain[Math.floor(sortedByGain.length / 2)].gainLoss)}`);
  console.log();
  console.log(`  Winning Trades:                  ${records.filter(r => r.gainLoss > 0).length.toLocaleString()} (${(records.filter(r => r.gainLoss > 0).length / records.length * 100).toFixed(1)}%)`);
  console.log(`  Losing Trades:                   ${records.filter(r => r.gainLoss < 0).length.toLocaleString()} (${(records.filter(r => r.gainLoss < 0).length / records.length * 100).toFixed(1)}%)`);
  console.log(`  Break-even Trades:               ${records.filter(r => r.gainLoss === 0).length.toLocaleString()} (${(records.filter(r => r.gainLoss === 0).length / records.length * 100).toFixed(1)}%)`);
  console.log();

  console.log('='.repeat(100));
  console.log(' REPORT COMPLETE');
  console.log('='.repeat(100));
  console.log();
  console.log('NOTE: This CSV appears to be exported tax report data (already processed).');
  console.log('It contains pre-calculated cost basis and gain/loss amounts.');
  console.log();
  console.log('To test the tax calculator with raw transaction data:');
  console.log('  1. Import raw transactions from exchanges/wallets');
  console.log('  2. Run the tax calculator to calculate cost basis');
  console.log('  3. Compare results with this CSV for verification');
  console.log();
}

main().catch(console.error);
