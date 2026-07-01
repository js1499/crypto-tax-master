/**
 * Resumable wallet-sync cursor state machine.
 *
 * A large EVM wallet (tens of thousands of transactions across several chains) cannot
 * be fetched + inserted inside a single serverless invocation — Vercel hard-kills the
 * function at its `maxDuration` ceiling (800s), and because the old sync inserted only
 * at the very end, a kill meant *zero* transactions persisted.
 *
 * Instead, the sync now runs in bounded CHUNKS across many short requests. The server is
 * stateless: the client holds this `SyncCursorState`, and each `POST /api/wallets/sync`
 * processes one bounded chunk (up to {@link MAX_PAGES_PER_CHUNK} pages of ONE chain),
 * persists it immediately, advances the cursor, and returns the updated state. The client
 * loops until `isSyncComplete`. This keeps every request well under the timeout and makes
 * progress durable — a crash or timeout only loses the in-flight chunk, not everything.
 *
 * These helpers are PURE (no network, no DB) so the cursor logic is unit-testable.
 */

/** Moralis history pages fetched per request. ~1–2s/page (no inline pricing), so 60
 * pages ≈ 6k raw txns ≈ well under a minute of fetch + insert — far below the 800s cap. */
export const MAX_PAGES_PER_CHUNK = 60;

/** Per-chain safety bound (~200k txns) so a misbehaving/looping cursor can't spin
 * forever. Reaching it marks the chain done and is surfaced as a warning by the caller. */
export const MAX_PAGES_PER_CHAIN = 2000;

/** Client-side guard: max chunk requests for one wallet before we bail (state is
 * malformed / server not advancing). Generous headroom over any real wallet. */
export const MAX_CHUNK_REQUESTS = 500;

export interface ChainCursor {
  chain: string;
  /** Moralis pagination cursor for the NEXT page. null before start and after the chain
   *  is exhausted — use `started`/`done` to disambiguate. */
  cursor: string | null;
  started: boolean;
  done: boolean;
  added: number;
  skipped: number;
  pages: number;
  raw: number;
}

export interface SyncCursorState {
  walletId: string;
  /** Incremental-sync lower bound (ms epoch) resolved once at init; null = full history. */
  startTime: number | null;
  /** Optional upper bound (ms epoch); null = up to now. */
  endTime: number | null;
  chains: ChainCursor[];
  totalAdded: number;
  totalSkipped: number;
  totalErrors: number;
}

/** Build the initial state for a wallet: every chain pending, no cursor, zero counts. */
export function initSyncState(
  walletId: string,
  chains: string[],
  startTime: number | null,
  endTime: number | null,
): SyncCursorState {
  return {
    walletId,
    startTime,
    endTime,
    chains: chains.map((chain) => ({
      chain,
      cursor: null,
      started: false,
      done: false,
      added: 0,
      skipped: 0,
      pages: 0,
      raw: 0,
    })),
    totalAdded: 0,
    totalSkipped: 0,
    totalErrors: 0,
  };
}

/** The next chain that still has pages to fetch, or null when every chain is done. */
export function nextPendingChain(state: SyncCursorState): ChainCursor | null {
  return state.chains.find((c) => !c.done) ?? null;
}

export interface ChunkResult {
  nextCursor: string | null;
  added: number;
  skipped: number;
  errors?: number;
  pages: number;
  raw: number;
}

/**
 * Fold one processed chunk's result into a chain's cursor and the wallet totals.
 * Mutates both `chain` and `state` (they're the client-held working copy). A chain is
 * done when Moralis returns no further cursor OR the per-chain page bound is hit.
 */
export function applyChunkResult(
  state: SyncCursorState,
  chain: ChainCursor,
  result: ChunkResult,
): void {
  chain.started = true;
  chain.cursor = result.nextCursor;
  chain.added += result.added;
  chain.skipped += result.skipped;
  chain.pages += result.pages;
  chain.raw += result.raw;
  chain.done = result.nextCursor === null || chain.pages >= MAX_PAGES_PER_CHAIN;

  state.totalAdded += result.added;
  state.totalSkipped += result.skipped;
  state.totalErrors += result.errors ?? 0;
}

