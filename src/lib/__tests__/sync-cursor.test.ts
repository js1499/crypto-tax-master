import { describe, it, expect } from "vitest";
import {
  initSyncState,
  nextPendingChain,
  applyChunkResult,
  isSyncComplete,
  syncProgressFraction,
  resolveSyncWindow,
  MAX_PAGES_PER_CHAIN,
} from "../sync-cursor";

// Fixed reference points (ms epoch) — no Date.now() so tests are deterministic.
const JAN_2023 = Date.UTC(2023, 0, 1);
const JUN_2023 = Date.UTC(2023, 5, 1);
const DEC_2023 = Date.UTC(2023, 11, 31, 23, 59, 59);
const NOW = Date.UTC(2026, 6, 1);

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

describe("resolveSyncWindow", () => {
  it("no window, no incremental → unbounded full history", () => {
    expect(resolveSyncWindow({})).toEqual({ startTime: undefined, endTime: undefined, empty: false });
  });

  it("persisted closed window on a NEW wallet → fetches the full window", () => {
    const w = resolveSyncWindow({ walletStartMs: JAN_2023, walletEndMs: DEC_2023, lastSyncMs: null });
    expect(w).toEqual({ startTime: JAN_2023, endTime: DEC_2023, empty: false });
  });

  it("persisted CLOSED window already synced (re-sync) → inverted window flagged empty", () => {
    // After the initial sync, lastSyncAt ≈ now (2026); the window ends in 2023.
    const w = resolveSyncWindow({ walletStartMs: JAN_2023, walletEndMs: DEC_2023, lastSyncMs: NOW });
    expect(w.empty).toBe(true); // start (now) > end (2023) → nothing to fetch, and no bad range sent
  });

  it("OPEN-ended window keeps syncing forward incrementally", () => {
    const w = resolveSyncWindow({ walletStartMs: JAN_2023, walletEndMs: null, lastSyncMs: JUN_2023 });
    expect(w).toEqual({ startTime: JUN_2023, endTime: undefined, empty: false }); // start clamped up to lastSync
  });

  it("plain incremental (no persisted window) resumes from lastSync", () => {
    const w = resolveSyncWindow({ lastSyncMs: JUN_2023 });
    expect(w).toEqual({ startTime: JUN_2023, endTime: undefined, empty: false });
  });

  it("fullSync ignores lastSync and re-fetches the whole persisted window", () => {
    const w = resolveSyncWindow({ walletStartMs: JAN_2023, walletEndMs: DEC_2023, lastSyncMs: NOW, fullSync: true });
    expect(w).toEqual({ startTime: JAN_2023, endTime: DEC_2023, empty: false });
  });

  it("explicit body range narrows within the persisted window", () => {
    const w = resolveSyncWindow({
      walletStartMs: JAN_2023, walletEndMs: DEC_2023,
      bodyStartTime: JUN_2023, bodyEndTime: DEC_2023,
    });
    expect(w).toEqual({ startTime: JUN_2023, endTime: DEC_2023, empty: false });
  });

  it("explicit body range wider than the persisted window is CLAMPED to it (hard bound)", () => {
    const w = resolveSyncWindow({
      walletStartMs: JUN_2023, walletEndMs: DEC_2023,
      bodyStartTime: JAN_2023, bodyEndTime: NOW, // both outside the persisted window
    });
    expect(w).toEqual({ startTime: JUN_2023, endTime: DEC_2023, empty: false }); // clamped
  });
});
