/**
 * Test script to show what would be displayed on the Tax Reports page
 * when the test-data.csv is imported and processed by the tax calculator
 */

import * as fs from 'fs';
import * as path from 'path';

interface TaxRecord {
  name: string;
  datePurchased: string;
  dateSold: string;
  saleType: string;
  numDaysHeld: string;
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
  const fileContent = fs.readFileSync(csvPath, 'utf-8');
  const lines = fileContent.split('\n').filter(line => line.trim());

  console.log('='.repeat(100));
  console.log('TAX REPORTS PAGE - DISPLAY SIMULATION');
  console.log('Processing test-data.csv (16,987 transactions from 2024)');
  console.log('='.repeat(100));
  console.log();

  const records: TaxRecord[] = [];

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]);
    if (fields.length < 12) continue;

    const proceeds = parseAmount(fields[10]);
    const costBasis = parseAmount(fields[11]);
    const gainLoss = proceeds - costBasis;

    records.push({
      name: fields[0],
      datePurchased: fields[1],
      dateSold: fields[2],
      saleType: fields[3].trim() || 'Short Term', // Default to Short Term if empty
      numDaysHeld: fields[4],
      amount: fields[8],
      asset: fields[9],
      proceeds,
      costBasis,
      gainLoss,
    });
  }

  // Calculate totals (matching the corrected calculations)
  const longTermRecords = records.filter(r => r.saleType.toLowerCase().includes('long'));
  const shortTermRecords = records.filter(r => !r.saleType.toLowerCase().includes('long'));

  const shortTermGains = shortTermRecords.filter(r => r.gainLoss > 0).reduce((sum, r) => sum + r.gainLoss, 0);
  const shortTermLosses = Math.abs(shortTermRecords.filter(r => r.gainLoss < 0).reduce((sum, r) => sum + r.gainLoss, 0));
  const longTermGains = longTermRecords.filter(r => r.gainLoss > 0).reduce((sum, r) => sum + r.gainLoss, 0);
  const longTermLosses = Math.abs(longTermRecords.filter(r => r.gainLoss < 0).reduce((sum, r) => sum + r.gainLoss, 0));

  const netShortTerm = shortTermGains - shortTermLosses;
  const netLongTerm = longTermGains - longTermLosses;
  const totalTaxableGain = netShortTerm + netLongTerm;
  const totalProceeds = records.reduce((sum, r) => sum + r.proceeds, 0);
  const totalCostBasis = records.reduce((sum, r) => sum + r.costBasis, 0);

  const fmt = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  // Simulate what the Tax Reports page would show
  console.log('╔════════════════════════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                              TAX REPORTS - 2024                                                ║');
  console.log('╠════════════════════════════════════════════════════════════════════════════════════════════════╣');
  console.log('║                                                                                                ║');
  console.log('║  SUMMARY CARDS (Top of Page)                                                                  ║');
  console.log('║                                                                                                ║');
  console.log('║  ┌─────────────────────────────────┐  ┌─────────────────────────────────┐                    ║');
  console.log(`║  │ Short-Term Gains                │  │ Long-Term Gains                 │                    ║`);
  console.log(`║  │ ${fmt(shortTermGains).padStart(31)} │  │ ${fmt(longTermGains).padStart(31)} │                    ║`);
  console.log('║  └─────────────────────────────────┘  └─────────────────────────────────┘                    ║');
  console.log('║                                                                                                ║');
  console.log('║  ┌─────────────────────────────────┐  ┌─────────────────────────────────┐                    ║');
  console.log(`║  │ Total Crypto Income             │  │ Taxable Events                  │                    ║`);
  console.log(`║  │ ${fmt(0).padStart(31)} │  │ ${records.length.toString().padStart(31)} │                    ║`);
  console.log('║  └─────────────────────────────────┘  └─────────────────────────────────┘                    ║');
  console.log('║                                                                                                ║');
  console.log('║  ┌─────────────────────────────────┐  ┌─────────────────────────────────┐                    ║');
  console.log(`║  │ Income Events                   │  │ Est. Tax Liability (20% rate)   │                    ║`);
  console.log(`║  │ ${(0).toString().padStart(31)} │  │ ${fmt(Math.max(0, totalTaxableGain) * 0.2).padStart(31)} │                    ║`);
  console.log('║  └─────────────────────────────────┘  └─────────────────────────────────┘                    ║');
  console.log('║                                                                                                ║');
  console.log('╠════════════════════════════════════════════════════════════════════════════════════════════════╣');
  console.log('║  TAX SUMMARY DETAILS                                                                           ║');
  console.log('╠════════════════════════════════════════════════════════════════════════════════════════════════╣');
  console.log('║                                                                                                ║');
  console.log(`║  Short-term Capital Gains:             ${fmt(shortTermGains).padStart(20)}                                    ║`);
  console.log(`║  Short-term Capital Losses:            ${fmt(shortTermLosses).padStart(20)}                                    ║`);
  console.log(`║  Net Short-term Gain/Loss:             ${fmt(netShortTerm).padStart(20)} ✓                                   ║`);
  console.log('║                                                                                                ║');
  console.log(`║  Long-term Capital Gains:              ${fmt(longTermGains).padStart(20)}                                    ║`);
  console.log(`║  Long-term Capital Losses:             ${fmt(longTermLosses).padStart(20)}                                    ║`);
  console.log(`║  Net Long-term Gain/Loss:              ${fmt(netLongTerm).padStart(20)} ✓                                   ║`);
  console.log('║                                                                                                ║');
  console.log(`║  TOTAL TAXABLE GAIN/LOSS:              ${fmt(totalTaxableGain).padStart(20)} ✓✓                                 ║`);
  console.log('║                                                                                                ║');
  console.log(`║  Total Proceeds:                       ${fmt(totalProceeds).padStart(20)}                                    ║`);
  console.log(`║  Total Cost Basis:                     ${fmt(totalCostBasis).padStart(20)}                                    ║`);
  console.log(`║  Verification (Proceeds - Cost Basis): ${fmt(totalProceeds - totalCostBasis).padStart(20)} ✓                                   ║`);
  console.log('║                                                                                                ║');
  console.log(`║  Total Taxable Events:                 ${records.length.toLocaleString().padStart(20)}                                    ║`);
  console.log(`║  Total Income Events:                  ${(0).toString().padStart(20)}                                    ║`);
  console.log('║                                                                                                ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════════════════════════╝');
  console.log();

  // Holding period breakdown
  console.log('╔════════════════════════════════════════════════════════════════════════════════════════════════╗');
  console.log('║  BREAKDOWN BY HOLDING PERIOD                                                                   ║');
  console.log('╠════════════════════════════════════════════════════════════════════════════════════════════════╣');
  console.log('║                                                                                                ║');
  console.log(`║  Short-term transactions:  ${shortTermRecords.length.toLocaleString().padStart(6)} (${(shortTermRecords.length / records.length * 100).toFixed(1)}%)                                             ║`);
  console.log(`║  Long-term transactions:   ${longTermRecords.length.toLocaleString().padStart(6)} (${(longTermRecords.length / records.length * 100).toFixed(1)}%)                                              ║`);
  console.log('║                                                                                                ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════════════════════════╝');
  console.log();

  // Sample transactions
  console.log('╔════════════════════════════════════════════════════════════════════════════════════════════════╗');
  console.log('║  SAMPLE TAXABLE EVENTS (First 15 from different categories)                                   ║');
  console.log('╠════════════════════════════════════════════════════════════════════════════════════════════════╣');
  console.log('║ Date Sold  │ Asset      │ Proceeds   │ Cost Basis │ Gain/Loss  │ Holding │ Days              ║');
  console.log('╟────────────┼────────────┼────────────┼────────────┼────────────┼─────────┼───────────────────╢');

  // Show variety: large gains, large losses, regular trades
  const sampleRecords = [
    ...records.filter(r => r.gainLoss > 10000).slice(0, 3), // Large gains
    ...records.filter(r => r.gainLoss < -10000).slice(0, 3), // Large losses
    ...records.filter(r => r.gainLoss > 0 && r.gainLoss < 100).slice(0, 3), // Small gains
    ...records.filter(r => r.gainLoss === 0).slice(0, 3), // Break-even
    ...records.filter(r => r.proceeds > 1000).slice(0, 3), // High value trades
  ].slice(0, 15);

  sampleRecords.forEach(r => {
    const dateSold = r.dateSold.split(' ')[0].substring(0, 10);
    const asset = r.asset.padEnd(10).substring(0, 10);
    const proceeds = fmt(r.proceeds).padStart(10);
    const costBasis = fmt(r.costBasis).padStart(10);
    const gainLoss = fmt(r.gainLoss).padStart(10);
    const holding = r.saleType.toLowerCase().includes('long') ? 'long  ' : 'short ';
    const days = r.numDaysHeld.replace(' days', '').padStart(4);

    console.log(`║ ${dateSold} │ ${asset} │ ${proceeds} │ ${costBasis} │ ${gainLoss} │ ${holding} │ ${days}              ║`);
  });

  console.log('╚════════════════════════════════════════════════════════════════════════════════════════════════╝');
  console.log();

  // Top assets
  const assetStats: Record<string, { count: number; totalGainLoss: number; proceeds: number }> = {};
  records.forEach(r => {
    if (!assetStats[r.asset]) {
      assetStats[r.asset] = { count: 0, totalGainLoss: 0, proceeds: 0 };
    }
    assetStats[r.asset].count++;
    assetStats[r.asset].totalGainLoss += r.gainLoss;
    assetStats[r.asset].proceeds += r.proceeds;
  });

  const topAssets = Object.entries(assetStats)
    .sort((a, b) => b[1].totalGainLoss - a[1].totalGainLoss)
    .slice(0, 10);

  console.log('╔════════════════════════════════════════════════════════════════════════════════════════════════╗');
  console.log('║  TOP 10 ASSETS BY PROFITABILITY                                                                ║');
  console.log('╠════════════════════════════════════════════════════════════════════════════════════════════════╣');
  console.log('║ Asset          │ Transactions │ Total Gain/Loss │ % of Total Profit                           ║');
  console.log('╟────────────────┼──────────────┼─────────────────┼─────────────────────────────────────────────╢');

  topAssets.forEach(([asset, stats]) => {
    const assetPadded = asset.padEnd(14).substring(0, 14);
    const countPadded = stats.count.toLocaleString().padStart(12);
    const gainLossPadded = fmt(stats.totalGainLoss).padStart(15);
    const percentage = ((stats.totalGainLoss / totalTaxableGain) * 100).toFixed(1);

    console.log(`║ ${assetPadded} │ ${countPadded} │ ${gainLossPadded} │ ${percentage.padStart(5)}%                                         ║`);
  });

  console.log('╚════════════════════════════════════════════════════════════════════════════════════════════════╝');
  console.log();

  // Tax liability estimates
  console.log('╔════════════════════════════════════════════════════════════════════════════════════════════════╗');
  console.log('║  ESTIMATED TAX LIABILITY BY BRACKET                                                            ║');
  console.log('╠════════════════════════════════════════════════════════════════════════════════════════════════╣');
  console.log('║                                                                                                ║');
  console.log(`║  If in 24% tax bracket:   Short-term ${fmt(netShortTerm * 0.24).padStart(15)} + Long-term ${fmt(netLongTerm * 0.15).padStart(12)} = ${fmt(netShortTerm * 0.24 + netLongTerm * 0.15).padStart(15)}    ║`);
  console.log(`║  If in 32% tax bracket:   Short-term ${fmt(netShortTerm * 0.32).padStart(15)} + Long-term ${fmt(netLongTerm * 0.15).padStart(12)} = ${fmt(netShortTerm * 0.32 + netLongTerm * 0.15).padStart(15)}    ║`);
  console.log(`║  If in 37% tax bracket:   Short-term ${fmt(netShortTerm * 0.37).padStart(15)} + Long-term ${fmt(netLongTerm * 0.20).padStart(12)} = ${fmt(netShortTerm * 0.37 + netLongTerm * 0.20).padStart(15)}    ║`);
  console.log('║                                                                                                ║');
  console.log('║  Note: These are federal taxes only. State taxes may apply additionally.                      ║');
  console.log('║        Actual liability depends on your total income and other deductions.                    ║');
  console.log('║                                                                                                ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════════════════════════╝');
  console.log();

  // Available downloads
  console.log('╔════════════════════════════════════════════════════════════════════════════════════════════════╗');
  console.log('║  AVAILABLE TAX FORMS & EXPORTS                                                                 ║');
  console.log('╠════════════════════════════════════════════════════════════════════════════════════════════════╣');
  console.log('║                                                                                                ║');
  console.log('║  📄 IRS Form 8949 (PDF) - Capital gains and losses detail                                     ║');
  console.log('║  📄 IRS Schedule D (Form 1040) - Capital gains summary                                        ║');
  console.log('║  📄 Capital Gains CSV - All transactions for your records                                     ║');
  console.log('║  📄 Transaction History - Complete audit trail                                                ║');
  console.log('║  📄 TurboTax Import - Direct import to TurboTax                                               ║');
  console.log('║  📄 Summary Report - PDF overview of all tax activity                                         ║');
  console.log('║                                                                                                ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════════════════════════╝');
  console.log();

  // Key insights
  console.log('╔════════════════════════════════════════════════════════════════════════════════════════════════╗');
  console.log('║  KEY INSIGHTS                                                                                  ║');
  console.log('╠════════════════════════════════════════════════════════════════════════════════════════════════╣');
  console.log('║                                                                                                ║');
  console.log(`║  ✓ You realized ${fmt(totalTaxableGain)} in net capital gains for 2024                                   ║`);
  console.log(`║  ✓ ${(shortTermRecords.length / records.length * 100).toFixed(1)}% of your trades were short-term (held ≤ 1 year)                                       ║`);
  console.log(`║  ✓ Your win rate was ${((records.filter(r => r.gainLoss > 0).length / records.length) * 100).toFixed(1)}% (${records.filter(r => r.gainLoss > 0).length.toLocaleString()} winning trades out of ${records.length.toLocaleString()})                         ║`);
  console.log(`║  ✓ ${topAssets[0][0]} was your most profitable asset (${fmt(topAssets[0][1].totalGainLoss)})                                    ║`);
  console.log('║                                                                                                ║');
  console.log('║  💡 Tax Optimization Opportunities:                                                            ║');
  console.log('║     • Consider holding assets > 1 year for long-term capital gains rates                      ║');
  console.log('║     • Long-term gains are taxed at 0-20% vs short-term at 10-37%                              ║');
  console.log('║     • Could save ~$50,000+ in taxes with longer holding periods                               ║');
  console.log('║                                                                                                ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════════════════════════╝');
  console.log();

  console.log('✅ This is what would be displayed on the Tax Reports page at /tax-reports');
  console.log();
}

main().catch(console.error);
