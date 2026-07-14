import { describe, it, expect } from "vitest";
import { clampVarchar, clampTxStrings, TX_VARCHAR_LIMITS } from "../tx-column-limits";

describe("clampVarchar", () => {
  it("leaves strings within the cap untouched", () => {
    expect(clampVarchar("BTC", 50)).toBe("BTC");
    expect(clampVarchar("", 50)).toBe("");
    expect(clampVarchar("X".repeat(50), 50)).toBe("X".repeat(50));
  });

  it("truncates to the cap (by character count)", () => {
    expect(clampVarchar("X".repeat(80), 50)).toBe("X".repeat(50));
    expect(clampVarchar("X".repeat(80), 50)).toHaveLength(50);
  });

  it("never splits a surrogate pair (astral chars count as one code point)", () => {
    // 30 emoji = 30 code points but 60 UTF-16 units. A cap of 50 keeps all 30 unchanged...
    const emoji = "😀".repeat(30);
    expect(Array.from(clampVarchar(emoji, 50))).toHaveLength(30);
    // ...and a cap below the count truncates cleanly on a code-point boundary (no half-emoji,
    // which Postgres would otherwise reject as invalid UTF-8).
    const out = clampVarchar(emoji, 10);
    expect(Array.from(out)).toHaveLength(10);
    expect(out).toBe("😀".repeat(10));
  });
});

describe("clampTxStrings", () => {
  it("clamps known VarChar columns in place, counts them, and ignores non-strings/unknown keys", () => {
    const row = {
      asset_symbol: "S".repeat(80), // -> 50
      type: "buy", // within cap: unchanged
      subtype: "T".repeat(60), // -> 50
      value_usd: 12345, // non-string: ignored
      is_income: false, // non-string: ignored
      unknown_field: "Z".repeat(300), // not a Transaction VarChar: ignored
    };
    const stats = { clamped: 0 };
    const returned = clampTxStrings(row, stats);

    expect(returned).toBe(row); // mutates and returns the same object
    expect(row.asset_symbol).toHaveLength(50);
    expect(row.subtype).toHaveLength(50);
    expect(row.type).toBe("buy");
    expect(row.value_usd).toBe(12345);
    expect(row.is_income).toBe(false);
    expect(row.unknown_field).toHaveLength(300);
    expect(stats.clamped).toBe(2);
  });

  it("is a no-op (clamped=0) when every field already fits", () => {
    const row = { asset_symbol: "BTC", type: "sell", source: "coinbase.csv" };
    const stats = { clamped: 0 };
    clampTxStrings(row, stats);
    expect(stats.clamped).toBe(0);
    expect(row).toEqual({ asset_symbol: "BTC", type: "sell", source: "coinbase.csv" });
  });

  it("defines a cap for every high-risk externally-sourced Transaction VarChar column", () => {
    expect(TX_VARCHAR_LIMITS.asset_symbol).toBe(50);
    expect(TX_VARCHAR_LIMITS.incoming_asset_symbol).toBe(50);
    expect(TX_VARCHAR_LIMITS.subtype).toBe(50);
    expect(TX_VARCHAR_LIMITS.type).toBe(50);
    expect(TX_VARCHAR_LIMITS.source).toBe(100);
  });
});
