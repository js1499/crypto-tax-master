"use client";

import { createContext, useContext, useState, useCallback, useRef } from "react";

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
}

export interface PipelineState {
  phase: PipelinePhase;
  steps: PipelineStep[];
  currentStepIndex: number;
  overallProgress: number; // 0-100
  error: string | null;
}

interface PipelineContextType {
  state: PipelineState;
  isRunning: boolean;
  /** Start the full pipeline: sync each wallet → enrich each → compute cost basis */
  startPipeline: (wallets: WalletJob[]) => void;
  /** Cancel (best-effort — current API call will finish) */
  cancel: () => void;
}

const IDLE_STATE: PipelineState = {
  phase: "idle",
  steps: [],
  currentStepIndex: -1,
  overallProgress: 0,
  error: null,
};

const PipelineContext = createContext<PipelineContextType>({
  state: IDLE_STATE,
  isRunning: false,
  startPipeline: () => {},
  cancel: () => {},
});

export function useSyncPipeline() {
  return useContext(PipelineContext);
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function SyncPipelineProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<PipelineState>(IDLE_STATE);
  const cancelledRef = useRef(false);

  const isRunning = state.phase !== "idle" && state.phase !== "done" && state.phase !== "error";

  const updateStep = (
    steps: PipelineStep[],
    index: number,
    update: Partial<PipelineStep>,
    totalSteps: number,
  ) => {
    const next = [...steps];
    next[index] = { ...next[index], ...update };
    const doneCount = next.filter(s => s.status === "done").length;
    // Current running step counts as partial progress
    const runningBonus = next.some(s => s.status === "running") ? 0.5 : 0;
    const progress = Math.round(((doneCount + runningBonus) / totalSteps) * 100);
    return { steps: next, progress };
  };

  const startPipeline = useCallback((wallets: WalletJob[]) => {
    if (wallets.length === 0) return;

    cancelledRef.current = false;

    // Build step list: sync each → enrich each → compute once
    const steps: PipelineStep[] = [
      ...wallets.map(w => ({ label: `Sync ${w.name}`, status: "pending" as const })),
      ...wallets.map(w => ({ label: `Pull prices: ${w.name}`, status: "pending" as const })),
      { label: "Compute cost basis", status: "pending" as const },
    ];
    const totalSteps = steps.length;

    setState({
      phase: "syncing",
      steps,
      currentStepIndex: 0,
      overallProgress: 0,
      error: null,
    });

    // Run pipeline async — not awaited, runs in background
    (async () => {
      let currentSteps = [...steps];
      let stepIdx = 0;

      try {
        // ── Phase 1: Sync each wallet ──
        for (let i = 0; i < wallets.length; i++) {
          if (cancelledRef.current) throw new Error("Cancelled");
          stepIdx = i;

          const { steps: s1, progress: p1 } = updateStep(currentSteps, stepIdx, { status: "running", detail: "Syncing transactions..." }, totalSteps);
          currentSteps = s1;
          setState(prev => ({ ...prev, phase: "syncing", steps: s1, currentStepIndex: stepIdx, overallProgress: p1 }));

          const body: Record<string, unknown> = { walletId: wallets[i].walletId };
          if (wallets[i].chains) body.chains = wallets[i].chains;

          const res = await fetch("/api/wallets/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(body),
          });
          const data = await res.json();

          if (!res.ok) {
            const { steps: sErr } = updateStep(currentSteps, stepIdx, { status: "error", detail: data.error || "Sync failed" }, totalSteps);
            currentSteps = sErr;
            // Continue to next wallet even if one fails
          } else {
            const detail = `${data.transactionsAdded || 0} added, ${data.transactionsSkipped || 0} skipped`;
            const { steps: sOk, progress: pOk } = updateStep(currentSteps, stepIdx, { status: "done", detail }, totalSteps);
            currentSteps = sOk;
            setState(prev => ({ ...prev, steps: sOk, overallProgress: pOk }));
          }
        }

        // ── Phase 2: Enrich each wallet ──
        setState(prev => ({ ...prev, phase: "enriching" }));

        for (let i = 0; i < wallets.length; i++) {
          if (cancelledRef.current) throw new Error("Cancelled");
          stepIdx = wallets.length + i;

          const { steps: s2, progress: p2 } = updateStep(currentSteps, stepIdx, { status: "running", detail: "Pulling prices..." }, totalSteps);
          currentSteps = s2;
          setState(prev => ({ ...prev, steps: s2, currentStepIndex: stepIdx, overallProgress: p2 }));

          const res = await fetch("/api/prices/enrich-historical", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ walletId: wallets[i].walletId }),
          });
          const data = await res.json();

          if (!res.ok && res.status !== 409) {
            const { steps: sErr } = updateStep(currentSteps, stepIdx, { status: "error", detail: data.error || "Enrich failed" }, totalSteps);
            currentSteps = sErr;
          } else {
            const updated = data.updated || 0;
            const detail = res.status === 409 ? "Already running" : `${updated} prices updated`;
            const { steps: sOk, progress: pOk } = updateStep(currentSteps, stepIdx, { status: "done", detail }, totalSteps);
            currentSteps = sOk;
            setState(prev => ({ ...prev, steps: sOk, overallProgress: pOk }));
          }
        }

        // ── Phase 3: Compute cost basis (one call) ──
        if (cancelledRef.current) throw new Error("Cancelled");
        stepIdx = totalSteps - 1;
        setState(prev => ({ ...prev, phase: "computing" }));

        const { steps: s3, progress: p3 } = updateStep(currentSteps, stepIdx, { status: "running", detail: "Computing..." }, totalSteps);
        currentSteps = s3;
        setState(prev => ({ ...prev, steps: s3, currentStepIndex: stepIdx, overallProgress: p3 }));

        const cbRes = await fetch("/api/cost-basis/compute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({}),
        });
        const cbData = await cbRes.json();

        if (!cbRes.ok) {
          const { steps: sErr } = updateStep(currentSteps, stepIdx, { status: "error", detail: cbData.error || "Failed" }, totalSteps);
          currentSteps = sErr;
        } else {
          const { steps: sOk } = updateStep(currentSteps, stepIdx, { status: "done", detail: cbData.message || "Done" }, totalSteps);
          currentSteps = sOk;
        }

        // ── Done ──
        setState({
          phase: "done",
          steps: currentSteps,
          currentStepIndex: totalSteps - 1,
          overallProgress: 100,
          error: null,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Pipeline failed";
        setState(prev => ({
          ...prev,
          phase: "error",
          error: msg,
        }));
      }
    })();
  }, []);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    setState(prev => ({ ...prev, phase: "error", error: "Cancelled by user" }));
  }, []);

  return (
    <PipelineContext.Provider value={{ state, isRunning, startPipeline, cancel }}>
      {children}
    </PipelineContext.Provider>
  );
}
