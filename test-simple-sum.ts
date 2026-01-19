import * as fs from 'fs';
import * as path from 'path';

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

const csvPath = path.join(__dirname, 'test-data', 'test-data.csv');
const fileContent = fs.readFileSync(csvPath, 'utf-8');
const lines = fileContent.split('\n').filter(line => line.trim());

console.log('Testing different calculation methods...\n');

let totalProceeds = 0;
let totalCostBasis = 0;
let totalGainLossDirect = 0;

let shortTermGains = 0;
let shortTermLosses = 0;
let longTermGains = 0;
let longTermLosses = 0;

let recordsProcessed = 0;

for (let i = 1; i < lines.length; i++) {
  const fields = parseCsvLine(lines[i]);
  if (fields.length < 12) continue;

  const proceeds = parseAmount(fields[10]);
  const costBasis = parseAmount(fields[11]);
  const gainLoss = proceeds - costBasis;
  const saleType = fields[3];

  totalProceeds += proceeds;
  totalCostBasis += costBasis;
  totalGainLossDirect += gainLoss;

  if (saleType.toLowerCase().includes('short')) {
    if (gainLoss > 0) {
      shortTermGains += gainLoss;
    } else {
      shortTermLosses += Math.abs(gainLoss);
    }
  } else if (saleType.toLowerCase().includes('long')) {
    if (gainLoss > 0) {
      longTermGains += gainLoss;
    } else {
      longTermLosses += Math.abs(gainLoss);
    }
  }

  recordsProcessed++;
}

const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

console.log('METHOD 1: Simple Sum');
console.log('  Total Proceeds:     $' + fmt(totalProceeds));
console.log('  Total Cost Basis:   $' + fmt(totalCostBasis));
console.log('  Direct Profit:      $' + fmt(totalGainLossDirect));
console.log();

console.log('METHOD 2: Gains/Losses by Holding Period');
console.log('  Short-term Gains:   $' + fmt(shortTermGains));
console.log('  Short-term Losses:  $' + fmt(shortTermLosses));
console.log('  Net Short-term:     $' + fmt(shortTermGains - shortTermLosses));
console.log();
console.log('  Long-term Gains:    $' + fmt(longTermGains));
console.log('  Long-term Losses:   $' + fmt(longTermLosses));
console.log('  Net Long-term:      $' + fmt(longTermGains - longTermLosses));
console.log();
console.log('  Total (Method 2):   $' + fmt(shortTermGains - shortTermLosses + longTermGains - longTermLosses));
console.log();

console.log('COMPARISON:');
console.log('  Method 1 (Correct): $' + fmt(totalGainLossDirect));
console.log('  Method 2 (Current): $' + fmt(shortTermGains - shortTermLosses + longTermGains - longTermLosses));
console.log('  Difference:         $' + fmt((shortTermGains - shortTermLosses + longTermGains - longTermLosses) - totalGainLossDirect));
console.log();

console.log('Records processed: ' + recordsProcessed);
