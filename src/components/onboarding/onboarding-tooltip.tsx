"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OnboardingStep } from "@/lib/onboarding";

interface OnboardingTooltipProps {
  step: OnboardingStep;
  currentStepIndex: number;
  totalSteps: number;
  onNext: () => void;
  onPrevious: () => void;
  onSkip: () => void;
  onComplete: () => void;
  anchorElement?: HTMLElement | null;
}

export function OnboardingTooltip({
  step,
  currentStepIndex,
  totalSteps,
  onNext,
  onPrevious,
  onSkip,
  onComplete,
  anchorElement,
}: OnboardingTooltipProps) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [visible, setVisible] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const isLastStep = currentStepIndex === totalSteps - 1;

  const updateRect = useCallback(() => {
    if (anchorElement) {
      setRect(anchorElement.getBoundingClientRect());
    } else {
      setRect(null);
    }
  }, [anchorElement]);

  useEffect(() => {
    updateRect();
    window.addEventListener("scroll", updateRect, true);
    window.addEventListener("resize", updateRect);
    const interval = setInterval(updateRect, 300);
    return () => {
      window.removeEventListener("scroll", updateRect, true);
      window.removeEventListener("resize", updateRect);
      clearInterval(interval);
    };
  }, [updateRect]);

  // Fade out → pause → fade in on step change
  useEffect(() => {
    setVisible(false); // exit: fade out
    const t = setTimeout(() => setVisible(true), 250); // entrance: fade in after pause
    return () => clearTimeout(t);
  }, [currentStepIndex]);

  // Click on anchor advances the tutorial (only if autoAdvance is not false)
  const shouldAutoAdvance = step.autoAdvance !== false;
  useEffect(() => {
    if (!anchorElement || !shouldAutoAdvance) return;

    const advance = () => {
      if (isLastStep) onComplete();
      else onNext();
    };

    // Standard click handler (capture phase for sidebar links)
    anchorElement.addEventListener("click", advance, true);

    // For Radix Select triggers: watch for the dropdown to close after opening
    // (data-state goes "open" → "closed" = selection made)
    let wasOpen = false;
    const attrObserver = new MutationObserver(() => {
      const state = anchorElement.getAttribute("data-state");
      if (state === "open") wasOpen = true;
      if (state === "closed" && wasOpen) {
        wasOpen = false;
        setTimeout(advance, 100);
      }
    });
    attrObserver.observe(anchorElement, { attributes: true, attributeFilter: ["data-state"] });

    return () => {
      anchorElement.removeEventListener("click", advance, true);
      attrObserver.disconnect();
    };
  }, [anchorElement, onNext, onComplete, isLastStep, shouldAutoAdvance]);

  if (typeof window === "undefined") return null;

  const pad = 8;
  const hasAnchor = rect !== null;

  // Tooltip position
  const getTooltipStyle = (): React.CSSProperties => {
    if (!hasAnchor) {
      return { position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", zIndex: 9999 };
    }
    const tooltipW = 380;
    const tooltipH = 220;
    const gap = 20;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Determine best position: right of element (for sidebar items), below, or above
    const spaceRight = vw - rect!.right;
    const spaceBelow = vh - rect!.bottom;
    const spaceAbove = rect!.top;

    let top: number;
    let left: number;

    const spaceLeft = rect!.left;
    const isTopRight = rect!.top < vh / 3 && rect!.right > vw / 2;

    if (isTopRight && spaceLeft > tooltipW + gap) {
      // Target is top-right — position to the LEFT so dropdown has room below
      top = rect!.top;
      left = rect!.left - tooltipW - gap;
      if (top + tooltipH > vh - 12) top = vh - tooltipH - 12;
    } else if (spaceRight > tooltipW + gap + 20) {
      // Position to the right (best for sidebar nav items)
      top = rect!.top;
      left = rect!.right + gap;
      if (top + tooltipH > vh - 12) top = vh - tooltipH - 12;
    } else if (spaceBelow > tooltipH + gap + 80) {
      // Position below with clearance for dropdowns
      top = rect!.bottom + gap;
      left = rect!.left + rect!.width / 2 - tooltipW / 2;
    } else if (spaceAbove > tooltipH + gap) {
      // Position above
      top = rect!.top - tooltipH - gap;
      left = rect!.left + rect!.width / 2 - tooltipW / 2;
    } else {
      // Fallback: bottom-left corner
      top = vh - tooltipH - 20;
      left = 20;
    }

    // Clamp horizontally
    if (left < 12) left = 12;
    if (left + tooltipW > vw - 12) left = vw - tooltipW - 12;
    // Clamp vertically
    if (top < 12) top = 12;

    return { position: "fixed", top, left, width: tooltipW, zIndex: 9999 };
  };

  return createPortal(
    <div
      className={cn(
        "transition-opacity duration-300",
        visible ? "opacity-100" : "opacity-0",
      )}
    >
      {/* Spotlight overlay: box-shadow creates dim everywhere except the hole */}
      {hasAnchor && visible && (
        <div
          className="fixed z-[40] pointer-events-none rounded-xl"
          style={{
            top: rect!.top - pad,
            left: rect!.left - pad,
            width: rect!.width + pad * 2,
            height: rect!.height + pad * 2,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.5)",
          }}
        />
      )}

      {/* Pulse ring */}
      {hasAnchor && visible && (
        <div
          className="fixed z-[41] pointer-events-none transition-all duration-300"
          style={{
            top: rect!.top - pad,
            left: rect!.left - pad,
            width: rect!.width + pad * 2,
            height: rect!.height + pad * 2,
          }}
        >
          <div className="absolute inset-0 rounded-xl border-2 border-[#2563EB] animate-pulse" />
          <div className="absolute -inset-1 rounded-xl border border-[#2563EB]/40 animate-ping" style={{ animationDuration: "1.5s" }} />
        </div>
      )}

      {/* Tooltip card with slide + fade animation */}
      <div
        ref={tooltipRef}
        style={getTooltipStyle()}
        className={cn(
          "pointer-events-auto transition-all duration-200",
          visible ? "translate-y-0 opacity-100 ease-out" : "-translate-y-1 opacity-0 ease-in",
        )}
      >
        <div className="rounded-xl bg-white dark:bg-[#1A1A1A] border border-[#E5E5E0] dark:border-[#333] shadow-2xl overflow-hidden">
          <div className="h-1 bg-[#2563EB]" />

          <div className="p-4">
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2.5">
                <div className="flex items-center justify-center w-7 h-7 rounded-full bg-[#2563EB] text-white text-[12px] font-bold shrink-0">
                  {currentStepIndex + 1}
                </div>
                <h3 className="text-[15px] font-semibold text-[#1A1A1A] dark:text-[#F5F5F5]">
                  {step.title}
                </h3>
              </div>
              <button
                onClick={onSkip}
                className="p-1 rounded hover:bg-[#F0F0EB] dark:hover:bg-[#2A2A2A] text-[#9CA3AF] hover:text-[#6B7280] transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-[13px] text-[#6B7280] leading-relaxed mb-3">
              {step.description}
            </p>

            {hasAnchor && (
              <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg bg-[#EFF6FF] dark:bg-[rgba(37,99,235,0.08)] border border-[#BFDBFE] dark:border-[#1E3A5F]">
                <div className="h-2 w-2 rounded-full bg-[#2563EB] animate-pulse shrink-0" />
                <p className="text-[12px] font-medium text-[#2563EB]">
                  {shouldAutoAdvance
                    ? "Click the highlighted element to continue"
                    : "Interact with the highlighted area, then click Next"}
                </p>
              </div>
            )}

            {/* Progress + navigation */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-[#9CA3AF]" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {currentStepIndex + 1}/{totalSteps}
                </span>
                <div className="flex gap-1">
                  {Array.from({ length: totalSteps }).map((_, i) => (
                    <div
                      key={i}
                      className={cn(
                        "h-1.5 rounded-full transition-all duration-300",
                        i === currentStepIndex
                          ? "w-4 bg-[#2563EB]"
                          : i < currentStepIndex
                          ? "w-1.5 bg-[#2563EB]/40"
                          : "w-1.5 bg-[#E5E5E0] dark:bg-[#333]"
                      )}
                    />
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={onSkip}
                  className="text-[12px] text-[#9CA3AF] hover:text-[#6B7280] transition-colors mr-1"
                >
                  Skip
                </button>
                {currentStepIndex > 0 && (
                  <button
                    onClick={onPrevious}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-[#E5E5E0] dark:border-[#333] text-[12px] font-medium text-[#4B5563] dark:text-[#9CA3AF] hover:border-[#2563EB] hover:text-[#2563EB] transition-colors"
                  >
                    <ChevronLeft className="h-3 w-3" />
                    Back
                  </button>
                )}
                {!isLastStep ? (
                  <button
                    onClick={onNext}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-[#2563EB] text-white text-[12px] font-medium hover:bg-[#1D4ED8] transition-colors"
                  >
                    Next
                    <ChevronRight className="h-3 w-3" />
                  </button>
                ) : (
                  <button
                    onClick={onComplete}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-[#16A34A] text-white text-[12px] font-medium hover:bg-[#15803D] transition-colors"
                  >
                    Done
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
