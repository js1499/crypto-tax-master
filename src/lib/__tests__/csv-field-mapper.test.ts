import { describe, it, expect } from "vitest";
import {
  cleanNumber,
  cleanTimestamp,
  cleanType,
  cleanSymbol,
  suggestMapping,
  applyMapping,
  type CsvFieldMapping,
} from "../csv-field-mapper";

describe("cleanNumber", () => {
  it("strips currency symbols, commas, spaces", () => {
    expect(cleanNumber("$1,234.56")).toBeCloseTo(1234.56);
    expect(cleanNumber("1,000")).toBe(1000);
    expect(cleanNumber("12.5 ETH")).toBeCloseTo(12.5);
  });
  it("handles negatives (sign and accounting parentheses)", () => {
    expect(cleanNumber("-0.5")).toBeCloseTo(-0.5);
    expect(cleanNumber("(50)")).toBe(-50);
    expect(cleanNumber("+10")).toBe(10);
  });
  it("returns null for non-numbers, 0 for zero", () => {
    expect(cleanNumber("")).toBeNull();
    expect(cleanNumber("abc")).toBeNull();
    expect(cleanNumber(null)).toBeNull();
    expect(cleanNumber("0")).toBe(0);
  });
});

describe("cleanTimestamp", () => {
  it("strips a time component to date-only by default", () => {
    expect(cleanTimestamp("2025-03-14 09:31:00")!.getTime()).toBe(Date.UTC(2025, 2, 14));
    expect(cleanTimestamp("2025-03-14T09:31:00Z")!.getTime()).toBe(Date.UTC(2025, 2, 14));
  });
  it("auto-detects MDY vs DMY when unambiguous", () => {
    expect(cleanTimestamp("03/14/2025")!.getTime()).toBe(Date.UTC(2025, 2, 14)); // 14 -> day
    expect(cleanTimestamp("14/03/2025")!.getTime()).toBe(Date.UTC(2025, 2, 14)); // 14 -> day
  });
  it("respects an explicit format for ambiguous dates", () => {
    expect(cleanTimestamp("01/02/2025", null, { dateFormat: "MDY" })!.getTime()).toBe(Date.UTC(2025, 0, 2));
    expect(cleanTimestamp("01/02/2025", null, { dateFormat: "DMY" })!.getTime()).toBe(Date.UTC(2025, 1, 1));
  });
  it("parses unix epoch (seconds)", () => {
    expect(cleanTimestamp("1700000000")!.getTime()).toBe(Date.UTC(2023, 10, 14)); // 2023-11-14
  });
  it("keeps time when dateOnly:false (separate column or embedded, incl. AM/PM)", () => {
    expect(cleanTimestamp("2025-03-14", "09:31", { dateOnly: false })!.getTime()).toBe(Date.UTC(2025, 2, 14, 9, 31, 0));
    expect(cleanTimestamp("2025-03-14 9:31 PM", null, { dateOnly: false })!.getTime()).toBe(Date.UTC(2025, 2, 14, 21, 31, 0));
  });
  it("returns null for unparseable input", () => {
    expect(cleanTimestamp("not a date")).toBeNull();
    expect(cleanTimestamp("")).toBeNull();
  });
});

describe("cleanType", () => {
  it("maps raw type values to canonical engine types via getCategory", () => {
    expect(cleanType("BUY")).toBe("buy");
    expect(cleanType("sell")).toBe("sell");
    expect(cleanType("token swap")).toBe("token swap"); // swap
    expect(cleanType("staking_reward")).toBe("reward"); // income
    expect(cleanType("Receive")).toBe("transfer");
    expect(cleanType("totally unknown")).toBe("UNKNOWN");
  });
  it("honors an explicit value->category mapping", () => {
    expect(cleanType("Disposal", { Disposal: "sell" })).toBe("sell");
    expect(cleanType("Yield", { Yield: "income" })).toBe("reward");
  });
});

describe("suggestMapping", () => {
  it("auto-maps common headers", () => {
    const m = suggestMapping(["Timestamp", "Currency", "Quantity", "Transaction Type", "USD Value", "Fee"]);
    expect(m.columns).toMatchObject({ timestamp: 0, symbol: 1, quantity: 2, type: 3, value: 4, fee: 5 });
  });

  it("auto-maps a net-gain column to gainLoss (not value)", () => {
    const m = suggestMapping(["Date", "Asset", "Quantity", "Type", "Net Gain"]);
    expect(m.columns.gainLoss).toBe(4);
  });
});

describe("applyMapping", () => {
  it("cleans every field and skips invalid rows", () => {
    const csv = [
      ["Date", "Asset", "Qty", "Side", "USD"],
      ["2025-03-14 09:31:00", "BTC", "0.5", "SELL", "$25,000.00"],
      ["03/15/2025", "eth", "2", "BUY", "4,000"],
      ["2025-03-16", "", "1", "SELL", "100"], // missing symbol -> skipped
    ];
    const mapping: CsvFieldMapping = {
      columns: { timestamp: 0, symbol: 1, quantity: 2, type: 3, value: 4 },
      options: { dateFormat: "auto", dateOnly: true },
    };
    const { transactions, skipped } = applyMapping(csv, mapping);
    expect(transactions).toHaveLength(2);

    expect(transactions[0].asset_symbol).toBe("BTC");
    expect(transactions[0].amount_value.toNumber()).toBeCloseTo(0.5);
    expect(transactions[0].value_usd.toNumber()).toBeCloseTo(25000);
    expect(transactions[0].type).toBe("sell");
    expect(transactions[0].tx_timestamp.getTime()).toBe(Date.UTC(2025, 2, 14)); // time stripped

    expect(transactions[1].asset_symbol).toBe("ETH"); // upper-cased
    expect(transactions[1].type).toBe("buy");
    expect(transactions[1].tx_timestamp.getTime()).toBe(Date.UTC(2025, 2, 15));

    expect(skipped).toHaveLength(1);
    expect(skipped[0].reason).toMatch(/symbol/);
  });

  it("derives buy/sell from the sign of a net column when no type is mapped", () => {
    const csv = [
      ["Date", "Asset", "Net Qty", "USD"],
      ["2025-01-01", "SOL", "-3", "450"],
      ["2025-01-02", "SOL", "5", "600"],
    ];
    const mapping: CsvFieldMapping = {
      columns: { timestamp: 0, symbol: 1, quantity: 2, value: 3 },
      options: { deriveTypeFromSign: true },
    };
    const { transactions } = applyMapping(csv, mapping);
    expect(transactions[0].type).toBe("sell"); // negative
    expect(transactions[0].amount_value.toNumber()).toBeCloseTo(3); // stored absolute
    expect(transactions[1].type).toBe("buy"); // positive
  });

  it("maps a net gain/loss column to gain_loss_usd (signed, CSV import P&L)", () => {
    const csv = [
      ["Date", "Asset", "Qty", "Side", "Net Gain"],
      ["2025-03-14", "BTC", "0.5", "SELL", "1,234.56"],
      ["2025-04-01", "ETH", "2", "SELL", "(300)"], // accounting-negative = loss
    ];
    const mapping: CsvFieldMapping = {
      columns: { timestamp: 0, symbol: 1, quantity: 2, type: 3, gainLoss: 4 },
      options: {},
    };
    const { transactions } = applyMapping(csv, mapping);
    expect(transactions[0].gain_loss_usd?.toNumber()).toBeCloseTo(1234.56);
    expect(transactions[1].gain_loss_usd?.toNumber()).toBeCloseTo(-300); // loss kept negative
  });
});