/** True once every chain has been fully fetched. */
export function isSyncComplete(state: SyncCursorState): boolean {
  return state.chains.length > 0 && state.chains.every((c) => c.done);
}

/** Coarse progress fraction (0..1) for UI, weighted by completed chains + in-flight pages. */
export function syncProgressFraction(state: SyncCursorState): number {
  if (state.chains.length === 0) return 1;
  // Each chain contributes 1/N; a chain in progress contributes a partial slice that
  // eases toward (but never reaches) full until it's actually done.
  const per = 1 / state.chains.length;
  let frac = 0;
  for (const c of state.chains) {
    if (c.done) {
      frac += per;
    } else if (c.started) {
      // Asymptotic: 0 pages -> 0, grows toward ~0.9 of this chain's slice.
      frac += per * (1 - 1 / (1 + c.pages / 5));
    }
  }
  return Math.min(0.99, frac);
}

/** One-line human summary for logs/UI. */
export function syncProgressSummary(state: SyncCursorState): string {
  const done = state.chains.filter((c) => c.done).length;
  const pages = state.chains.reduce((s, c) => s + c.pages, 0);
  return `${done}/${state.chains.length} chains, ${pages} pages, ${state.totalAdded} added`;
}

export interface SyncWindow {
  /** Lower time bound (ms epoch) to fetch from, or undefined for no lower bound. */
  startTime?: number;
  /** Upper time bound (ms epoch), or undefined for no upper bound (up to now). */
  endTime?: number;
  /** True when the resolved window is inverted (start > end) — nothing to fetch. */
  empty: boolean;
}

/**
 * Resolve the effective [startTime, endTime] window for a sync, combining:
 *  - a persisted per-wallet window (walletStartMs / walletEndMs) — a HARD bound,
 *  - an explicit per-request override (bodyStartTime / bodyEndTime),
 *  - incremental sync (lastSyncMs) — skip already-synced history unless fullSync.
 *
 * Lower bound = the LATEST of {persisted floor, (explicit start OR incremental cursor)} —
 * so we never fetch before the wallet's window and never re-walk already-synced history.
 * Upper bound = the EARLIEST of {persisted ceiling, explicit end} — the narrower wins,
 * so the persisted ceiling is a hard cap.
 *
 * Edge case: a CLOSED past window that's already fully synced yields start (=lastSync≈now)
 * > end (in the past) → an INVERTED window. We flag `empty` so callers skip fetching a
 * bad from_date>to_date range (which Moralis/Helius would reject or mishandle) and simply
 * report the sync complete with nothing new — which is correct for a closed window.
 */
export function resolveSyncWindow(opts: {
  bodyStartTime?: number | null;
  bodyEndTime?: number | null;
  walletStartMs?: number | null;
  walletEndMs?: number | null;
  lastSyncMs?: number | null;
  fullSync?: boolean;
}): SyncWindow {
  const nums = (arr: Array<number | null | undefined>): number[] =>
    arr.filter((x): x is number => typeof x === "number" && !Number.isNaN(x));

  // Incremental cursor applies only when not a full re-sync and there's a prior sync.
  const incremental =
    !opts.fullSync && typeof opts.lastSyncMs === "number" ? opts.lastSyncMs : undefined;
  // An explicit request start overrides the incremental cursor; otherwise use incremental.
  const requestedStart = typeof opts.bodyStartTime === "number" ? opts.bodyStartTime : incremental;

  const startCandidates = nums([opts.walletStartMs, requestedStart]);
  const startTime = startCandidates.length ? Math.max(...startCandidates) : undefined;

  const endCandidates = nums([opts.walletEndMs, opts.bodyEndTime]);
  const endTime = endCandidates.length ? Math.min(...endCandidates) : undefined;

  const empty = typeof startTime === "number" && typeof endTime === "number" && startTime > endTime;
  return { startTime, endTime, empty };
}
