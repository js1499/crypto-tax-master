import { describe, it, expect } from "vitest";
import { getCategory } from "../transaction-categorizer";

describe("getCategory normalization", () => {
  it("is case-insensitive for common types", () => {
    for (const t of ["buy", "Buy", "BUY", "bUy"]) expect(getCategory(t)).toBe("buy");
    for (const t of ["sell", "Sell", "SELL"]) expect(getCategory(t)).toBe("sell");
    for (const t of ["swap", "Swap", "SWAP"]) expect(getCategory(t)).toBe("swap");
  });

  it("covers withdraw AND withdrawal in any capitalization", () => {
    for (const t of ["withdraw", "Withdraw", "WITHDRAW"]) expect(getCategory(t)).toBe("defi");
    for (const t of ["withdrawal", "Withdrawal", "WITHDRAWAL"]) expect(getCategory(t)).toBe("transfer");
  });

  it("covers deposit in any capitalization", () => {
    for (const t of ["deposit", "Deposit", "DEPOSIT"]) expect(getCategory(t)).toBe("defi");
  });

  it("trims surrounding whitespace", () => {
    expect(getCategory("  Withdrawal  ")).toBe("transfer");
    expect(getCategory(" Deposit")).toBe("defi");
  });

  it("still falls back to 'other' for unknown/empty types", () => {
    expect(getCategory("totally-unknown-type")).toBe("other");
    expect(getCategory("")).toBe("other");
  });

  it("does not change a previously-correct exact match", () => {
    expect(getCategory("staking_reward")).toBe("income");
    expect(getCategory("token swap")).toBe("swap");
    expect(getCategory("CLAIM_REWARDS")).toBe("income");
  });
});
