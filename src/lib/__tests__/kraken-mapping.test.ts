import { describe, it, expect, vi, beforeEach } from "vitest";
import { getCategory } from "../transaction-categorizer";

// Mock the historical price service so income/trade rows get a deterministic USD value.
// Every crypto symbol prices at $10; the test asserts value_usd = amount * 10.
vi.mock("@/lib/coingecko", () => ({
  getHistoricalPriceAtTimestamp: vi.fn(async () => 10),
}));

// Mock axios so KrakenClient.makeRequest returns canned Ledgers / TradesHistory bodies.
vi.mock("axios", () => ({ default: { post: vi.fn() } }));

import axios from "axios";
import { KrakenClient } from "../exchange-clients";

const mockPost = axios.post as unknown as ReturnType<typeof vi.fn>;
const T = 1700000000; // fixed unix seconds

// One ledger entry per Kraken `type`/`subtype` we could receive. `k` doubles as refid so we
// can look each row up by tx_hash. amount is signed (positive = inflow).
type LE = { type: string; subtype?: string; asset: string; amount: string; fee?: string };
const LEDGER: Record<string, LE> = {
  L_deposit:      { type: "deposit",         asset: "XXBT",  amount: "0.5" },
  L_withdrawal:   { type: "withdrawal",      asset: "XETH",  amount: "-1.0", fee: "0.001" },
  L_stakereward:  { type: "staking",         asset: "DOT.S", amount: "2.0" },        // reward payout (income)
  L_stakemove:    { type: "staking", subtype: "spottostaking", asset: "DOT", amount: "-5.0" }, // allocation (transfer)
  L_earnreward:   { type: "earn",            asset: "DOT",   amount: "1.0" },        // income
  L_airdrop:      { type: "transfer",        asset: "UNI",   amount: "100" },        // airdrop/fork (income)
  L_futuresmove:  { type: "transfer", subtype: "spottofutures", asset: "ZUSD", amount: "-1000" }, // transfer
  L_reward:       { type: "reward",          asset: "ETH",   amount: "0.1" },        // income
  L_dividend:     { type: "dividend",        asset: "ETH",   amount: "3" },          // income
  L_invitebonus:  { type: "invite bonus",    asset: "ZUSD",  amount: "5" },          // income (fiat)
  L_sale:         { type: "sale",            asset: "XXBT",  amount: "-0.2" },       // instant sell (disposal)
  L_spendcrypto:  { type: "spend",           asset: "XETH",  amount: "-0.5" },       // buy-crypto out leg (sell)
  L_spendfiat:    { type: "spend",           asset: "ZUSD",  amount: "-1000" },      // fiat out (transfer)
  L_receivecrypto:{ type: "receive",         asset: "XXBT",  amount: "0.01" },       // buy-crypto in leg (buy)
  L_receivefiat:  { type: "receive",         asset: "ZUSD",  amount: "1000" },       // fiat in (transfer)
  L_conversion:   { type: "conversion",      asset: "XETH",  amount: "-0.3" },       // neutral (other)
  L_margin:       { type: "margin",          asset: "ZUSD",  amount: "50" },         // other
  L_settled:      { type: "settled",         asset: "ZUSD",  amount: "10" },         // other
  L_rollover:     { type: "rollover",        asset: "ZUSD",  amount: "-2" },         // other
  L_adjustment:   { type: "adjustment",      asset: "XXBT",  amount: "0.001" },      // other
  L_credit:       { type: "credit",          asset: "ZUSD",  amount: "100" },        // transfer
  L_nfttrade:     { type: "nfttrade",        asset: "XXBT",  amount: "1" },          // nft (inflow = sale)
  L_custody:      { type: "custodytransfer", asset: "XXBT",  amount: "-0.4" },       // transfer
  L_none:         { type: "none",            asset: "ZUSD",  amount: "0" },          // other
  L_unknown:      { type: "brand_new_type",  asset: "XXBT",  amount: "0.7" },        // other (never a silent buy/sell)
  L_trade:        { type: "trade",           asset: "XXBT",  amount: "1.0" },        // SKIPPED (from TradesHistory)
};

const TRADES: Record<string, any> = {
  TX_buy:  { pair: "XXBTZUSD", type: "buy",  vol: "1",  price: "50000", cost: "50000", fee: "10", time: `${T}` },
  TX_sell: { pair: "XETHZUSD", type: "sell", vol: "2",  price: "3000",  cost: "6000",  fee: "5",  time: `${T}` },
};

