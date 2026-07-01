"use client";

import { createContext, useContext, useState, useCallback, useRef } from "react";
import { addActivityEntry } from "@/lib/activity-log";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WalletJob {
  walletId: string;
  name: string;
  address: string;
  provider: string;
  chains?: string[];
}

export interface ExchangeJob {
  exchangeId: string;
  name: string;
}

export type PipelinePhase =
  | "idle"
  | "syncing"
  | "enriching"
  | "computing"
  | "done"
  | "error";

export interface PipelineStep {
  label: string;
  status: "pending" | "running" | "done" | "error";
  detail?: string;
  /** Per-step progress 0-100 (estimated during running, 100 when done) */
  progress: number;
}

export interface PipelineState {
  phase: PipelinePhase;
  steps: PipelineStep[];
  currentStepIndex: number;
  overallProgress: number; // 0-100
  error: string | null;
  /** # of transactions still without a cost basis after the last compute (review needed) */
  needsReviewCount?: number;
}

interface PipelineContextType {
  state: PipelineState;
  isRunning: boolean;
  /** Increments each time the pipeline completes — pages watch this to refetch */
  refreshKey: number;
  /** Start full pipeline: sync → enrich → compute */
  startPipeline: (wallets: WalletJob[]) => void;
  /** Start pipeline for existing wallets (Sync All on accounts page) */
  startSyncAll: () => void;
  /** Start pipeline for a freshly-connected exchange: sync → compute cost basis */
  startExchangePipeline: (exchange: ExchangeJob) => void;
  /** Cancel (best-effort) */
  cancel: () => void;
  /** Dismiss the progress bar */
  dismiss: () => void;
}

const IDLE_STATE: PipelineState = {
  phase: "idle",
  steps: [],
  currentStepIndex: -1,
  overallProgress: 0,
  error: null,
  needsReviewCount: 0,
};

const PipelineContext = createContext<PipelineContextType>({
  state: IDLE_STATE,
  isRunning: false,
  refreshKey: 0,
  startPipeline: () => {},
  startSyncAll: () => {},
  startExchangePipeline: () => {},
  cancel: () => {},
  dismiss: () => {},
});

export function useSyncPipeline() {
  return useContext(PipelineContext);
}

// ---------------------------------------------------------------------------
// Throughput estimates (txns/second) — empirically observed
// ---------------------------------------------------------------------------

