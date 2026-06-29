import { describe, it, expect } from "vitest";
import { tx, d, runLots } from "./helpers";

// Phase 3 — §1256 mark-to-market (#15 short side + cross-year basis carry).
describe("Section 1256 mark-to-market", () => {
  it("#15: §1256 SHORT positions are marked to market at year-end (60/40)", () => {
    const { taxableEvents } = runLots([
      tx({ type: "SELL_SHORT", symbol: "ES", assetClass: "FUTURE", date: d("2024-06-01"), quantity: 1, price: 5000, isSection1256: true }),
      tx({ type: "YEAR_END_FMV", symbol: "ES", assetClass: "FUTURE", date: d("2024-12-31"), quantity: 1, price: 4800, isSection1256: true }),
    ]);
    const s1256 = taxableEvents.filter((e) => e.symbol === "ES" && e.gainType === "SECTION_1256");
    expect(s1256.length).toBeGreaterThanOrEqual(1);
    const total = s1256.reduce((s, e) => s + e.gainLoss, 0);
    expect(total).toBeCloseTo(200, 2); // short at 5000, marked at 4800 => +200
    const lt = s1256.find((e) => e.holdingPeriod === "LONG_TERM");
    const st = s1256.find((e) => e.holdingPeriod === "SHORT_TERM");
    expect(lt?.gainLoss).toBeCloseTo(120, 2); // 60%
    expect(st?.gainLoss).toBeCloseTo(80, 2); // 40%
    expect(s1256[0].formDestination).toBe("6781");
  });

  it("§1256 LONG MTM resets basis to FMV so the next year only recognizes the increment", () => {
    const { taxableEvents } = runLots([
      tx({ type: "BUY", symbol: "SPX", assetClass: "FUTURE", date: d("2023-06-01"), quantity: 1, price: 4000, isSection1256: true }),
      tx({ type: "YEAR_END_FMV", symbol: "SPX", assetClass: "FUTURE", date: d("2023-12-31"), quantity: 1, price: 4200, isSection1256: true }),
      tx({ type: "YEAR_END_FMV", symbol: "SPX", assetClass: "FUTURE", date: d("2024-12-31"), quantity: 1, price: 4300, isSection1256: true }),
    ]);
    const y2023 = taxableEvents.filter((e) => e.year === 2023 && e.gainType === "SECTION_1256");
    const y2024 = taxableEvents.filter((e) => e.year === 2024 && e.gainType === "SECTION_1256");
    expect(y2023.reduce((s, e) => s + e.gainLoss, 0)).toBeCloseTo(200, 2); // 4200 - 4000
    expect(y2024.reduce((s, e) => s + e.gainLoss, 0)).toBeCloseTo(100, 2); // 4300 - 4200 (basis carried)
  });
});
