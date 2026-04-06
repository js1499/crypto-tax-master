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
    id: "connect-account",
    title: "Step 1: Add Your Accounts",
    description: "Click Accounts to connect your wallets or exchanges. We'll sync transactions, pull prices, and compute cost basis automatically.",
    // No targetPage — don't navigate. Target the sidebar link which is always visible.
    targetElement: "[data-onboarding='nav-accounts']",
  },
  {
    id: "review-transactions",
    title: "Step 2: Review Transactions",
    description: "Click Transactions to see your imported data. Verify types, prices, and categories. You can edit or reclassify anything.",
    targetElement: "[data-onboarding='nav-transactions']",
  },
  {
    id: "download-reports",
    title: "Step 3: Download Tax Reports",
    description: "Click Tax Reports to generate IRS forms and CSV exports. Set your country in Settings if you're outside the US.",
    targetElement: "[data-onboarding='nav-tax-reports']",
  },
];

/**
 * TESTING MODE: Set to true to force onboarding on every page load for every user.
 * Set back to false before shipping to production.
 */
const FORCE_ONBOARDING = true;

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

  // Testing mode: always start fresh
  if (FORCE_ONBOARDING) {
    return {
      isActive: true,
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
