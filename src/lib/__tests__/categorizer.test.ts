import { describe, it, expect } from "vitest";
import { getCategory } from "../transaction-categorizer";

describe("getCategory normalization", () => {
  it("is case-insensitive for common types", () => {
    for (const t of ["buy", "Buy", "BUY", "bUy"]) expect(getCategory(t)).toBe("buy");
    for (const t of ["sell", "Sell", "SELL"]) expect(getCategory(t)).toBe("sell");
    for (const t of ["swap", "Swap", "SWAP"]) expect(getCategory(t)).toBe("swap");
  });

  it("splits withdraw/withdrawal into their own category (Helius WITHDRAW stays defi)", () => {
    for (const t of ["withdraw", "Withdraw"]) expect(getCategory(t)).toBe("withdrawal");
    for (const t of ["withdrawal", "Withdrawal", "WITHDRAWAL"]) expect(getCategory(t)).toBe("withdrawal");
    expect(getCategory("WITHDRAW")).toBe("defi"); // Helius DeFi vault op — exact match wins
  });

  it("splits deposit into its own category (Helius DEPOSIT stays defi)", () => {
    for (const t of ["deposit", "Deposit"]) expect(getCategory(t)).toBe("deposit");
    expect(getCategory("DEPOSIT")).toBe("defi"); // Helius DeFi vault op — exact match wins
  });

  it("maps spend to transfer (transfer out)", () => {
    for (const t of ["spend", "Spend"]) expect(getCategory(t)).toBe("transfer");
  });

  it("trims whitespace and resolves off-casing via the normalized fallback", () => {
    expect(getCategory("  Withdrawal  ")).toBe("withdrawal");
    expect(getCategory(" Deposit")).toBe("deposit");
    expect(getCategory("dEpOsit")).toBe("deposit"); // normalized-map override
    expect(getCategory(" withdraw ")).toBe("withdrawal");
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

  it("maps Coinbase CSV transaction types", () => {
    expect(getCategory("Convert")).toBe("swap");
    expect(getCategory("Wrap Asset")).toBe("swap");
    expect(getCategory("Retail Simple Dust")).toBe("swap");
    expect(getCategory("Staking Income")).toBe("income");
    expect(getCategory("Reward Income")).toBe("income");
    expect(getCategory("Credit Card Reward")).toBe("income");
    expect(getCategory("Subscription Rebate")).toBe("income");
    expect(getCategory("Advanced Trade Buy")).toBe("buy");
    expect(getCategory("Advanced Trade Sell")).toBe("sell");
    expect(getCategory("Sell Refund")).toBe("sell");
    expect(getCategory("Derivatives Settlement")).toBe("sell");
    expect(getCategory("Card Spend")).toBe("transfer");
    expect(getCategory("Retail Unstaking Transfer")).toBe("transfer");
    expect(getCategory("Retail Eth2 Deprecation")).toBe("transfer");
  });
});
