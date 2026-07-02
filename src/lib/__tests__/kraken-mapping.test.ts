import { describe, it, expect, vi, beforeEach } from "vitest";
import { getCategory } from "../transaction-categorizer";

// Mock the historical price service so income/trade/swap rows get a deterministic USD value.
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

// One ledger entry per Kraken `type`/`subtype` we could receive. `_refid` links the two legs of
// a conversion; otherwise refid = key. amount is signed (positive = inflow).
type LE = { type: string; subtype?: string; asset: string; amount: string; fee?: string; _refid?: string };
const LEDGER: Record<string, LE> = {
  L_deposit:      { type: "deposit",         asset: "XXBT",  amount: "0.5" },
  L_withdrawal:   { type: "withdrawal",      asset: "XETH",  amount: "-1.0", fee: "0.001" },
  L_stakereward:  { type: "staking",         asset: "DOT.S", amount: "2.0" },
  L_stakemove:    { type: "staking", subtype: "spottostaking", asset: "DOT", amount: "-5.0" },
  L_earnreward:   { type: "earn",            asset: "DOT",   amount: "1.0" },
  L_airdrop:      { type: "transfer",        asset: "UNI",   amount: "100" },
  L_futuresmove:  { type: "transfer", subtype: "spottofutures", asset: "ZUSD", amount: "-1000" },
  L_reward:       { type: "reward",          asset: "ETH",   amount: "0.1" },
  L_dividend:     { type: "dividend",        asset: "ETH",   amount: "3" },
  L_invitebonus:  { type: "invite bonus",    asset: "ZUSD",  amount: "5" },
  L_sale:         { type: "sale",            asset: "XXBT",  amount: "-0.2" },
  L_spendcrypto:  { type: "spend",           asset: "XETH",  amount: "-0.5" },
  L_spendfiat:    { type: "spend",           asset: "ZUSD",  amount: "-1000" },
  L_receivecrypto:{ type: "receive",         asset: "XXBT",  amount: "0.01" },
  L_receivefiat:  { type: "receive",         asset: "ZUSD",  amount: "1000" },
  L_credit:       { type: "credit",          asset: "ZUSD",  amount: "100" },
  L_nfttrade:     { type: "nfttrade",        asset: "XXBT",  amount: "1" },
  L_custody:      { type: "custodytransfer", asset: "XXBT",  amount: "-0.4" },
  L_adjustment:   { type: "adjustment",      asset: "XXBT",  amount: "0.001" },
  L_none:         { type: "none",            asset: "ZUSD",  amount: "0" },
  L_unknown:      { type: "brand_new_type",  asset: "XXBT",  amount: "0.7" },
  L_trade:        { type: "trade",           asset: "XXBT",  amount: "1.0" }, // SKIPPED (from TradesHistory)
  // Margin ledger entries are intentionally NEUTRAL ("other") pending real-data validation of
  // Kraken's realized-P&L ledger semantics (see EXCHANGE_TXN_TYPES.md).
  L_margin:       { type: "margin",          asset: "ZUSD",  amount: "50" },
  L_settled:      { type: "settled",         asset: "ZUSD",  amount: "-30" },
  L_rollover:     { type: "rollover",        asset: "ZUSD",  amount: "2" },
  // Paired conversions (share a refid)
  L_cv_out:       { type: "conversion", asset: "XETH", amount: "-1",  _refid: "CV1" }, // crypto→crypto (swap)
  L_cv_in:        { type: "conversion", asset: "XXBT", amount: "0.05",_refid: "CV1" },
  L_cs_out:       { type: "conversion", asset: "UNI",  amount: "-10", _refid: "CV2" }, // crypto→USD (sale)
  L_cs_in:        { type: "conversion", asset: "ZUSD", amount: "70",  _refid: "CV2" },
  L_convunpaired: { type: "conversion", asset: "XETH", amount: "-0.3" }, // lone leg → other
};

const TRADES: Record<string, any> = {
  TX_buy:  { pair: "XXBTZUSD", type: "buy",  vol: "1", price: "50000", cost: "50000", fee: "10", time: `${T}` },
  TX_sell: { pair: "XETHZUSD", type: "sell", vol: "2", price: "3000",  cost: "6000",  fee: "5",  time: `${T}` },
};

