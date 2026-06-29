import { describe, it, expect } from "vitest";
import { tx, d, runLots, runMtm } from "./helpers";

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

// Phase 4 — §475(f) trader mark-to-market (#9, #11, #18).
describe("Section 475 trader mark-to-market", () => {
  it("#11: year-end deemed sales are emitted as ORDINARY / Form 4797 events", () => {
    const { taxableEvents } = runMtm(
      [
        tx({ type: "BUY", symbol: "AAPL", date: d("2024-02-01"), quantity: 100, price: 10 }),
        tx({ type: "YEAR_END_FMV", symbol: "AAPL", date: d("2024-12-31"), quantity: 100, price: 15 }),
      ],
      2024,
    );
    const deemed = taxableEvents.filter((e) => e.symbol === "AAPL" && e.gainType === "ORDINARY");
    expect(deemed).toHaveLength(1);
    expect(deemed[0].gainLoss).toBeCloseTo(500, 2); // (15 - 10) * 100
    expect(deemed[0].formDestination).toBe("4797");
  });

  it("§475 resets basis to FMV so the next year recognizes only the increment", () => {
    const { taxableEvents } = runMtm(
      [
        tx({ type: "BUY", symbol: "MSFT", date: d("2024-02-01"), quantity: 100, price: 10 }),
        tx({ type: "YEAR_END_FMV", symbol: "MSFT", date: d("2024-12-31"), quantity: 100, price: 15 }),
        tx({ type: "YEAR_END_FMV", symbol: "MSFT", date: d("2025-12-31"), quantity: 100, price: 18 }),
      ],
      2024,
    );
    const sum = (yr: number) =>
      taxableEvents
        .filter((e) => e.year === yr && e.gainType === "ORDINARY")
        .reduce((s, e) => s + e.gainLoss, 0);
    expect(sum(2024)).toBeCloseTo(500, 2); // 15 - 10
    expect(sum(2025)).toBeCloseTo(300, 2); // 18 - 15 (basis carried)
  });

  it("#9/#18: transition counts the deemed sale once; §481(a) uses PRIOR-year FMV", () => {
    const { taxableEvents, section481OrdinaryGainLoss } = runMtm(
      [
        tx({ type: "BUY", symbol: "NVDA", date: d("2023-06-01"), quantity: 100, price: 10 }), // pre-election cost
        tx({ type: "YEAR_END_FMV", symbol: "NVDA", date: d("2023-12-31"), quantity: 100, price: 12 }), // prior FMV (not marked)
        tx({ type: "YEAR_END_FMV", symbol: "NVDA", date: d("2024-12-31"), quantity: 100, price: 15 }), // election year
      ],
      2024,
    );
    // The pre-election YEAR_END_FMV is captured but NOT marked (election year is 2024).
    expect(
      taxableEvents.filter((e) => e.year === 2023 && e.gainType === "ORDINARY"),
    ).toHaveLength(0);
    // Transition deemed sale is counted ONCE: (15 - 10) * 100 = 500, not 700 (#9).
    const y2024 = taxableEvents
      .filter((e) => e.year === 2024 && e.gainType === "ORDINARY")
      .reduce((s, e) => s + e.gainLoss, 0);
    expect(y2024).toBeCloseTo(500, 2);
    // §481(a) disclosure uses prior-year FMV ($12), not current ($15): (12 - 10) * 100 = 200 (#18).
    expect(section481OrdinaryGainLoss).toBeCloseTo(200, 2);
  });
});
