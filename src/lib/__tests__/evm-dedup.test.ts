import { describe, it, expect } from "vitest";
import { evmDedupKey } from "../evm-dedup";

const HASH = "0x" + "a".repeat(64);

describe("evmDedupKey (T6 — stop dropping multi-leg / self-transfer legs)", () => {
  it("gives distinct keys to multiple transfer legs of one EVM tx (same wallet)", () => {
    const leg0 = evmDedupKey({ tx_hash: HASH, id: `${HASH}-erc20-0`, wallet_address: "0xWALLET" });
    const leg1 = evmDedupKey({ tx_hash: HASH, id: `${HASH}-erc20-1`, wallet_address: "0xWALLET" });
    expect(leg0).not.toBe(leg1);
    expect(leg0).toBeTruthy();
  });

  it("gives distinct keys to the two wallets of a self-transfer (same on-chain transfer)", () => {
    // Same native transfer A->B, seen by wallet A (send) and wallet B (receive):
    const id = `${HASH}-native-0xaaa-0xbbb`;
    const sendLeg = evmDedupKey({ tx_hash: HASH, id, wallet_address: "0xAAA" });
    const recvLeg = evmDedupKey({ tx_hash: HASH, id, wallet_address: "0xBBB" });
    expect(sendLeg).not.toBe(recvLeg);
  });

  it("is idempotent: the same record produces the same key (re-sync safe)", () => {
    const rec = { tx_hash: HASH, id: `${HASH}-erc20-3`, wallet_address: "0xWaLLeT" };
    expect(evmDedupKey(rec)).toBe(evmDedupKey(rec));
    // wallet is lower-cased so casing differences don't split rows
    expect(evmDedupKey({ ...rec, wallet_address: "0xwallet" })).toBe(evmDedupKey({ ...rec, wallet_address: "0xWALLET" }));
  });

  it("recovers the raw hash as the first segment", () => {
    const key = evmDedupKey({ tx_hash: HASH, id: `${HASH}-erc20-0`, wallet_address: "0xW" })!;
    expect(key.split("-")[0]).toBe(HASH);
  });

  it("leaves non-EVM records untouched (Solana sub-tx ids, exchange ids, CSV nulls)", () => {
    expect(evmDedupKey({ tx_hash: "5xSolanaSig-0", id: undefined, wallet_address: "sol" })).toBe("5xSolanaSig-0");
    expect(evmDedupKey({ tx_hash: "binance-trade-123", wallet_address: "x" })).toBe("binance-trade-123");
    expect(evmDedupKey({ tx_hash: null, id: null })).toBeNull();
  });

  it("falls back to the raw hash when an EVM record has no per-leg id", () => {
    expect(evmDedupKey({ tx_hash: HASH, id: undefined, wallet_address: "0xW" })).toBe(HASH);
  });
});
