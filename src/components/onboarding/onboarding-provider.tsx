"use client";

import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  getOnboardingState,
  saveOnboardingState,
  completeStep,
  skipOnboarding,
  shouldShowOnboarding,
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

const OnboardingContext = createContext<OnboardingContextType | undefined>(
  undefined
);

export function useOnboarding(): OnboardingContextType {
  const context = useContext(OnboardingContext);
  if (!context) {
    // Return a default context if not within provider (for optional usage)
    const defaultState: OnboardingState = {
      isActive: false,
      currentStep: 0,
      steps: [],
      completed: true,
    };
    return {
      state: defaultState,
      startOnboarding: () => {},
      completeCurrentStep: () => {},
      goToStep: () => {},
      skip: () => {},
      isActive: false,
    };
  }
  return context;
}

interface OnboardingProviderProps {
  children: React.ReactNode;
}

export function OnboardingProvider({ children }: OnboardingProviderProps) {
  const [state, setState] = useState<OnboardingState>(() =>
    getOnboardingState()
  );
  const [anchorElement, setAnchorElement] = useState<HTMLElement | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const isAuthenticated = status === "authenticated";

  // Check if user has wallets/exchanges connected
  // Use ref to prevent infinite loops
  const checkingRef = useRef(false);
  
  const checkStepCompletion = useCallback(async () => {
    // Prevent concurrent execution
    if (checkingRef.current) return;
    
    // Don't make API calls if user is not authenticated
    if (!isAuthenticated) {
      return;
    }
    
    // Use current state from localStorage (not state variable to avoid dependency)
    const currentState = getOnboardingState();
    if (!currentState.isActive || currentState.completed) {
      checkingRef.current = false;
      return;
    }
    
    checkingRef.current = true;

    // Steps are now advanced by clicking the highlighted target element.
    // No auto-completion needed — the tooltip click handler does it.
    checkingRef.current = false;
  }, [isAuthenticated]);

  useEffect(() => {
    // Load state on mount
    setState(getOnboardingState());
  }, []); // Only run on mount

  // Separate effect for periodic checking
  // Use a ref to store the latest checkStepCompletion to avoid dependency issues
  const checkStepCompletionRef = useRef(checkStepCompletion);
  useEffect(() => {
    checkStepCompletionRef.current = checkStepCompletion;
  }, [checkStepCompletion]);

  useEffect(() => {
    // Don't check if session is still loading
    if (status === "loading") return;
    
    // Only check if user is authenticated and onboarding is active
    if (!isAuthenticated || !state.isActive || state.completed) return;

    // Only check once when onboarding becomes active and user is authenticated
    // This prevents rate limiting from too many API calls
    const timeout = setTimeout(() => {
      checkStepCompletionRef.current();
    }, 2000); // Wait 2 seconds after authentication to avoid race conditions

    return () => {
      clearTimeout(timeout);
    };
    // Only depend on state flags and authentication, not the callback
  }, [state.isActive, state.completed, isAuthenticated, status]);

  // Find anchor element for current step
  useEffect(() => {
    console.log("[Onboarding] Effect fired:", { isActive: state.isActive, completed: state.completed, currentStep: state.currentStep, pathname, isAuthenticated, status });

    if (!state.isActive || state.completed) {
      console.log("[Onboarding] Inactive or completed, clearing anchor");
      setAnchorElement(null);
      return;
    }

    const currentStep = state.steps[state.currentStep];
    if (!currentStep) {
      console.log("[Onboarding] No current step at index", state.currentStep);
      setAnchorElement(null);
      return;
    }

    console.log("[Onboarding] Current step:", currentStep.id, "target:", currentStep.targetPage, currentStep.targetElement);

    // Don't navigate if not yet authenticated
    if (!isAuthenticated) {
      console.log("[Onboarding] Not authenticated yet, waiting...");
      return;
    }

    // Navigate to target page if needed
    const isPublicPage = pathname === "/login" || pathname === "/register";
    const normalizedPath = pathname.replace(/\/$/, "") || "/";
    const targetPath = currentStep.targetPage?.replace(/\/$/, "") || "";

    if (targetPath && normalizedPath !== targetPath && !isPublicPage) {
      console.log("[Onboarding] Navigating from", normalizedPath, "to", targetPath);
      router.push(targetPath);
      return;
    }

    console.log("[Onboarding] On correct page, looking for element:", currentStep.targetElement);

    // Find the target element with retries
    let attempts = 0;
    const maxAttempts = 20;

    const findElement = () => {
      if (currentStep.targetElement) {
        const element = document.querySelector(currentStep.targetElement) as HTMLElement;
        if (element) {
          console.log("[Onboarding] Found element!", currentStep.targetElement);
          setAnchorElement(element);
          element.scrollIntoView({ behavior: "smooth", block: "center" });
          return true;
        }
      }
      setAnchorElement(null);
      return false;
    };

    if (findElement()) return;

    const interval = setInterval(() => {
      attempts++;
      if (findElement() || attempts >= maxAttempts) {
        if (attempts >= maxAttempts) console.log("[Onboarding] Gave up finding element after", maxAttempts, "attempts");
        clearInterval(interval);
      }
    }, 250);

    return () => clearInterval(interval);
  }, [state.currentStep, state.isActive, state.completed, pathname, isAuthenticated, status]);

  const startOnboarding = () => {
    // Force a fresh start — briefly set inactive then active to ensure React detects the change
    setAnchorElement(null);
    const newState: OnboardingState = {
      isActive: true,
      currentStep: 0,
      steps: ONBOARDING_STEPS.map((step) => ({ ...step, completed: false })),
      completed: false,
    };
    setState(newState);
    saveOnboardingState(newState);
  };

  const completeCurrentStep = () => {
    const currentStep = state.steps[state.currentStep];
    if (currentStep) {
      const newState = completeStep(currentStep.id);
      setState(newState);
    }
  };

  const goToStep = (stepIndex: number) => {
    if (stepIndex >= 0 && stepIndex < state.steps.length) {
      const newState = { ...state, currentStep: stepIndex };
      setState(newState);
      saveOnboardingState(newState);
    }
  };

  const handleNext = () => {
    if (state.currentStep < state.steps.length - 1) {
      const newState = { ...state, currentStep: state.currentStep + 1 };
      setState(newState);
      saveOnboardingState(newState);
    }
  };

  const handlePrevious = () => {
    if (state.currentStep > 0) {
      const newState = { ...state, currentStep: state.currentStep - 1 };
      setState(newState);
      saveOnboardingState(newState);
    }
  };

  const handleSkip = () => {
    skipOnboarding();
    // Set state directly (don't re-read from getOnboardingState which
    // may return fresh state in FORCE_ONBOARDING testing mode)
    setState({
      isActive: false,
      currentStep: 0,
      steps: state.steps,
      completed: true,
    });
  };

  const handleComplete = () => {
    const currentStep = state.steps[state.currentStep];
    if (currentStep) {
      completeCurrentStep();
    }
  };

  const currentStep = state.steps[state.currentStep];

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
      {isAuthenticated && state.isActive && !state.completed && currentStep && anchorElement && (
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