// Single-leg entries: expected internal type + downstream category.
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
  L_invitebonus:   { type: "Reward",        cat: "income",     income: true,  valued: true  },
  L_sale:          { type: "sell",          cat: "sell",       income: false, valued: true  },
  L_spendcrypto:   { type: "sell",          cat: "sell",       income: false, valued: true  },
  L_spendfiat:     { type: "Transfer",      cat: "transfer",   income: false, valued: false },
  L_receivecrypto: { type: "buy",           cat: "buy",        income: false, valued: true  },
  L_receivefiat:   { type: "Transfer",      cat: "transfer",   income: false, valued: false },
  L_credit:        { type: "Transfer",      cat: "transfer",   income: false, valued: false },
  L_nfttrade:      { type: "NFT Sale",      cat: "nft",        income: false, valued: false },
  L_custody:       { type: "Transfer",      cat: "transfer",   income: false, valued: false },
  L_adjustment:    { type: "other",         cat: "other",      income: false, valued: false },
  L_none:          { type: "other",         cat: "other",      income: false, valued: false },
  L_unknown:       { type: "other",         cat: "other",      income: false, valued: false },
  L_convunpaired:  { type: "other",         cat: "other",      income: false, valued: false },
  // Margin ledger entries → neutral (not auto-booked as P&L)
  L_margin:        { type: "other",         cat: "other",      income: false, valued: false },
  L_settled:       { type: "other",         cat: "other",      income: false, valued: false },
  L_rollover:      { type: "other",         cat: "other",      income: false, valued: false },
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
          ledger[k] = { refid: e._refid || k, time: `${T}`, aclass: "currency", balance: "0", fee: e.fee || "0", ...e };
        }
        return { data: { error: [], result: { ledger, count: Object.keys(ledger).length } } };
      }
      return { data: { error: [], result: {} } };
    });
  });

  it("maps every single-leg ledger type correctly, flags + prices income, skips trade legs", async () => {
    const client = new KrakenClient("key", Buffer.from("secret").toString("base64"));
    const txns = await client.getAllTransactions();
    const byHash = new Map(txns.map((t) => [t.tx_hash, t]));

    expect(byHash.has("L_trade")).toBe(false); // trade ledger legs excluded

    for (const [key, exp] of Object.entries(EXPECT)) {
      const row = byHash.get(key);
      expect(row, `row ${key} should exist`).toBeDefined();
      expect(row!.type, `type for ${key}`).toBe(exp.type);
      expect(getCategory(row!.type), `category for ${key}`).toBe(exp.cat);
      expect(getCategory(row!.type) === "income", `is-income for ${key}`).toBe(exp.income);
      const v = Number(row!.value_usd);
      if (exp.valued) expect(v, `value_usd for ${key} > 0`).toBeGreaterThan(0);
      else expect(v, `value_usd for ${key} == 0`).toBe(0);
    }

    expect(Number(byHash.get("L_stakereward")!.value_usd)).toBe(20); // DOT 2.0 × $10
    expect(Number(byHash.get("L_invitebonus")!.value_usd)).toBe(5);  // USD 5 (fiat)
    expect(byHash.get("L_stakereward")!.asset_symbol).toBe("DOT");   // .S suffix stripped
    expect(byHash.get("L_withdrawal")!.fee_usd).toBeNull();          // non-USD fee not in fee_usd
  });

  it("keeps USD-quoted spot trades from TradesHistory", async () => {
    const client = new KrakenClient("key", Buffer.from("secret").toString("base64"));
    const byHash = new Map((await client.getAllTransactions()).map((t) => [t.tx_hash, t]));
    expect(byHash.get("TX_buy")!.type).toBe("buy");
    expect(Number(byHash.get("TX_buy")!.value_usd)).toBe(50000);
    expect(byHash.get("TX_sell")!.type).toBe("sell");
    expect(Number(byHash.get("TX_sell")!.value_usd)).toBe(6000);
  });

  it("pairs conversion legs into a swap (crypto→crypto) or a sale (crypto→fiat)", async () => {
    const client = new KrakenClient("key", Buffer.from("secret").toString("base64"));
    const byHash = new Map((await client.getAllTransactions()).map((t) => [t.tx_hash, t]));

    // crypto→crypto conversion → two-sided swap, both legs priced.
    const swap = byHash.get("CV1")!;
    expect(swap.type).toBe("Swap");
    expect(swap.asset_symbol).toBe("ETH");
    expect(swap.incoming_asset_symbol).toBe("BTC");
    expect(Number(swap.value_usd)).toBe(10);            // 1 ETH × $10
    expect(Number(swap.incoming_value_usd)).toBe(0.5);  // 0.05 BTC × $10

    // crypto→USD conversion → sale, proceeds = the USD received.
    const sale = byHash.get("CV2")!;
    expect(sale.type).toBe("sell");
    expect(sale.asset_symbol).toBe("UNI");
    expect(Number(sale.value_usd)).toBe(70);
  });
});