// Sync: Helius/Moralis fetches pages of ~100 txns, ~0.5-1 pages/sec
const SYNC_TXNS_PER_SEC = 75;
// Enrich: CoinGecko + OHLCV lookups, ~50-100 txns/sec
const ENRICH_TXNS_PER_SEC = 75;
// Compute: FIFO lot matching + DB writes, slower than pure CPU
const COMPUTE_TXNS_PER_SEC = 2500;
// Minimum estimated duration per step (seconds)
const MIN_STEP_SECONDS = 3;

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function SyncPipelineProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<PipelineState>(IDLE_STATE);
  const [refreshKey, setRefreshKey] = useState(0);
  const cancelledRef = useRef(false);
  const tickerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isRunning = state.phase !== "idle" && state.phase !== "done" && state.phase !== "error";

  // Recalculate overall progress from steps
  const calcOverall = (steps: PipelineStep[]): number => {
    if (steps.length === 0) return 0;
    const total = steps.reduce((sum, s) => sum + s.progress, 0);
    return Math.round(total / steps.length);
  };

  // Start a progress ticker that smoothly animates the current step's progress
  // based on estimated duration. Returns cleanup function.
  const startTicker = (
    stepsRef: { current: PipelineStep[] },
    stepIdx: number,
    estimatedSeconds: number,
  ) => {
    const startTime = Date.now();
    const targetMs = Math.max(estimatedSeconds, MIN_STEP_SECONDS) * 1000;
    // Tick every 500ms, asymptotically approach 95% (never 100 — that's set on completion)
    const maxProgress = 95;

    if (tickerRef.current) clearInterval(tickerRef.current);
    tickerRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const fraction = Math.min(elapsed / targetMs, 1);
      // Ease-out: fast start, slows down near end
      const eased = 1 - Math.pow(1 - fraction, 2);
      const progress = Math.round(eased * maxProgress);

      const next = [...stepsRef.current];
      if (next[stepIdx] && next[stepIdx].status === "running") {
        next[stepIdx] = { ...next[stepIdx], progress };
        stepsRef.current = next;
        setState(prev => ({
          ...prev,
          steps: next,
          overallProgress: calcOverall(next),
        }));
      }
    }, 500);
  };

  const stopTicker = () => {
    if (tickerRef.current) {
      clearInterval(tickerRef.current);
      tickerRef.current = null;
    }
  };

  // Get transaction count for a wallet (for time estimation)
  const getTxnCount = async (walletAddress: string): Promise<number> => {
    try {
      const res = await fetch(`/api/transactions?wallet=${walletAddress}&limit=1&page=1`, {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        return data.pagination?.totalCount || 0;
      }
    } catch { /* ignore */ }
    return 1000; // default estimate
  };

  // Core pipeline execution
  const runPipeline = async (wallets: WalletJob[]) => {
    const steps: PipelineStep[] = [
      ...wallets.map(w => ({ label: `Sync ${w.name}`, status: "pending" as const, progress: 0 })),
      ...wallets.map(w => ({ label: `Pull prices: ${w.name}`, status: "pending" as const, progress: 0 })),
      { label: "Compute cost basis", status: "pending" as const, progress: 0 },
    ];
    const totalSteps = steps.length;
    const stepsRef = { current: [...steps] };

    setState({
      phase: "syncing",
      steps: stepsRef.current,
      currentStepIndex: 0,
      overallProgress: 0,
      error: null,
    });

    try {
      // ── Phase 1: Sync each wallet ──
      for (let i = 0; i < wallets.length; i++) {
        if (cancelledRef.current) throw new Error("Cancelled");
        const stepIdx = i;

        // Estimate: new wallets ~30s, existing ~5s
        const estimatedSec = wallets[i].walletId ? 10 : 30;

        stepsRef.current[stepIdx] = { ...stepsRef.current[stepIdx], status: "running", detail: "Syncing transactions...", progress: 0 };
        setState(prev => ({ ...prev, phase: "syncing", steps: [...stepsRef.current], currentStepIndex: stepIdx, overallProgress: calcOverall(stepsRef.current) }));
        startTicker(stepsRef, stepIdx, estimatedSec);

        // Resumable chunked sync: loop until the server reports `done`, passing back the
        // opaque syncState each round. Each request does one bounded chunk (well under the
        // serverless timeout), so even a 30k+ tx wallet completes across several calls —
        // and progress is persisted per chunk, so a failure never loses everything.
        const baseBody: Record<string, unknown> = { walletId: wallets[i].walletId, resumable: true };
        if (wallets[i].chains) baseBody.chains = wallets[i].chains;

        let syncState: unknown = undefined;
        let data: any = null;
        let ok = true;
        let requests = 0;
        const MAX_SYNC_REQUESTS = 500;
        do {
          if (cancelledRef.current) throw new Error("Cancelled");
          const res = await fetch("/api/wallets/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(syncState ? { ...baseBody, syncState } : baseBody),
          });
          data = await res.json();
          if (!res.ok) { ok = false; break; }
          syncState = data.syncState;
          requests++;
          if (!data.done) {
            // Update the detail text per chunk; leave the progress bar to the ticker.
            stepsRef.current[stepIdx] = {
              ...stepsRef.current[stepIdx],
              detail: data.summary ? `Syncing… ${data.summary}` : `Syncing… ${data.transactionsAdded || 0} added`,
            };
            setState(prev => ({ ...prev, steps: [...stepsRef.current], overallProgress: calcOverall(stepsRef.current) }));
          }
        } while (!data.done && requests < MAX_SYNC_REQUESTS);
        stopTicker();

        if (ok && !data?.done) {
          ok = false;
          if (data) data.error = data.error || "Sync did not complete (too many chunks). Please retry.";
        }

        if (!ok) {
          stepsRef.current[stepIdx] = { ...stepsRef.current[stepIdx], status: "error", detail: data?.error || "Sync failed", progress: 100 };
          addActivityEntry({ type: "error", message: `Sync failed: ${wallets[i].name}`, detail: data?.error });
        } else {
          const detail = `${data.transactionsAdded || 0} added, ${data.transactionsSkipped || 0} skipped`;
          stepsRef.current[stepIdx] = { ...stepsRef.current[stepIdx], status: "done", detail, progress: 100 };
          addActivityEntry({ type: "sync", message: `Synced ${wallets[i].name}`, detail });
        }
        setState(prev => ({ ...prev, steps: [...stepsRef.current], overallProgress: calcOverall(stepsRef.current) }));
      }

      // ── Phase 2: Enrich each wallet ──
      setState(prev => ({ ...prev, phase: "enriching" }));

      for (let i = 0; i < wallets.length; i++) {
        if (cancelledRef.current) throw new Error("Cancelled");
        const stepIdx = wallets.length + i;

        // Estimate based on transaction count
        const txnCount = await getTxnCount(wallets[i].address);
        const estimatedSec = Math.max(txnCount / ENRICH_TXNS_PER_SEC, MIN_STEP_SECONDS);

        stepsRef.current[stepIdx] = { ...stepsRef.current[stepIdx], status: "running", detail: `Pulling prices (~${txnCount.toLocaleString()} txns)...`, progress: 0 };
        setState(prev => ({ ...prev, steps: [...stepsRef.current], currentStepIndex: stepIdx, overallProgress: calcOverall(stepsRef.current) }));
        startTicker(stepsRef, stepIdx, estimatedSec);

        const res = await fetch("/api/prices/enrich-historical", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ walletId: wallets[i].walletId }),
        });
        const data = await res.json();
        stopTicker();

        if (!res.ok && res.status !== 409) {
          stepsRef.current[stepIdx] = { ...stepsRef.current[stepIdx], status: "error", detail: data.error || "Enrich failed", progress: 100 };
          addActivityEntry({ type: "error", message: `Price pull failed: ${wallets[i].name}`, detail: data.error });
        } else {
          const updated = data.updated || 0;
          const detail = res.status === 409 ? "Already running" : `${updated} prices updated`;
          stepsRef.current[stepIdx] = { ...stepsRef.current[stepIdx], status: "done", detail, progress: 100 };
          addActivityEntry({ type: "enrich", message: `Pulled prices: ${wallets[i].name}`, detail });
        }
        setState(prev => ({ ...prev, steps: [...stepsRef.current], overallProgress: calcOverall(stepsRef.current) }));
      }

      // ── Phase 3: Compute cost basis ──
      if (cancelledRef.current) throw new Error("Cancelled");
      const cbIdx = totalSteps - 1;
      setState(prev => ({ ...prev, phase: "computing" }));

      // Estimate: sum all wallet txn counts
      let totalTxns = 0;
      for (const w of wallets) {
        totalTxns += await getTxnCount(w.address);
      }
      const cbEstSec = Math.max(totalTxns / COMPUTE_TXNS_PER_SEC, MIN_STEP_SECONDS);

      stepsRef.current[cbIdx] = { ...stepsRef.current[cbIdx], status: "running", detail: `Computing (~${totalTxns.toLocaleString()} txns)...`, progress: 0 };
      setState(prev => ({ ...prev, steps: [...stepsRef.current], currentStepIndex: cbIdx, overallProgress: calcOverall(stepsRef.current) }));
      startTicker(stepsRef, cbIdx, cbEstSec);

      const cbRes = await fetch("/api/cost-basis/compute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({}),
      });
      const cbData = await cbRes.json();
      stopTicker();

      const needsReviewCount: number =
        cbRes.ok && typeof cbData.needsReviewCount === "number" ? cbData.needsReviewCount : 0;

      if (!cbRes.ok) {
        stepsRef.current[cbIdx] = { ...stepsRef.current[cbIdx], status: "error", detail: cbData.error || "Failed", progress: 100 };
        addActivityEntry({ type: "error", message: "Cost basis computation failed", detail: cbData.error });
      } else {
        const detail = needsReviewCount > 0 ? `${needsReviewCount} need cost-basis review` : (cbData.message || "Done");
        stepsRef.current[cbIdx] = { ...stepsRef.current[cbIdx], status: "done", detail, progress: 100 };
        addActivityEntry({ type: "compute", message: "Computed cost basis", detail: cbData.message });
      }

      setState({
        phase: "done",
        steps: [...stepsRef.current],
        currentStepIndex: totalSteps - 1,
        overallProgress: 100,
        error: null,
        needsReviewCount,
      });
      // Signal all pages to refetch their data
      setRefreshKey(k => k + 1);
    } catch (err) {
      stopTicker();
      const msg = err instanceof Error ? err.message : "Pipeline failed";
      setState(prev => ({ ...prev, phase: "error", error: msg }));
    }
  };

  // Pipeline for a freshly-connected exchange: pull transactions, then compute cost basis.
  // Exchange transactions arrive priced (native USD amounts from the exchange), so there is
  // no per-wallet enrich phase — just sync → compute.
  const runExchangePipeline = async (exchange: ExchangeJob) => {
    const steps: PipelineStep[] = [
      { label: `Sync ${exchange.name}`, status: "pending" as const, progress: 0 },
      { label: "Compute cost basis", status: "pending" as const, progress: 0 },
    ];
    const stepsRef = { current: [...steps] };
    setState({ phase: "syncing", steps: stepsRef.current, currentStepIndex: 0, overallProgress: 0, error: null });

    try {
      // ── Phase 1: pull exchange transactions ──
      stepsRef.current[0] = { ...stepsRef.current[0], status: "running", detail: "Pulling transactions...", progress: 0 };
      setState(prev => ({ ...prev, phase: "syncing", steps: [...stepsRef.current], currentStepIndex: 0, overallProgress: calcOverall(stepsRef.current) }));
      startTicker(stepsRef, 0, 30);

      const res = await fetch("/api/exchanges/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ exchangeId: exchange.exchangeId }),
      });
      const data = await res.json();
      stopTicker();

      if (!res.ok) {
        stepsRef.current[0] = { ...stepsRef.current[0], status: "error", detail: data.error || "Sync failed", progress: 100 };
        addActivityEntry({ type: "error", message: `Sync failed: ${exchange.name}`, detail: data.error });
        setState(prev => ({ ...prev, phase: "error", error: data.error || "Sync failed", steps: [...stepsRef.current], overallProgress: calcOverall(stepsRef.current) }));
        return;
      }
      // A 200 response can still carry per-exchange errors (e.g. token expiry between connect
      // and sync) — don't report false success. Hard-fail only when nothing was pulled.
      const syncErrors: string[] = Array.isArray(data.errors) ? data.errors : [];
      const addedCount = data.transactionsAdded || 0;
      if (syncErrors.length > 0 && addedCount === 0) {
        const detail = syncErrors.join("; ");
        stepsRef.current[0] = { ...stepsRef.current[0], status: "error", detail, progress: 100 };
        addActivityEntry({ type: "error", message: `Sync failed: ${exchange.name}`, detail });
        setState(prev => ({ ...prev, phase: "error", error: detail, steps: [...stepsRef.current], overallProgress: calcOverall(stepsRef.current) }));
        return;
      }
      const addedDetail = `${addedCount} added, ${data.transactionsSkipped || 0} skipped`;
      const syncDetail = syncErrors.length > 0 ? `${addedDetail} (${syncErrors.length} warning(s))` : addedDetail;
      stepsRef.current[0] = { ...stepsRef.current[0], status: "done", detail: syncDetail, progress: 100 };
      addActivityEntry({ type: "sync", message: `Synced ${exchange.name}`, detail: syncDetail });
      setState(prev => ({ ...prev, steps: [...stepsRef.current], overallProgress: calcOverall(stepsRef.current) }));

      // ── Phase 2: compute cost basis ──
      if (cancelledRef.current) throw new Error("Cancelled");
      setState(prev => ({ ...prev, phase: "computing" }));
      stepsRef.current[1] = { ...stepsRef.current[1], status: "running", detail: "Computing...", progress: 0 };
      setState(prev => ({ ...prev, steps: [...stepsRef.current], currentStepIndex: 1, overallProgress: calcOverall(stepsRef.current) }));
      startTicker(stepsRef, 1, 10);

      const cbRes = await fetch("/api/cost-basis/compute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({}),
      });
      const cbData = await cbRes.json();
      stopTicker();

      const needsReviewCount: number = cbRes.ok && typeof cbData.needsReviewCount === "number" ? cbData.needsReviewCount : 0;
      if (!cbRes.ok) {
        // Transactions WERE synced, but cost-basis failed — show error (not a green "done"),
        // and still refresh so the newly-synced transactions appear.
        stepsRef.current[1] = { ...stepsRef.current[1], status: "error", detail: cbData.error || "Failed", progress: 100 };
        addActivityEntry({ type: "error", message: "Cost basis computation failed", detail: cbData.error });
        setState(prev => ({ ...prev, phase: "error", error: cbData.error || "Cost basis computation failed", steps: [...stepsRef.current], currentStepIndex: 1, overallProgress: calcOverall(stepsRef.current), needsReviewCount }));
        setRefreshKey(k => k + 1);
        return;
      }
      const detail = needsReviewCount > 0 ? `${needsReviewCount} need cost-basis review` : (cbData.message || "Done");
      stepsRef.current[1] = { ...stepsRef.current[1], status: "done", detail, progress: 100 };
      addActivityEntry({ type: "compute", message: "Computed cost basis", detail: cbData.message });

      setState({ phase: "done", steps: [...stepsRef.current], currentStepIndex: 1, overallProgress: 100, error: null, needsReviewCount });
      setRefreshKey(k => k + 1);
    } catch (err) {
      stopTicker();
      const msg = err instanceof Error ? err.message : "Pipeline failed";
      setState(prev => ({ ...prev, phase: "error", error: msg }));
    }
  };

  const startPipeline = useCallback((wallets: WalletJob[]) => {
    if (wallets.length === 0) return;
    cancelledRef.current = false;
    runPipeline(wallets);
  }, []);

  const startExchangePipeline = useCallback((exchange: ExchangeJob) => {
    cancelledRef.current = false;
    runExchangePipeline(exchange);
  }, []);

  // "Sync All" — fetch user's wallets from API, then run pipeline
  const startSyncAll = useCallback(async () => {
    cancelledRef.current = false;
    try {
      const res = await fetch("/api/wallets", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch wallets");
      const data = await res.json();
      const wallets: WalletJob[] = (data.wallets || []).map((w: any) => ({
        walletId: w.id,
        name: w.name,
        address: w.address,
        provider: w.provider,
        chains: w.chains ? w.chains.split(",") : undefined,
      }));
      if (wallets.length === 0) return;
      runPipeline(wallets);
    } catch (err) {
      setState(prev => ({
        ...prev,
        phase: "error",
        error: err instanceof Error ? err.message : "Failed to start sync",
      }));
    }
  }, []);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    stopTicker();
    setState(prev => ({ ...prev, phase: "error", error: "Cancelled by user" }));
  }, []);

  const dismiss = useCallback(() => {
    stopTicker();
    setState(IDLE_STATE);
  }, []);

  return (
    <PipelineContext.Provider value={{ state, isRunning, refreshKey, startPipeline, startSyncAll, startExchangePipeline, cancel, dismiss }}>
      {children}
    </PipelineContext.Provider>
  );
}
