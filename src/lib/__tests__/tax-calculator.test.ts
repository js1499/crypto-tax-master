import { describe, it, expect } from "vitest";
import { computeCostBasisForTransactions } from "../tax-calculator";
import type { Transaction } from "@prisma/client";

// Minimal Transaction fixture. The cost-basis engine reads numeric fields via
// Number()/Math.abs(), so plain numbers work; we cast to the Prisma type.
let _id = 1;
function tx(overrides: Record<string, unknown>): Transaction {
  return {
    id: _id++,
    type: "buy",
    subtype: null,
    status: "confirmed",
    source: "Test",
    source_type: "wallet",
    asset_symbol: "ETH",
    asset_address: null,
    asset_chain: null,
    amount_value: 1,
    price_per_unit: null,
    value_usd: 0,
    fee_usd: null,
    incoming_asset_symbol: null,
    incoming_amount_value: null,
    incoming_value_usd: null,
    wallet_address: "0xwallet",
    counterparty_address: null,
    tx_hash: `0xhash${_id}`,
    chain: "eth",
    block_number: null,
    explorer_url: null,
    tx_timestamp: new Date("2024-01-01T00:00:00Z"),
    createdAt: new Date("2024-01-01T00:00:00Z"),
    updatedAt: new Date("2024-01-01T00:00:00Z"),
    identified: true,
    notes: null,
    incoming_asset_address: null,
    cost_basis_usd: null,
    gain_loss_usd: null,
    holding_period: null,
    date_acquired: null,
    is_income: false,
    helius_raw_id: null,
    edit_version: 0,
    needs_cost_basis_review: false,
    userId: "user1",
    ...overrides,
  } as unknown as Transaction;
}

const resultFor = (rows: Transaction[], id: number, perWallet = false, country = "US") =>
  computeCostBasisForTransactions(rows, "FIFO", ["0xwallet", "0xwallet2"], perWallet, country).find(
    (r) => r.transactionId === id,
  );

describe("cost basis — stablecoin break-even (T2)", () => {
  it("forces basis = proceeds for bridged/variant stablecoins (no phantom 100% gain)", () => {
    for (const sym of ["USDC.E", "USDBC", "USDE", "CRVUSD", "LUSD", "GHO"]) {
      const sell = tx({
        type: "sell",
        asset_symbol: sym,
        amount_value: 1000,
        value_usd: 1000,
        tx_timestamp: new Date("2024-06-01T00:00:00Z"),
      });
      const r = resultFor([sell], sell.id);
      expect(r?.gainLossUsd ?? 0).toBeCloseTo(0);
    }
  });

  it("a non-stablecoin sell with no prior lot still books full proceeds as gain (contrast)", () => {
    const sell = tx({
      type: "sell",
      asset_symbol: "SHIB",
      amount_value: 1000,
      value_usd: 1000,
      tx_timestamp: new Date("2024-06-01T00:00:00Z"),
    });
    const r = resultFor([sell], sell.id);
    expect(r?.gainLossUsd).toBeCloseTo(1000);
  });

  it("books a REAL loss on a materially depegged stablecoin (not silent break-even)", () => {
    const buy = tx({ type: "buy", asset_symbol: "USDC", amount_value: 1000, value_usd: 1000, tx_timestamp: new Date("2024-01-01T00:00:00Z") });
    // Sold at ~$0.20 (a real depeg) — far outside the peg tolerance, so the override
    // must NOT zero it: 200 proceeds − 1000 basis = −800 deductible loss.
    const sell = tx({ type: "sell", asset_symbol: "USDC", amount_value: 1000, value_usd: 200, tx_timestamp: new Date("2024-03-01T00:00:00Z") });
    expect(resultFor([buy, sell], sell.id)?.gainLossUsd).toBeCloseTo(-800);
  });
});

describe("cost basis — holding-period boundary is calendar-day (T3)", () => {
  it("exactly one year (later time-of-day) is SHORT-term, not long", () => {
    const buy = tx({ type: "buy", asset_symbol: "ETH", amount_value: 1, value_usd: 2000, tx_timestamp: new Date("2024-01-01T10:00:00Z") });
    // Same calendar day one year later but a LATER clock time — old timestamp logic
    // wrongly flipped this to long-term.
    const sell = tx({ type: "sell", asset_symbol: "ETH", amount_value: 1, value_usd: 3000, tx_timestamp: new Date("2025-01-01T23:00:00Z") });
    const r = resultFor([buy, sell], sell.id);
    expect(r?.holdingPeriod).toBe("short");
    expect(r?.gainLossUsd).toBeCloseTo(1000);
  });

  it("one year + one day is LONG-term regardless of time-of-day", () => {
    const buy = tx({ type: "buy", asset_symbol: "ETH", amount_value: 1, value_usd: 2000, tx_timestamp: new Date("2024-01-01T10:00:00Z") });
    const sell = tx({ type: "sell", asset_symbol: "ETH", amount_value: 1, value_usd: 3000, tx_timestamp: new Date("2025-01-02T00:01:00Z") });
    const r = resultFor([buy, sell], sell.id);
    expect(r?.holdingPeriod).toBe("long");
  });
});

