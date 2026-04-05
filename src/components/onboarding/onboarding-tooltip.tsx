"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
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

/**
 * Spotlight-style onboarding tooltip.
 * - Dark overlay with a cutout around the target element
 * - Pulse ring animation on the target
 * - Click on the target advances the tutorial (no separate Next button)
 * - Tooltip card floats near the target with step info
 */
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
  const tooltipRef = useRef<HTMLDivElement>(null);
  const isLastStep = currentStepIndex === totalSteps - 1;

  // Track anchor element position
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
    const interval = setInterval(updateRect, 300); // catch layout shifts
    return () => {
      window.removeEventListener("scroll", updateRect, true);
      window.removeEventListener("resize", updateRect);
      clearInterval(interval);
    };
  }, [updateRect]);

  // Listen for clicks on the anchor element to advance
  useEffect(() => {
    if (!anchorElement) return;

    const handleClick = () => {
      // Small delay so the button's own click handler fires first
      setTimeout(() => {
        if (isLastStep) onComplete();
        else onNext();
      }, 200);
    };

    anchorElement.addEventListener("click", handleClick);
    return () => anchorElement.removeEventListener("click", handleClick);
  }, [anchorElement, onNext, onComplete, isLastStep]);

  if (typeof window === "undefined") return null;

  const pad = 8; // padding around the spotlight cutout
  const hasAnchor = rect !== null;

  // Spotlight cutout CSS (inset box-shadow trick)
  const overlayStyle: React.CSSProperties = hasAnchor
    ? {
        // Giant box-shadow creates the dark overlay with a transparent hole
        boxShadow: `0 0 0 9999px rgba(0,0,0,0.6)`,
        position: "fixed",
        top: rect!.top - pad,
        left: rect!.left - pad,
        width: rect!.width + pad * 2,
        height: rect!.height + pad * 2,
        borderRadius: "12px",
        zIndex: 9998,
        pointerEvents: "none",
      }
    : {};

  // Tooltip position: prefer below, fallback above
  const getTooltipStyle = (): React.CSSProperties => {
    if (!hasAnchor) {
      return {
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        zIndex: 10000,
      };
    }

    const tooltipW = 360;
    const gap = 16;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let top = rect!.bottom + gap;
    let left = rect!.left + rect!.width / 2 - tooltipW / 2;

    // If tooltip goes below viewport, show above
    if (top + 160 > vh) {
      top = rect!.top - 160 - gap;
    }
    // Clamp horizontally
    if (left < 12) left = 12;
    if (left + tooltipW > vw - 12) left = vw - tooltipW - 12;

    return {
      position: "fixed",
      top,
      left,
      width: tooltipW,
      zIndex: 10000,
    };
  };

  return createPortal(
    <>
      {/*
        Overlay strategy: 4 dark panels around the spotlight hole.
        This lets the target element receive real clicks natively
        (no synthetic click forwarding needed).
      */}
      {hasAnchor && (
        <>
          {/* Top panel */}
          <div className="fixed inset-x-0 top-0 bg-black/60 z-[9998]" style={{ height: rect!.top - pad }} />
          {/* Bottom panel */}
          <div className="fixed inset-x-0 bottom-0 bg-black/60 z-[9998]" style={{ top: rect!.bottom + pad }} />
          {/* Left panel */}
          <div className="fixed left-0 bg-black/60 z-[9998]" style={{ top: rect!.top - pad, height: rect!.height + pad * 2, width: rect!.left - pad }} />
          {/* Right panel */}
          <div className="fixed right-0 bg-black/60 z-[9998]" style={{ top: rect!.top - pad, height: rect!.height + pad * 2, left: rect!.right + pad }} />
        </>
      )}

      {/* Pulse ring around target */}
      {hasAnchor && (
        <div
          className="fixed z-[9999] pointer-events-none"
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

      {/* Tooltip card */}
      <div ref={tooltipRef} style={getTooltipStyle()} className="pointer-events-auto">
        <div className="rounded-xl bg-white dark:bg-[#1A1A1A] border border-[#E5E5E0] dark:border-[#333] shadow-2xl overflow-hidden">
          {/* Blue accent bar */}
          <div className="h-1 bg-[#2563EB]" />

          <div className="p-4">
            {/* Header */}
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

            {/* Description */}
            <p className="text-[13px] text-[#6B7280] leading-relaxed mb-3">
              {step.description}
            </p>

            {/* Action hint */}
            {hasAnchor && (
              <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg bg-[#EFF6FF] dark:bg-[rgba(37,99,235,0.08)] border border-[#BFDBFE] dark:border-[#1E3A5F]">
                <div className="h-2 w-2 rounded-full bg-[#2563EB] animate-pulse shrink-0" />
                <p className="text-[12px] font-medium text-[#2563EB]">
                  Click the highlighted button to continue
                </p>
              </div>
            )}

            {/* Progress dots + skip */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-[#9CA3AF]">
                  {currentStepIndex + 1} / {totalSteps}
                </span>
                <div className="flex gap-1">
                  {Array.from({ length: totalSteps }).map((_, i) => (
                    <div
                      key={i}
                      className={cn(
                        "h-1.5 rounded-full transition-all",
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
              <button
                onClick={onSkip}
                className="text-[12px] text-[#9CA3AF] hover:text-[#6B7280] transition-colors"
              >
                Skip tutorial
              </button>
            </div>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}
