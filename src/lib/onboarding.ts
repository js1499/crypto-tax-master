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
    id: "select-country",
    title: "Set Your Tax Jurisdiction",
    description: "Click the dropdown and select your country. This determines your cost basis method, holding period rules, and tax report formats.",
    targetPage: "/settings",
    targetElement: "[data-onboarding='select-country']",
  },
  {
    id: "connect-account",
    title: "Add Your First Account",
    description: "Click here to connect a wallet or exchange. You can add Solana, Ethereum, Bitcoin wallets, or link exchanges like Coinbase and Binance.",
    targetPage: "/accounts",
    targetElement: "[data-onboarding='connect-wallet']",
  },
  {
    id: "review-transactions",
    title: "Review Your Transactions",
    description: "After syncing, your transactions appear here. Check that types are correct, prices are filled, and nothing is missing. You can edit or reclassify any transaction.",
    targetPage: "/transactions",
    targetElement: "[data-onboarding='review-transactions']",
  },
  {
    id: "download-reports",
    title: "Download Your Tax Reports",
    description: "Your tax forms are ready! Download Schedule D, Form 8949, and CSV exports. We generate the right reports for your jurisdiction automatically.",
    targetPage: "/tax-reports",
    targetElement: "[data-onboarding='download-reports']",
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