describe("cost basis — wash sales are opt-in for crypto (T9)", () => {
  // buy@3000 → sell@2000 (loss -1000) → re-buy@2100 within 30 days → sell@2500.
  // The final sell consumes the replacement lot, so its gain exposes whether the
  // disallowed loss was added to that lot's basis.
  const scenario = () => {
    const buy1 = tx({ type: "buy", asset_symbol: "ETH", amount_value: 1, value_usd: 3000, tx_timestamp: new Date("2024-01-01T00:00:00Z") });
    const sellLoss = tx({ type: "sell", asset_symbol: "ETH", amount_value: 1, value_usd: 2000, tx_timestamp: new Date("2024-02-01T00:00:00Z") });
    const rebuy = tx({ type: "buy", asset_symbol: "ETH", amount_value: 1, value_usd: 2100, tx_timestamp: new Date("2024-02-15T00:00:00Z") });
    const sellFinal = tx({ type: "sell", asset_symbol: "ETH", amount_value: 1, value_usd: 2500, tx_timestamp: new Date("2024-12-01T00:00:00Z") });
    return { rows: [buy1, sellLoss, rebuy, sellFinal], sellFinal };
  };

  it("default OFF (crypto ≠ security): loss is allowed, not shifted into replacement basis", () => {
    const { rows, sellFinal } = scenario();
    const r = computeCostBasisForTransactions(rows, "FIFO", [], false, "US").find((x) => x.transactionId === sellFinal.id);
    // replacement basis 2100 → 2500 − 2100 = +400
    expect(r?.gainLossUsd).toBeCloseTo(400);
  });

  it("opt-in ON: disallowed $1000 loss is added to the replacement lot's basis", () => {
    const { rows, sellFinal } = scenario();
    const r = computeCostBasisForTransactions(rows, "FIFO", [], false, "US", true).find((x) => x.transactionId === sellFinal.id);
    // replacement basis 2100 + 1000 = 3100 → 2500 − 3100 = −600
    expect(r?.gainLossUsd).toBeCloseTo(-600);
  });
});

describe("cost basis — needsReview flags zero-basis disposals (T11)", () => {
  it("flags a disposal with no prior lot (full proceeds taxed as gain)", () => {
    const sell = tx({ type: "sell", asset_symbol: "SHIB", amount_value: 1000, value_usd: 1000, tx_timestamp: new Date("2024-06-01T00:00:00Z") });
    expect(resultFor([sell], sell.id)?.needsReview).toBe(true);
  });

  it("does NOT flag a normal disposal with a matching buy lot", () => {
    const buy = tx({ type: "buy", asset_symbol: "ETH", amount_value: 1, value_usd: 2000, tx_timestamp: new Date("2024-01-01T00:00:00Z") });
    const sell = tx({ type: "sell", asset_symbol: "ETH", amount_value: 1, value_usd: 3000, tx_timestamp: new Date("2024-03-01T00:00:00Z") });
    expect(resultFor([buy, sell], sell.id)?.needsReview).toBe(false);
  });

  it("does NOT flag a stablecoin disposal (basis forced = proceeds)", () => {
    const sell = tx({ type: "sell", asset_symbol: "USDC", amount_value: 1000, value_usd: 1000, tx_timestamp: new Date("2024-06-01T00:00:00Z") });
    expect(resultFor([sell], sell.id)?.needsReview).toBe(false);
  });
});

describe("cost basis — income receipts create an FMV lot (T8 basis continuity)", () => {
  it("an is_income receive gives a later sale its FMV basis (not a zero-basis 100% gain), and the receipt itself is not a disposal", () => {
    const receive = tx({ type: "token receive", is_income: true, asset_symbol: "TKN", amount_value: 1, value_usd: 500, tx_timestamp: new Date("2024-01-01T00:00:00Z") });
    const sell = tx({ type: "sell", asset_symbol: "TKN", amount_value: 1, value_usd: 800, tx_timestamp: new Date("2024-06-01T00:00:00Z") });
    const results = computeCostBasisForTransactions([receive, sell], "FIFO", ["0xwallet"], false, "US");
    expect(results.find((x) => x.transactionId === sell.id)?.gainLossUsd).toBeCloseTo(300); // 800 − 500 FMV
    expect(results.find((x) => x.transactionId === receive.id)?.gainLossUsd ?? null).toBeNull(); // receipt is income, not a disposal
  });
});
