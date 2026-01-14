/**
 * Onboarding state management
 * Tracks user progress through the onboarding flow
 */

export interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  targetPage?: string;
  targetElement?: string;
  completed: boolean;
}

export interface OnboardingState {
  isActive: boolean;
  currentStep: number;
  steps: OnboardingStep[];
  completed: boolean;
}

export const ONBOARDING_STEPS: Omit<OnboardingStep, "completed">[] = [
  {
    id: "connect-wallet",
    title: "Connect Your Wallet or Exchange",
    description: "Start by connecting your crypto wallets or exchanges. This allows us to automatically import your transactions.",
    targetPage: "/accounts",
    targetElement: "[data-onboarding='connect-wallet']",
  },
  {
    id: "import-transactions",
    title: "Import Transactions",
    description: "Import your transaction history from exchanges or upload CSV files. We'll automatically categorize and organize them.",
    targetPage: "/transactions",
    targetElement: "[data-onboarding='import-transactions']",
  },
  {
    id: "review-transactions",
    title: "Review & Categorize Transactions",
    description: "Review your imported transactions and make sure they're correctly categorized. You can edit types, add notes, and mark duplicates.",
    targetPage: "/transactions",
    targetElement: "[data-onboarding='review-transactions']",
  },
  {
    id: "generate-report",
    title: "Generate Tax Report",
    description: "Once your transactions are reviewed, generate your tax report. We'll calculate capital gains, losses, and create IRS Form 8949.",
    targetPage: "/tax-reports",
    targetElement: "[data-onboarding='generate-report']",
  },
];

/**
 * Get onboarding state from localStorage
 */
export function getOnboardingState(): OnboardingState {
  if (typeof window === "undefined") {
    return {
      isActive: false,
      currentStep: 0,
      steps: ONBOARDING_STEPS.map((step) => ({ ...step, completed: false })),
      completed: false,
    };
  }

  try {
    const stored = localStorage.getItem("onboarding_state");
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        ...parsed,
        steps: ONBOARDING_STEPS.map((step, index) => ({
          ...step,
          completed: parsed.steps?.[index]?.completed || false,
        })),
      };
    }
  } catch (error) {
    console.error("[Onboarding] Error reading state:", error);
  }

  return {
    isActive: true,
    currentStep: 0,
    steps: ONBOARDING_STEPS.map((step) => ({ ...step, completed: false })),
    completed: false,
  };
}

/**
 * Save onboarding state to localStorage
 */
export function saveOnboardingState(state: OnboardingState): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem("onboarding_state", JSON.stringify(state));
  } catch (error) {
    console.error("[Onboarding] Error saving state:", error);
  }
}

/**
 * Mark a step as completed
 */
export function completeStep(stepId: string): OnboardingState {
  const state = getOnboardingState();
  const stepIndex = state.steps.findIndex((s) => s.id === stepId);

  if (stepIndex !== -1) {
    state.steps[stepIndex].completed = true;

    // Move to next step if not completed
    if (state.currentStep === stepIndex && !state.completed) {
      if (stepIndex < state.steps.length - 1) {
        state.currentStep = stepIndex + 1;
      } else {
        state.completed = true;
        state.isActive = false;
      }
    }

    saveOnboardingState(state);
  }

  return state;
}

/**
 * Skip onboarding
 */
export function skipOnboarding(): void {
  const state = getOnboardingState();
  state.isActive = false;
  state.completed = true;
  saveOnboardingState(state);
}

/**
 * Reset onboarding (for testing)
 */
export function resetOnboarding(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem("onboarding_state");
}

/**
 * Check if user should see onboarding
 */
export function shouldShowOnboarding(): boolean {
  const state = getOnboardingState();
  return state.isActive && !state.completed;
}
