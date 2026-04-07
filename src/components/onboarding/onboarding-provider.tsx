"use client";

import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  getOnboardingState,
  saveOnboardingState,
  completeStep,
  skipOnboarding,
  ONBOARDING_STEPS,
  type OnboardingState,
  type OnboardingStep,
} from "@/lib/onboarding";
import { OnboardingTooltip } from "./onboarding-tooltip";

interface OnboardingContextType {
  state: OnboardingState;
  startOnboarding: () => void;
  completeCurrentStep: () => void;
  goToStep: (stepIndex: number) => void;
  skip: () => void;
  isActive: boolean;
}

const OnboardingContext = createContext<OnboardingContextType | undefined>(undefined);

export function useOnboarding(): OnboardingContextType {
  const context = useContext(OnboardingContext);
  if (!context) {
    return {
      state: { isActive: false, currentStep: 0, steps: [], completed: true },
      startOnboarding: () => {},
      completeCurrentStep: () => {},
      goToStep: () => {},
      skip: () => {},
      isActive: false,
    };
  }
  return context;
}

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  // Initialize state once from localStorage/FORCE_ONBOARDING
  const [state, setState] = useState<OnboardingState>(() => getOnboardingState());
  const [anchorElement, setAnchorElement] = useState<HTMLElement | null>(null);
  const advanceRef = useRef<() => void>(() => {});
  const router = useRouter();
  const pathname = usePathname();
  const { status } = useSession();
  const isAuthenticated = status === "authenticated";

  // Single effect: navigate to target page + find anchor element
  useEffect(() => {
    if (!state.isActive || state.completed || !isAuthenticated) {
      setAnchorElement(null);
      return;
    }

    const step = state.steps[state.currentStep];
    if (!step) {
      setAnchorElement(null);
      return;
    }

    // Navigate to target page if needed
    const isPublicPage = pathname === "/login" || pathname === "/register";
    const here = (pathname || "/").replace(/\/$/, "") || "/";
    const target = (step.targetPage || "").replace(/\/$/, "") || "";

    if (target && here !== target && !isPublicPage) {
      router.push(target);
      // Don't look for element yet — wait for pathname to change and re-fire
      return;
    }

    // Clear old anchor immediately, then wait for fade-out to finish
    // before searching for the new element (prevents ghost highlights)
    setAnchorElement(null);

    let cancelled = false;
    let attempts = 0;

    let wasFound = false;

    const find = () => {
      if (cancelled) return;
      const el = step.targetElement
        ? (document.querySelector(step.targetElement) as HTMLElement)
        : null;
      if (el) {
        wasFound = true;
        setAnchorElement(el);
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      } else if (wasFound && step.advanceWhenGone) {
        // Element was found before but now gone — auto-advance
        advanceRef.current();
        return;
      } else if (attempts < 30) {
        attempts++;
        setTimeout(find, 300);
      } else if (step.advanceWhenGone) {
        // Element was never found (pipeline not running) — skip this step
        advanceRef.current();
        return;
      }
    };

    // Delay search to let the tooltip fade out first
    const delay = setTimeout(find, 500);

    // For advanceWhenGone steps, keep polling even after element is found
    // to detect when it disappears
    let pollInterval: ReturnType<typeof setInterval> | null = null;
    if (step.advanceWhenGone) {
      pollInterval = setInterval(() => {
        if (cancelled) return;
        const el = step.targetElement
          ? (document.querySelector(step.targetElement) as HTMLElement)
          : null;
        if (el) {
          wasFound = true;
          setAnchorElement(el);
        } else if (wasFound) {
          // Was visible, now gone — pipeline completed
          advanceRef.current();
        }
      }, 1000);
    }

    return () => {
      cancelled = true;
      clearTimeout(delay);
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [state.currentStep, state.isActive, state.completed, pathname, isAuthenticated]);

  const startOnboarding = useCallback(() => {
    setAnchorElement(null);
    const fresh: OnboardingState = {
      isActive: true,
      currentStep: 0,
      steps: ONBOARDING_STEPS.map(s => ({ ...s, completed: false })),
      completed: false,
    };
    saveOnboardingState(fresh);
    setState(fresh);
  }, []);

  const completeCurrentStep = useCallback(() => {
    const step = state.steps[state.currentStep];
    if (step) {
      const next = completeStep(step.id);
      setState(next);
      setAnchorElement(null); // force re-find for next step
    }
  }, [state]);

  const goToStep = useCallback((idx: number) => {
    if (idx >= 0 && idx < state.steps.length) {
      const next = { ...state, currentStep: idx };
      setState(next);
      saveOnboardingState(next);
      setAnchorElement(null);
    }
  }, [state]);

  const handleNext = useCallback(() => {
    if (state.currentStep < state.steps.length - 1) {
      const next = { ...state, currentStep: state.currentStep + 1 };
      setState(next);
      saveOnboardingState(next);
      setAnchorElement(null);
    }
  }, [state]);

  advanceRef.current = handleNext;

  const handlePrevious = useCallback(() => {
    if (state.currentStep > 0) {
      const next = { ...state, currentStep: state.currentStep - 1 };
      setState(next);
      saveOnboardingState(next);
      setAnchorElement(null);
    }
  }, [state]);

  const handleSkip = useCallback(() => {
    skipOnboarding();
    setState({ isActive: false, currentStep: 0, steps: state.steps, completed: true });
    setAnchorElement(null);
  }, [state.steps]);

  const handleComplete = useCallback(() => {
    completeCurrentStep();
  }, [completeCurrentStep]);

  const currentStep = state.steps[state.currentStep];
  const tutorialActive = isAuthenticated && state.isActive && !state.completed && currentStep;
  const showTooltip = tutorialActive && anchorElement;

  return (
    <OnboardingContext.Provider
      value={{
        state,
        startOnboarding,
        completeCurrentStep,
        goToStep,
        skip: handleSkip,
        isActive: state.isActive && !state.completed,
      }}
    >
      {children}
      {tutorialActive && (
        <OnboardingTooltip
          step={currentStep}
          currentStepIndex={state.currentStep}
          totalSteps={state.steps.length}
          onNext={handleNext}
          onPrevious={handlePrevious}
          onSkip={handleSkip}
          onComplete={handleComplete}
          anchorElement={anchorElement}
        />
      )}
    </OnboardingContext.Provider>
  );
}
