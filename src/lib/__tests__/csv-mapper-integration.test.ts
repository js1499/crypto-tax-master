import { describe, it, expect } from "vitest";
import { parseCSV } from "../csv-parser";
import { suggestMapping, applyMapping } from "../csv-field-mapper";

// End-to-end of the API pipeline (what /preview + /mapped do, minus auth/DB):
// raw CSV text -> parseCSV -> suggestMapping -> applyMapping.
describe("CSV mapper pipeline (integration)", () => {
  it("auto-maps a typical export, cleans values, skips a bad row", () => {
    const raw = [
      "Date,Asset,Amount,Type,Proceeds (USD),Fee",
      '2025-03-14 09:31:00,BTC,0.5,Sell,"$25,000.00",12.50',
      "2025-03-15T14:00:00Z,ETH,2,Buy,\"4,000.00\",5",
      "2025-04-01,SOL,100,Staking Reward,650,",
      "2025-04-02,,1,Sell,100,", // missing asset -> skipped
    ].join("\n");

    const rows = parseCSV(raw);
    const mapping = suggestMapping(rows[0]);
    // Sanity: the auto-suggester found the key columns.
    expect(mapping.columns).toMatchObject({ timestamp: 0, symbol: 1, quantity: 2, type: 3, value: 4, fee: 5 });

    const { transactions, skipped } = applyMapping(rows, mapping);
    expect(transactions).toHaveLength(3);
    expect(skipped).toHaveLength(1);

    const btc = transactions[0];
    expect(btc.asset_symbol).toBe("BTC");
    expect(btc.amount_value.toNumber()).toBeCloseTo(0.5);
    expect(btc.value_usd.toNumber()).toBeCloseTo(25000); // quoted comma + $ cleaned
    expect(btc.fee_usd!.toNumber()).toBeCloseTo(12.5);
    expect(btc.type).toBe("sell");
    expect(btc.tx_timestamp.getTime()).toBe(Date.UTC(2025, 2, 14)); // datetime -> date-only

    expect(transactions[1].asset_symbol).toBe("ETH");
    expect(transactions[1].type).toBe("buy");
    expect(transactions[1].value_usd.toNumber()).toBeCloseTo(4000);

    expect(transactions[2].asset_symbol).toBe("SOL");
    expect(transactions[2].type).toBe("reward"); // "Staking Reward" -> income
  });

  it("handles a net-signed single column with no type column", () => {
    const raw = [
      "Date,Asset,Net Amount,USD",
      "2025-01-01,SOL,-3,450",
      "2025-01-02,SOL,5,600",
    ].join("\n");
    const rows = parseCSV(raw);
    const base = suggestMapping(rows[0]);
    const mapping = { ...base, options: { ...base.options, deriveTypeFromSign: true } };
    const { transactions } = applyMapping(rows, mapping);
    expect(transactions[0].type).toBe("sell"); // negative net
    expect(transactions[0].amount_value.toNumber()).toBeCloseTo(3);
    expect(transactions[1].type).toBe("buy"); // positive net
  });
});
