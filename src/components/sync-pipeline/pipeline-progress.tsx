"use client";

import { useState, useEffect } from "react";
import { useSyncPipeline } from "./pipeline-provider";
import {
  Check,
  X,
  Loader2,
  ChevronDown,
  ChevronUp,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

const PHASE_LABELS: Record<string, string> = {
  syncing: "Syncing wallets",
  enriching: "Pulling prices",
  computing: "Computing cost basis",
  done: "All done",
  error: "Pipeline stopped",
};

export function PipelineProgress() {
  const { state, isRunning, cancel, dismiss } = useSyncPipeline();
  const [expanded, setExpanded] = useState(true);

  // Auto-dismiss after completion (so advanceWhenGone tutorial step detects it)
  useEffect(() => {
    if (state.phase === "done" || state.phase === "error") {
      const t = setTimeout(() => dismiss(), 5000);
      return () => clearTimeout(t);
    }
  }, [state.phase, dismiss]);

  if (state.phase === "idle") return null;

  const isDone = state.phase === "done";
  const isError = state.phase === "error";
  const phaseLabel = PHASE_LABELS[state.phase] || state.phase;

  return (
    <div
      data-onboarding="pipeline-progress"
      className="fixed bottom-4 right-4 sm:right-24 z-50 w-[380px] rounded-xl border border-[#E5E5E0] dark:border-[#333] bg-white dark:bg-[#1A1A1A] shadow-xl overflow-hidden"
    >
      {/* Header bar */}
      <div
        className={cn(
          "flex items-center gap-3 px-4 py-3 cursor-pointer select-none",
          isDone && "bg-[#F0FDF4] dark:bg-[rgba(22,163,74,0.08)]",
          isError && "bg-[#FEF2F2] dark:bg-[rgba(220,38,38,0.08)]",
        )}
        onClick={() => setExpanded(!expanded)}
      >
        {isDone ? (
          <Check className="h-4 w-4 text-[#16A34A] shrink-0" />
        ) : isError ? (
          <AlertCircle className="h-4 w-4 text-[#DC2626] shrink-0" />
        ) : (
          <Loader2 className="h-4 w-4 text-[#2563EB] animate-spin shrink-0" />
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-medium text-[#1A1A1A] dark:text-[#F5F5F5] truncate">
              {phaseLabel}
            </span>
            <span
              className="text-[12px] font-bold text-[#6B7280] ml-2 shrink-0"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {state.overallProgress}%
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-[#F0F0EB] dark:bg-[#2A2A2A] mt-1.5 overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                isDone
                  ? "bg-[#16A34A]"
                  : isError
                    ? "bg-[#DC2626]"
                    : "bg-[#2563EB]",
              )}
              style={{ width: `${state.overallProgress}%` }}
            />
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {isRunning && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                cancel();
              }}
              className="p-1 rounded hover:bg-[#F0F0EB] dark:hover:bg-[#2A2A2A] text-[#9CA3AF] hover:text-[#DC2626] transition-colors"
              title="Cancel"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          {(isDone || isError) && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                dismiss();
              }}
              className="p-1 rounded hover:bg-[#F0F0EB] dark:hover:bg-[#2A2A2A] text-[#9CA3AF] hover:text-[#1A1A1A] transition-colors"
              title="Dismiss"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-[#9CA3AF]" />
          ) : (
            <ChevronUp className="h-3.5 w-3.5 text-[#9CA3AF]" />
          )}
        </div>
      </div>

      {/* Expanded step list */}
      {expanded && (
        <div className="px-4 py-2 max-h-[350px] overflow-y-auto border-t border-[#F0F0EB] dark:border-[#2A2A2A]">
          {state.steps.map((step, i) => (
            <div
              key={i}
              className={cn(
                "py-2",
                i < state.steps.length - 1 &&
                  "border-b border-[#F0F0EB] dark:border-[#2A2A2A]",
              )}
            >
              <div className="flex items-center gap-2.5">
                {/* Status icon */}
                {step.status === "done" ? (
                  <Check className="h-3.5 w-3.5 text-[#16A34A] shrink-0" />
                ) : step.status === "running" ? (
                  <Loader2 className="h-3.5 w-3.5 text-[#2563EB] animate-spin shrink-0" />
                ) : step.status === "error" ? (
                  <AlertCircle className="h-3.5 w-3.5 text-[#DC2626] shrink-0" />
                ) : (
                  <div className="h-3.5 w-3.5 rounded-full border border-[#E5E5E0] dark:border-[#333] shrink-0" />
                )}

                {/* Label + detail */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p
                      className={cn(
                        "text-[12px] truncate",
                        step.status === "running"
                          ? "font-medium text-[#1A1A1A] dark:text-[#F5F5F5]"
                          : step.status === "done"
                            ? "text-[#6B7280]"
                            : step.status === "error"
                              ? "text-[#DC2626]"
                              : "text-[#9CA3AF]",
                      )}
                    >
                      {step.label}
                    </p>
                    {step.status === "running" && (
                      <span
                        className="text-[10px] font-bold text-[#2563EB] ml-2 shrink-0"
                        style={{ fontVariantNumeric: "tabular-nums" }}
                      >
                        {step.progress}%
                      </span>
                    )}
                  </div>
                  {step.detail && (
                    <p className="text-[10px] text-[#9CA3AF] truncate mt-0.5">
                      {step.detail}
                    </p>
                  )}
                </div>
              </div>

              {/* Per-step progress bar (only when running) */}
              {step.status === "running" && (
                <div className="ml-6 mt-1.5">
                  <div className="h-1 w-full rounded-full bg-[#F0F0EB] dark:bg-[#2A2A2A] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[#2563EB] transition-all duration-500"
                      style={{ width: `${step.progress}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          ))}

          {state.error && (
            <p className="text-[11px] text-[#DC2626] py-1">{state.error}</p>
          )}
        </div>
      )}
    </div>
  );
}
