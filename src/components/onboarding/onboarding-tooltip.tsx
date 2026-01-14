"use client";

import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { X, ChevronRight, ChevronLeft, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OnboardingStep, OnboardingState } from "@/lib/onboarding";

interface OnboardingTooltipProps {
  step: OnboardingStep;
  currentStepIndex: number;
  totalSteps: number;
  onNext: () => void;
  onPrevious: () => void;
  onSkip: () => void;
  onComplete: () => void;
  position?: { top: number; left: number } | null;
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
  position,
  anchorElement,
}: OnboardingTooltipProps) {
  const [tooltipPosition, setTooltipPosition] = useState<{
    top: number;
    left: number;
  } | null>(position || null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (anchorElement) {
      const updatePosition = () => {
        const rect = anchorElement.getBoundingClientRect();
        const scrollY = window.scrollY || window.pageYOffset;
        const scrollX = window.scrollX || window.pageXOffset;

        // Position tooltip below the element, centered
        setTooltipPosition({
          top: rect.bottom + scrollY + 16,
          left: rect.left + scrollX + rect.width / 2,
        });
      };

      updatePosition();
      window.addEventListener("scroll", updatePosition);
      window.addEventListener("resize", updatePosition);

      return () => {
        window.removeEventListener("scroll", updatePosition);
        window.removeEventListener("resize", updatePosition);
      };
    } else if (position) {
      setTooltipPosition(position);
    }
  }, [anchorElement, position]);

  // Calculate tooltip position relative to viewport
  const getTooltipStyle = (): React.CSSProperties => {
    if (!tooltipPosition) {
      return {
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        zIndex: 9999,
      };
    }

    const tooltipWidth = 400;
    const tooltipHeight = 200;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let left = tooltipPosition.left - tooltipWidth / 2;
    let top = tooltipPosition.top;

    // Adjust if tooltip goes off screen
    if (left < 16) left = 16;
    if (left + tooltipWidth > viewportWidth - 16) {
      left = viewportWidth - tooltipWidth - 16;
    }
    if (top + tooltipHeight > viewportHeight - 16) {
      top = tooltipPosition.top - tooltipHeight - 80; // Show above instead
    }

    return {
      position: "fixed",
      top: `${top}px`,
      left: `${left}px`,
      transform: "translateX(-50%)",
      zIndex: 9999,
      maxWidth: `${tooltipWidth}px`,
    };
  };

  const isLastStep = currentStepIndex === totalSteps - 1;
  const isFirstStep = currentStepIndex === 0;

  if (typeof window === "undefined") return null;

  return createPortal(
    <>
      {/* Backdrop overlay */}
      <div
        className="fixed inset-0 bg-black/50 z-[9998]"
        onClick={(e) => {
          // Don't close on backdrop click - require explicit action
        }}
      />

      {/* Tooltip */}
      <div
        ref={tooltipRef}
        style={getTooltipStyle()}
        className="pointer-events-auto"
      >
        <Card className="shadow-2xl border-2 border-primary">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground text-sm font-bold">
                    {currentStepIndex + 1}
                  </div>
                  <CardTitle className="text-lg">
                    {step.title}
                  </CardTitle>
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  {step.description}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={onSkip}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  Step {currentStepIndex + 1} of {totalSteps}
                </span>
                <div className="flex gap-1">
                  {Array.from({ length: totalSteps }).map((_, i) => (
                    <div
                      key={i}
                      className={cn(
                        "h-1.5 w-1.5 rounded-full transition-colors",
                        i <= currentStepIndex
                          ? "bg-primary"
                          : "bg-muted"
                      )}
                    />
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {!isFirstStep && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onPrevious}
                  >
                    <ChevronLeft className="mr-1 h-4 w-4" />
                    Previous
                  </Button>
                )}
                {isLastStep ? (
                  <Button size="sm" onClick={onComplete}>
                    <Check className="mr-1 h-4 w-4" />
                    Complete
                  </Button>
                ) : (
                  <Button size="sm" onClick={onNext}>
                    Next
                    <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </>,
    document.body
  );
}
