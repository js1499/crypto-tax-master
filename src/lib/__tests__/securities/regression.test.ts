import { describe, it, expect } from "vitest";
import { tx, d, runLots, openLots } from "./helpers";
import { processDividends } from "../../securities-dividends";

// Regression guards for the already-shipped Tier-1/Tier-2 fixes (commit 6dcc1ae).
describe("Already-fixed correctness regressions", () => {
  it("#4: a tax-deferred (IRA) account emits NO taxable events", () => {
    const { taxableEvents } = runLots([
      tx({ type: "BUY", symbol: "A", date: d("2023-01-01"), quantity: 10, price: 10, accountType: "IRA_ROTH" }),
      tx({ type: "SELL", symbol: "A", date: d("2024-06-01"), quantity: 10, price: 20, accountType: "IRA_ROTH" }),
    ]);
    expect(taxableEvents).toHaveLength(0);
  });

  it("#4: a TAXABLE account DOES emit a taxable event", () => {
    const { taxableEvents } = runLots([
      tx({ type: "BUY", symbol: "A", date: d("2023-01-01"), quantity: 10, price: 10, accountType: "TAXABLE" }),
      tx({ type: "SELL", symbol: "A", date: d("2024-06-01"), quantity: 10, price: 20, accountType: "TAXABLE" }),
    ]);
    expect(taxableEvents).toHaveLength(1);
    expect(taxableEvents[0].gainLoss).toBeCloseTo(100, 2);
    expect(taxableEvents[0].holdingPeriod).toBe("LONG_TERM");
  });

  it("#16: TRANSFER_IN keeps the original acquisition date (long-term)", () => {
    const { taxableEvents } = runLots([
      tx({ type: "TRANSFER_IN", symbol: "B", date: d("2024-05-01"), quantity: 10, price: 10, originalAcquisitionDate: d("2022-01-01") }),
      tx({ type: "SELL", symbol: "B", date: d("2024-06-01"), quantity: 10, price: 20 }),
    ]);
    expect(taxableEvents).toHaveLength(1);
    expect(taxableEvents[0].holdingPeriod).toBe("LONG_TERM");
  });

  it("#23: Feb-29 acquisition is long-term when sold Mar-1 the next year", () => {
    const { taxableEvents } = runLots([
      tx({ type: "BUY", symbol: "C", date: d("2020-02-29"), quantity: 1, price: 10 }),
      tx({ type: "SELL", symbol: "C", date: d("2021-03-01"), quantity: 1, price: 20 }),
    ]);
    expect(taxableEvents[0].holdingPeriod).toBe("LONG_TERM");
  });

  it("#23: same Feb-29 lot sold Feb-28 the next year is short-term", () => {
    const { taxableEvents } = runLots([
      tx({ type: "BUY", symbol: "C", date: d("2020-02-29"), quantity: 1, price: 10 }),
      tx({ type: "SELL", symbol: "C", date: d("2021-02-28"), quantity: 1, price: 20 }),
    ]);
    expect(taxableEvents[0].holdingPeriod).toBe("SHORT_TERM");
  });

  it("#14: over-sell emits a review-flagged residual for the uncovered shares", () => {
    const { taxableEvents } = runLots([
      tx({ type: "BUY", symbol: "D", date: d("2024-01-01"), quantity: 50, price: 10 }),
      tx({ type: "SELL", symbol: "D", date: d("2024-06-01"), quantity: 100, price: 20 }),
    ]);
    const residual = taxableEvents.filter((e) => e.needsCostBasisReview);
    expect(residual).toHaveLength(1);
    expect(residual[0].quantity).toBeCloseTo(50, 2);
    expect(residual[0].costBasis).toBe(0);
  });

  it("#19: unknown dividend type defaults to ORDINARY (not qualified)", () => {
    const txns = [
      tx({ type: "BUY", symbol: "E", date: d("2024-01-01"), quantity: 10, price: 10 }),
      tx({ type: "DIVIDEND", symbol: "E", date: d("2024-06-01"), totalAmount: 25 }),
    ];
    const { lots } = runLots(txns);
    const { dividends } = processDividends(txns, openLots(lots));
    expect(dividends.find((r) => r.symbol === "E")?.dividendType).toBe("ORDINARY");
  });
});
