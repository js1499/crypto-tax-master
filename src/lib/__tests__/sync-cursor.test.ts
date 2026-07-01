import { describe, it, expect } from "vitest";
import {
  initSyncState,
  nextPendingChain,
  applyChunkResult,
  isSyncComplete,
  syncProgressFraction,
  MAX_PAGES_PER_CHAIN,
} from "../sync-cursor";

describe("initSyncState", () => {
  it("creates one pending chain cursor per chain with zeroed counts", () => {
    const s = initSyncState("w1", ["eth", "base", "bsc"], 1700000000000, null);
    expect(s.walletId).toBe("w1");
    expect(s.startTime).toBe(1700000000000);
    expect(s.endTime).toBeNull();
    expect(s.chains).toHaveLength(3);
    expect(s.chains.every((c) => !c.started && !c.done && c.cursor === null)).toBe(true);
    expect(s.totalAdded).toBe(0);
    expect(isSyncComplete(s)).toBe(false);
  });

  it("an empty chain list is never 'complete' (nothing to do, but not a success signal)", () => {
    const s = initSyncState("w1", [], null, null);
    expect(isSyncComplete(s)).toBe(false);
    expect(nextPendingChain(s)).toBeNull();
  });
});

describe("nextPendingChain", () => {
  it("returns chains in order until each is done, then null", () => {
    const s = initSyncState("w1", ["eth", "base"], null, null);
    expect(nextPendingChain(s)?.chain).toBe("eth");
    // Finish eth
    applyChunkResult(s, s.chains[0], { nextCursor: null, added: 10, skipped: 0, pages: 3, raw: 12 });
    expect(nextPendingChain(s)?.chain).toBe("base");
    // Finish base
    applyChunkResult(s, s.chains[1], { nextCursor: null, added: 5, skipped: 1, pages: 1, raw: 6 });
    expect(nextPendingChain(s)).toBeNull();
    expect(isSyncComplete(s)).toBe(true);
  });
});

describe("applyChunkResult", () => {
  it("keeps a chain pending while a cursor remains, accumulating counts", () => {
    const s = initSyncState("w1", ["base"], null, null);
    const base = s.chains[0];

    applyChunkResult(s, base, { nextCursor: "cur-1", added: 100, skipped: 2, pages: 60, raw: 120 });
    expect(base.started).toBe(true);
    expect(base.done).toBe(false);
    expect(base.cursor).toBe("cur-1");
    expect(base.pages).toBe(60);
    expect(s.totalAdded).toBe(100);
    expect(nextPendingChain(s)).toBe(base); // still the one to resume

    // Second chunk resumes from the cursor and finishes the chain
    applyChunkResult(s, base, { nextCursor: null, added: 40, skipped: 0, pages: 20, raw: 45, errors: 3 });
    expect(base.done).toBe(true);
    expect(base.pages).toBe(80);
    expect(s.totalAdded).toBe(140);
    expect(s.totalSkipped).toBe(2);
    expect(s.totalErrors).toBe(3);
    expect(isSyncComplete(s)).toBe(true);
  });

  it("marks a chain done at the per-chain page safety bound even if a cursor remains", () => {
    const s = initSyncState("w1", ["eth"], null, null);
    const eth = s.chains[0];
    applyChunkResult(s, eth, {
      nextCursor: "still-more", // Moralis says there's more...
      added: 1,
      skipped: 0,
      pages: MAX_PAGES_PER_CHAIN, // ...but we've hit the safety bound
      raw: 1,
    });
    expect(eth.done).toBe(true); // bounded, not spinning forever
    expect(isSyncComplete(s)).toBe(true);
  });
});

describe("syncProgressFraction", () => {
  it("is 0 at the start, grows as chains complete, and stays < 1 until fully done", () => {
    const s = initSyncState("w1", ["eth", "base"], null, null);
    expect(syncProgressFraction(s)).toBe(0);

    applyChunkResult(s, s.chains[0], { nextCursor: null, added: 1, skipped: 0, pages: 2, raw: 2 });
    const half = syncProgressFraction(s);
    expect(half).toBeGreaterThanOrEqual(0.5);
    expect(half).toBeLessThan(1);

    applyChunkResult(s, s.chains[1], { nextCursor: null, added: 1, skipped: 0, pages: 2, raw: 2 });
    // Fully done -> caller uses isSyncComplete for 100%; fraction caps below 1.
    expect(syncProgressFraction(s)).toBeGreaterThan(half);
  });

  it("an in-progress chain contributes a partial, monotonically increasing slice", () => {
    const s = initSyncState("w1", ["eth"], null, null);
    applyChunkResult(s, s.chains[0], { nextCursor: "c1", added: 1, skipped: 0, pages: 5, raw: 5 });
    const p1 = syncProgressFraction(s);
    applyChunkResult(s, s.chains[0], { nextCursor: "c2", added: 1, skipped: 0, pages: 20, raw: 20 });
    const p2 = syncProgressFraction(s);
    expect(p2).toBeGreaterThan(p1);
    expect(p2).toBeLessThan(1);
  });
});
