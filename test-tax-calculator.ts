import { PrismaClient } from '@prisma/client';
import { calculateTaxReport } from './src/lib/tax-calculator';

const prisma = new PrismaClient();

async function main() {
  console.log('='.repeat(80));
  console.log('TAX CALCULATOR TEST - WHAT WOULD BE DISPLAYED ON TAX REPORTS PAGE');
  console.log('='.repeat(80));
  console.log();

  // Test year 2023 (seed data)
  const year = 2023;
  const method = 'FIFO';

  console.log(`Testing tax report for year: ${year}`);
  console.log(`Calculation method: ${method}`);
  console.log();

  // Get all unique wallet addresses from transactions
  const transactions = await prisma.transaction.findMany({
    where: {
      tx_timestamp: {
        gte: new Date(`${year}-01-01`),
        lte: new Date(`${year}-12-31T23:59:59`),
      },
    },
    select: {
      wallet_address: true,
    },
    distinct: ['wallet_address'],
  });

  const walletAddresses = transactions
    .map(t => t.wallet_address)
    .filter((addr): addr is string => addr !== null);

  console.log(`Found ${walletAddresses.length} unique wallet addresses`);
  console.log();

  // Calculate tax report
  console.log('Running tax calculator...');
  console.log();

  const report = await calculateTaxReport(
    prisma,
    walletAddresses,
    year,
    method
  );

  // Format the output as it would appear on the Tax Reports page
  console.log('='.repeat(80));
  console.log('TAX REPORTS PAGE - SUMMARY CARDS');
  console.log('='.repeat(80));
  console.log();

  // Helper function to format currency
  const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  // Calculate totals
  const shortTermGains = report.taxableEvents
    .filter(e => e.holdingPeriod === 'short' && e.gainLoss > 0)
    .reduce((sum, e) => sum + e.gainLoss, 0);

  const longTermGains = report.taxableEvents
    .filter(e => e.holdingPeriod === 'long' && e.gainLoss > 0)
    .reduce((sum, e) => sum + e.gainLoss, 0);

  const shortTermLosses = Math.abs(
    report.taxableEvents
      .filter(e => e.holdingPeriod === 'short' && e.gainLoss < 0)
      .reduce((sum, e) => sum + e.gainLoss, 0)
  );

  const longTermLosses = Math.abs(
    report.taxableEvents
      .filter(e => e.holdingPeriod === 'long' && e.gainLoss < 0)
      .reduce((sum, e) => sum + e.gainLoss, 0)
  );

  const totalIncome = report.incomeEvents.reduce((sum, e) => sum + e.value, 0);

  const netShortTermGain = shortTermGains - shortTermLosses;
  const netLongTermGain = longTermGains - longTermLosses;
  const totalTaxableGain = netShortTermGain + netLongTermGain;

  console.log('┌─────────────────────────────────┬──────────────────────┐');
  console.log('│ Short-Term Gains                │ ' + formatCurrency(shortTermGains).padStart(20) + ' │');
  console.log('├─────────────────────────────────┼──────────────────────┤');
  console.log('│ Long-Term Gains                 │ ' + formatCurrency(longTermGains).padStart(20) + ' │');
  console.log('├─────────────────────────────────┼──────────────────────┤');
  console.log('│ Total Crypto Income             │ ' + formatCurrency(totalIncome).padStart(20) + ' │');
  console.log('├─────────────────────────────────┼──────────────────────┤');
  console.log('│ Taxable Events                  │ ' + report.taxableEvents.length.toString().padStart(20) + ' │');
  console.log('├─────────────────────────────────┼──────────────────────┤');
  console.log('│ Income Events                   │ ' + report.incomeEvents.length.toString().padStart(20) + ' │');
  console.log('├─────────────────────────────────┼──────────────────────┤');
  console.log('│ Est. Tax Liability (20% rate)   │ ' + formatCurrency(totalTaxableGain * 0.2).padStart(20) + ' │');
  console.log('└─────────────────────────────────┴──────────────────────┘');
  console.log();

  console.log('='.repeat(80));
  console.log('TAX SUMMARY DETAILS');
  console.log('='.repeat(80));
  console.log();
  console.log(`Short-term Capital Gains:        ${formatCurrency(shortTermGains)}`);
  console.log(`Short-term Capital Losses:       ${formatCurrency(shortTermLosses)}`);
  console.log(`Net Short-term Gain/Loss:        ${formatCurrency(netShortTermGain)}`);
  console.log();
  console.log(`Long-term Capital Gains:         ${formatCurrency(longTermGains)}`);
  console.log(`Long-term Capital Losses:        ${formatCurrency(longTermLosses)}`);
  console.log(`Net Long-term Gain/Loss:         ${formatCurrency(netLongTermGain)}`);
  console.log();
  console.log(`Total Taxable Gain/Loss:         ${formatCurrency(totalTaxableGain)}`);
  console.log(`Total Income:                    ${formatCurrency(totalIncome)}`);
  console.log();
  console.log(`Total Taxable Events:            ${report.taxableEvents.length}`);
  console.log(`Total Income Events:             ${report.incomeEvents.length}`);
  console.log();

  // Show sample taxable events
  console.log('='.repeat(80));
  console.log('SAMPLE TAXABLE EVENTS (First 10)');
  console.log('='.repeat(80));
  console.log();

  const sampleEvents = report.taxableEvents.slice(0, 10);
  if (sampleEvents.length > 0) {
    console.log('Date       | Asset      | Amount    | Proceeds  | Cost Basis | Gain/Loss | Holding ');
    console.log('-'.repeat(80));
    sampleEvents.forEach(event => {
      const date = event.date.toISOString().split('T')[0];
      const asset = event.asset.padEnd(10).substring(0, 10);
      const amount = event.amount.toFixed(4).padStart(9);
      const proceeds = formatCurrency(event.proceeds).padStart(9);
      const costBasis = formatCurrency(event.costBasis).padStart(10);
      const gainLoss = formatCurrency(event.gainLoss).padStart(9);
      const holding = event.holdingPeriod.padEnd(7);

      console.log(`${date} | ${asset} | ${amount} | ${proceeds} | ${costBasis} | ${gainLoss} | ${holding}`);
    });
  } else {
    console.log('No taxable events found.');
  }
  console.log();

  // Show sample income events
  console.log('='.repeat(80));
  console.log('SAMPLE INCOME EVENTS (First 10)');
  console.log('='.repeat(80));
  console.log();

  const sampleIncome = report.incomeEvents.slice(0, 10);
  if (sampleIncome.length > 0) {
    console.log('Date       | Asset      | Amount    | Value     | Type    ');
    console.log('-'.repeat(80));
    sampleIncome.forEach(event => {
      const date = event.date.toISOString().split('T')[0];
      const asset = event.asset.padEnd(10).substring(0, 10);
      const amount = event.amount.toFixed(4).padStart(9);
      const value = formatCurrency(event.value).padStart(9);
      const type = event.type.padEnd(10);

      console.log(`${date} | ${asset} | ${amount} | ${value} | ${type}`);
    });
  } else {
    console.log('No income events found.');
  }
  console.log();

  // Show wash sales if any
  const washSales = report.taxableEvents.filter(e => e.washSale);
  if (washSales.length > 0) {
    console.log('='.repeat(80));
    console.log(`WASH SALES DETECTED: ${washSales.length}`);
    console.log('='.repeat(80));
    console.log();
    console.log('Date       | Asset      | Loss      | Disallowed | Status');
    console.log('-'.repeat(80));
    washSales.slice(0, 10).forEach(event => {
      const date = event.date.toISOString().split('T')[0];
      const asset = event.asset.padEnd(10).substring(0, 10);
      const loss = formatCurrency(event.gainLoss).padStart(9);
      const disallowed = formatCurrency(event.washSaleAdjustment || 0).padStart(10);

      console.log(`${date} | ${asset} | ${loss} | ${disallowed} | Disallowed`);
    });
    console.log();
  }

  console.log('='.repeat(80));
  console.log('REPORT COMPLETE');
  console.log('='.repeat(80));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
