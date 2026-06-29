import { describe, it, expect } from "vitest";
import { tx, d, runWashSales } from "./helpers";

// Phase 2 — wash-sale cluster (#1, #5, #6, daisy-chain).
describe("Wash sales (Phase 2 fixes)", () => {
  it("#1: selling an entire lot at a loss with NO repurchase is NOT a wash sale", () => {
    const { washSales, taxableEvents } = runWashSales([
      tx({ type: "BUY", symbol: "X", date: d("2024-01-01"), quantity: 100, price: 50 }),
      tx({ type: "SELL", symbol: "X", date: d("2024-01-10"), quantity: 100, price: 40 }), // -$1000
    ]);
    expect(washSales).toHaveLength(0);
    const sell = taxableEvents.find((e) => e.symbol === "X" && e.gainLoss < 0);
    expect(sell?.washSaleCode).toBeUndefined();
    expect(sell?.washSaleAdjustment ?? 0).toBe(0);
  });

  it("#1: a genuine repurchase within 30 days IS a wash sale (full loss disallowed)", () => {
    const { washSales } = runWashSales([
      tx({ type: "BUY", symbol: "Y", date: d("2024-01-01"), quantity: 100, price: 50 }),
      tx({ type: "SELL", symbol: "Y", date: d("2024-01-10"), quantity: 100, price: 40 }), // -$1000
      tx({ type: "BUY", symbol: "Y", date: d("2024-01-15"), quantity: 100, price: 40 }), // replacement
    ]);
    expect(washSales.length).toBeGreaterThanOrEqual(1);
    const totalDisallowed = washSales.reduce((s, w) => s + w.disallowedAmount, 0);
    expect(totalDisallowed).toBeCloseTo(1000, 2);
  });

  it("#5: disallowed loss is added to the replacement lot's basis (+ holding-period tack)", () => {
    const { lots, taxableEvents } = runWashSales([
      tx({ type: "BUY", symbol: "Z", date: d("2024-01-01"), quantity: 100, price: 50 }), // $5000
      tx({ type: "SELL", symbol: "Z", date: d("2024-01-10"), quantity: 100, price: 40 }), // -$1000
      tx({ type: "BUY", symbol: "Z", date: d("2024-01-15"), quantity: 100, price: 40 }), // repl $4000
    ]);
    const repl = lots.find(
      (l) => l.status === "OPEN" && l.dateAcquired.getTime() === d("2024-01-15").getTime(),
    )!;
    expect(repl.totalCostBasis).toBeCloseTo(5000, 2); // $4000 + $1000 disallowed
    expect(repl.washSaleAdjustment).toBeCloseTo(1000, 2);
    expect(repl.adjustedAcquisitionDate).toBeDefined();
    const loss = taxableEvents.find((e) => e.symbol === "Z" && e.gainLoss < 0);
    expect(loss?.washSaleCode).toBe("W");
    expect(loss?.washSaleAdjustment).toBeCloseTo(1000, 2);
  });

  it("daisy chain: a deferred loss re-sold via the replacement is not double-counted", () => {
    const { washSales } = runWashSales([
      tx({ type: "BUY", symbol: "W", date: d("2024-01-01"), quantity: 100, price: 50 }), // $5000
      tx({ type: "SELL", symbol: "W", date: d("2024-01-10"), quantity: 100, price: 40 }), // -$1000
      tx({ type: "BUY", symbol: "W", date: d("2024-01-15"), quantity: 100, price: 40 }), // repl -> basis $5000
      tx({ type: "SELL", symbol: "W", date: d("2024-03-01"), quantity: 100, price: 45 }), // sells repl, no rebuy
    ]);
    const totalDisallowed = washSales.reduce((s, w) => s + w.disallowedAmount, 0);
    // Only the original $1000 should ever be disallowed (no double counting in the chain).
    expect(totalDisallowed).toBeLessThanOrEqual(1000.01);
  });
});
