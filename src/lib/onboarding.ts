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
  // ── Settings ──
  {
    id: "nav-settings",
    title: "Open Settings",
    description: "First, let's set your tax jurisdiction. Click Settings in the sidebar.",
    targetElement: "[data-onboarding='nav-settings']",
  },
  {
    id: "select-country",
    title: "Select Your Country",
    description: "Choose your tax jurisdiction. This determines cost basis rules, holding periods, and report formats.",
    targetPage: "/settings",
    targetElement: "[data-onboarding='select-country']",
  },

  // ── Accounts ──
  {
    id: "nav-accounts",
    title: "Go to Accounts",
    description: "Now let's connect your wallets and exchanges. Click Accounts.",
    targetElement: "[data-onboarding='nav-accounts']",
  },
  {
    id: "add-account",
    title: "Add an Account",
    description: "Click Add Account to connect a wallet, exchange, or import a CSV. After adding, we'll automatically sync, pull prices, and compute cost basis.",
    targetPage: "/accounts",
    targetElement: "[data-onboarding='connect-wallet']",
  },

  // ── Transactions ──
  {
    id: "nav-transactions",
    title: "Review Transactions",
    description: "After syncing, check your transaction data. Click Transactions.",
    targetElement: "[data-onboarding='nav-transactions']",
  },
  {
    id: "view-transactions",
    title: "Your Transaction Ledger",
    description: "This is your full transaction history. Check types, prices, and gain/loss. You can filter, edit, or reclassify any transaction.",
    targetPage: "/transactions",
    targetElement: "[data-onboarding='review-transactions']",
  },

  // ── Tax Reports ──
  {
    id: "nav-reports",
    title: "Generate Tax Reports",
    description: "Time to download your tax forms. Click Tax Reports.",
    targetElement: "[data-onboarding='nav-tax-reports']",
  },
  {
    id: "download-reports",
    title: "Download Your Forms",
    description: "Here are your tax reports — Form 8949, Schedule D, and CSV exports. Download what you need for your jurisdiction.",
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
