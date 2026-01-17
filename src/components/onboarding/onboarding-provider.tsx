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

    try {
      // Check if wallet/exchange is connected (Step 1)
      if (!currentState.steps[0]?.completed) {
        const [walletsRes, exchangesRes] = await Promise.all([
          fetch("/api/wallets", { credentials: "include" }).catch(() => ({ ok: false, json: async () => ({ wallets: [] }) })),
          fetch("/api/exchanges", { credentials: "include" }).catch(() => ({ ok: false, json: async () => ({ exchanges: [] }) })),
        ]);

        const hasWallets =
          walletsRes?.ok &&
          (await walletsRes.json()).wallets?.length > 0;
        const hasExchanges =
          exchangesRes?.ok &&
          (await exchangesRes.json()).exchanges?.length > 0;

        if (hasWallets || hasExchanges) {
          const newState = completeStep("connect-wallet");
          setState(newState);
        }
      }

      // Check if transactions exist (Step 2)
      if (!currentState.steps[1]?.completed) {
        const transactionsRes = await fetch(
          "/api/transactions?page=1&limit=1",
          { credentials: "include" }
        ).catch(() => null);

        if (transactionsRes?.ok) {
          const data = await transactionsRes.json();
          if (data.transactions?.length > 0) {
            const newState = completeStep("import-transactions");
            setState(newState);
          }
        }
      }
    } catch (error) {
      if (process.env.NODE_ENV === "development") {
        console.error("[Onboarding] Error checking completion:", error);
      }
    } finally {
      checkingRef.current = false;
    }
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
  }, [state.isActive, state.completed, isAuthenticated]);

  // Find anchor element for current step
  useEffect(() => {
    if (!state.isActive || state.completed) {
      setAnchorElement(null);
      return;
    }

    const currentStep = state.steps[state.currentStep];
    if (!currentStep) {
      setAnchorElement(null);
      return;
    }

    // Navigate to target page if needed
    if (currentStep.targetPage && pathname !== currentStep.targetPage) {
      router.push(currentStep.targetPage);
      return;
    }

    // Wait for page to load, then find element
    const findElement = () => {
      if (currentStep.targetElement) {
        const element = document.querySelector(
          currentStep.targetElement
        ) as HTMLElement;
        if (element) {
          setAnchorElement(element);
          // Scroll element into view
          element.scrollIntoView({ behavior: "smooth", block: "center" });
        } else {
          // If element not found, show tooltip in center
          setAnchorElement(null);
        }
      } else {
        setAnchorElement(null);
      }
    };

    // Wait a bit for page to render
    const timeout = setTimeout(findElement, 300);
    findElement(); // Also try immediately

    return () => clearTimeout(timeout);
  }, [state.currentStep, state.isActive, state.completed, pathname, router]);

  const startOnboarding = () => {
    const newState: OnboardingState = {
      isActive: true,
      currentStep: 0,
      steps: state.steps.map((s) => ({ ...s, completed: false })),
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
    setState(getOnboardingState());
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
      {state.isActive && !state.completed && currentStep && (
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