// Expected internal type + downstream category per ledger key.
const EXPECT: Record<string, { type: string; cat: string; income: boolean; valued: boolean }> = {
  L_deposit:       { type: "Deposit",       cat: "deposit",    income: false, valued: false },
  L_withdrawal:    { type: "Withdraw",      cat: "withdrawal", income: false, valued: false },
  L_stakereward:   { type: "Staking Reward",cat: "income",     income: true,  valued: true  },
  L_stakemove:     { type: "Transfer",      cat: "transfer",   income: false, valued: false },
  L_earnreward:    { type: "Staking Reward",cat: "income",     income: true,  valued: true  },
  L_airdrop:       { type: "Airdrop",       cat: "income",     income: true,  valued: true  },
  L_futuresmove:   { type: "Transfer",      cat: "transfer",   income: false, valued: false },
  L_reward:        { type: "Reward",        cat: "income",     income: true,  valued: true  },
  L_dividend:      { type: "Dividend",      cat: "income",     income: true,  valued: true  },
  L_invitebonus:   { type: "Reward",        cat: "income",     income: true,  valued: true  }, // fiat → value = amount
  L_sale:          { type: "sell",          cat: "sell",       income: false, valued: true  },
  L_spendcrypto:   { type: "sell",          cat: "sell",       income: false, valued: true  },
  L_spendfiat:     { type: "Transfer",      cat: "transfer",   income: false, valued: false },
  L_receivecrypto: { type: "buy",           cat: "buy",        income: false, valued: true  },
  L_receivefiat:   { type: "Transfer",      cat: "transfer",   income: false, valued: false },
  L_conversion:    { type: "other",         cat: "other",      income: false, valued: false },
  L_margin:        { type: "other",         cat: "other",      income: false, valued: false },
  L_settled:       { type: "other",         cat: "other",      income: false, valued: false },
  L_rollover:      { type: "other",         cat: "other",      income: false, valued: false },
  L_adjustment:    { type: "other",         cat: "other",      income: false, valued: false },
  L_credit:        { type: "Transfer",      cat: "transfer",   income: false, valued: false },
  L_nfttrade:      { type: "NFT Sale",      cat: "nft",        income: false, valued: false },
  L_custody:       { type: "Transfer",      cat: "transfer",   income: false, valued: false },
  L_none:          { type: "other",         cat: "other",      income: false, valued: false },
  L_unknown:       { type: "other",         cat: "other",      income: false, valued: false },
};

describe("Kraken ledger → internal type mapping (simulated full-ledger sync)", () => {
  beforeEach(() => {
    mockPost.mockReset();
    mockPost.mockImplementation(async (url: string) => {
      if (url.includes("/TradesHistory")) {
        return { data: { error: [], result: { trades: TRADES, count: Object.keys(TRADES).length } } };
      }
      if (url.includes("/Ledgers")) {
        const ledger: Record<string, any> = {};
        for (const [k, e] of Object.entries(LEDGER)) {
          ledger[k] = { refid: k, time: `${T}`, aclass: "currency", balance: "0", fee: e.fee || "0", ...e };
        }
        return { data: { error: [], result: { ledger, count: Object.keys(ledger).length } } };
      }
      return { data: { error: [], result: {} } };
    });
  });

  it("maps every ledger type to the right internal type + category, sets income, prices income/trade rows, and skips trade legs", async () => {
    const client = new KrakenClient("key", Buffer.from("secret").toString("base64"));
    const txns = await client.getAllTransactions();
    const byHash = new Map(txns.map((t) => [t.tx_hash, t]));

    // `trade` ledger legs are excluded (imported via TradesHistory instead).
    expect(byHash.has("L_trade")).toBe(false);

    // Every other ledger type is mapped as expected.
    for (const [key, exp] of Object.entries(EXPECT)) {
      const row = byHash.get(key);
      expect(row, `row ${key} should exist`).toBeDefined();
      expect(row!.type, `type for ${key}`).toBe(exp.type);
      expect(getCategory(row!.type), `category for ${key}`).toBe(exp.cat);
      expect(getCategory(row!.type) === "income", `is-income for ${key}`).toBe(exp.income);
      const v = Number(row!.value_usd);
      if (exp.valued) expect(v, `value_usd for ${key} should be > 0`).toBeGreaterThan(0);
      else expect(v, `value_usd for ${key} should be 0`).toBe(0);
    }

    // Spot checks on values: crypto income priced at $10/unit; fiat income valued at amount.
    expect(Number(byHash.get("L_stakereward")!.value_usd)).toBe(2.0 * 10); // DOT.S 2.0 → 20
    expect(Number(byHash.get("L_reward")!.value_usd)).toBe(0.1 * 10);      // ETH 0.1 → 1
    expect(Number(byHash.get("L_invitebonus")!.value_usd)).toBe(5);        // USD 5 → 5 (fiat)

    // Staked-asset suffix stripped: DOT.S reward books under DOT.
    expect(byHash.get("L_stakereward")!.asset_symbol).toBe("DOT");

    // Non-USD-equivalent ledger fee is NOT written into fee_usd (kept in notes).
    expect(byHash.get("L_withdrawal")!.fee_usd).toBeNull();

    // Trades from TradesHistory: USD-quoted, already valued.
    const buy = byHash.get("TX_buy")!;
    expect(buy.type).toBe("buy");
    expect(Number(buy.value_usd)).toBe(50000);
    const sell = byHash.get("TX_sell")!;
    expect(sell.type).toBe("sell");
    expect(Number(sell.value_usd)).toBe(6000);
  });

  it("does not classify any real ledger type as the fallback unless intended", () => {
    // Guard: only the explicitly-neutral types should be "other".
    const intentionalOther = new Set([
      "L_conversion", "L_margin", "L_settled", "L_rollover", "L_adjustment", "L_none", "L_unknown",
    ]);
    for (const [key, exp] of Object.entries(EXPECT)) {
      if (exp.cat === "other") expect(intentionalOther.has(key), `${key} unexpectedly 'other'`).toBe(true);
    }
  });
});
