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

let unclassified = 0;
let unclassifiedGainLoss = 0;

console.log('Looking for records not classified as short-term or long-term:\n');

for (let i = 1; i < lines.length; i++) {
  const fields = parseCsvLine(lines[i]);
  if (fields.length < 12) continue;

  const proceeds = parseAmount(fields[10]);
  const costBasis = parseAmount(fields[11]);
  const gainLoss = proceeds - costBasis;
  const saleType = fields[3].toLowerCase();

  if (!saleType.includes('short') && !saleType.includes('long')) {
    unclassified++;
    unclassifiedGainLoss += gainLoss;
    if (unclassified <= 10) {
      console.log(`Row ${i}: Sale Type="${fields[3]}", Gain/Loss=$${gainLoss.toFixed(2)}`);
    }
  }
}

console.log();
console.log(`Total unclassified records: ${unclassified}`);
console.log(`Total unclassified gain/loss: $${unclassifiedGainLoss.toFixed(2)}`);
console.log();
console.log(`This accounts for $${unclassifiedGainLoss.toFixed(2)} of the $134,563.00 discrepancy`);
