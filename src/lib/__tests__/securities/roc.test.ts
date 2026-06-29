import { describe, it, expect } from "vitest";
import { tx, d, runLots, openLots, lotByAcq } from "./helpers";
import { processDividends } from "../../securities-dividends";

// Phase 1 — Return-of-capital cluster (#2, #8, #10, #13).
// The lot engine is now the SINGLE owner of RoC basis reduction + excess-as-gain.
describe("Return of capital (Phase 1 fixes)", () => {
  it("#13: allocates RoC per share, not by basis proportion", () => {
    const { lots } = runLots([
      tx({ type: "BUY", symbol: "X", date: d("2024-01-01"), quantity: 100, price: 50 }), // $5000
      tx({ type: "BUY", symbol: "X", date: d("2024-02-01"), quantity: 100, price: 10 }), // $1000
      tx({ type: "RETURN_OF_CAPITAL", symbol: "X", date: d("2024-06-01"), totalAmount: 1000 }),
    ]);
    const a = lotByAcq(lots, "2024-01-01")!;
    const b = lotByAcq(lots, "2024-02-01")!;
    // $1000 / 200 sh = $5/sh; each 100-sh lot reduced by $500 (not by dollar-basis ratio).
    expect(a.totalCostBasis).toBeCloseTo(4500, 2);
    expect(b.totalCostBasis).toBeCloseTo(500, 2);
  });

  it("#10: recognizes RoC in excess of basis as a (long-term) capital gain", () => {
    const { lots, taxableEvents } = runLots([
      tx({ type: "BUY", symbol: "Y", date: d("2023-01-01"), quantity: 10, price: 10 }), // $100
      tx({ type: "RETURN_OF_CAPITAL", symbol: "Y", date: d("2024-06-01"), totalAmount: 150 }),
    ]);
    const lot = openLots(lots).find((l) => l.symbol === "Y")!;
    expect(lot.totalCostBasis).toBeCloseTo(0, 2);
    const excess = taxableEvents.filter(
      (e) => e.symbol === "Y" && e.costBasis === 0 && e.gainLoss > 0,
    );
    expect(excess).toHaveLength(1);
    expect(excess[0].gainLoss).toBeCloseTo(50, 2);
    expect(excess[0].gainType).toBe("CAPITAL");
    expect(excess[0].holdingPeriod).toBe("LONG_TERM"); // acquired 2023 -> held >1yr
  });

  it("#8: multi-RoC computes the excess once (40, not 70)", () => {
    const { lots, taxableEvents } = runLots([
      tx({ type: "BUY", symbol: "Z", date: d("2023-01-01"), quantity: 1, price: 100 }), // $100
      tx({ type: "RETURN_OF_CAPITAL", symbol: "Z", date: d("2024-03-01"), totalAmount: 70 }),
      tx({ type: "RETURN_OF_CAPITAL", symbol: "Z", date: d("2024-06-01"), totalAmount: 70 }),
    ]);
    const lot = openLots(lots).find((l) => l.symbol === "Z")!;
    expect(lot.totalCostBasis).toBeCloseTo(0, 2);
    const totalExcess = taxableEvents
      .filter((e) => e.symbol === "Z" && e.costBasis === 0)
      .reduce((s, e) => s + e.gainLoss, 0);
    // RoC#1 70 absorbed (basis 100->30, no excess); RoC#2 70 absorbs 30, excess 40.
    expect(totalExcess).toBeCloseTo(40, 2);
  });

  it("#2: processDividends no longer touches RoC basis (single owner = lot engine)", () => {
    const txns = [
      tx({ type: "BUY", symbol: "W", date: d("2024-01-01"), quantity: 10, price: 10 }),
      tx({ type: "RETURN_OF_CAPITAL", symbol: "W", date: d("2024-06-01"), totalAmount: 40 }),
    ];
    const { lots } = runLots(txns);
    const result = processDividends(txns, openLots(lots));
    expect(result.lotAdjustments).toHaveLength(0);
    expect(
      result.dividends.some((r) => r.dividendType === "ROC_EXCESS_GAIN"),
    ).toBe(false);
  });

  it("RoC below basis reduces once, no excess gain", () => {
    const { lots, taxableEvents } = runLots([
      tx({ type: "BUY", symbol: "Q", date: d("2024-01-01"), quantity: 10, price: 10 }), // $100
      tx({ type: "RETURN_OF_CAPITAL", symbol: "Q", date: d("2024-06-01"), totalAmount: 40 }),
    ]);
    const lot = openLots(lots).find((l) => l.symbol === "Q")!;
    expect(lot.totalCostBasis).toBeCloseTo(60, 2);
    expect(
      taxableEvents.filter((e) => e.symbol === "Q" && e.costBasis === 0),
    ).toHaveLength(0);
  });
});
