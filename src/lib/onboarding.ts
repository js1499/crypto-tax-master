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
    description: "Click the Preferences tab, then choose your tax jurisdiction. This determines cost basis rules, holding periods, and report formats.",
    targetPage: "/settings",
    targetElement: "[data-onboarding='select-country']",
  },

  // ── Accounts ──
  {
    id: "nav-accounts",
    title: "Go to Accounts",
    description: "Now let's connect your wallets and exchanges. Click Accounts in the sidebar.",
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
    description: "After syncing, check your transaction data. Click Transactions in the sidebar.",
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
    description: "Time to download your tax forms. Click Tax Reports in the sidebar.",
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
 * TESTING MODE: Set to true to force onboarding for every user.
 * Set back to false before shipping to production.
 */
const FORCE_ONBOARDING = true;

function freshState(): OnboardingState {
  return {
    isActive: true,
    currentStep: 0,
    steps: ONBOARDING_STEPS.map((step) => ({ ...step, completed: false })),
    completed: false,
  };
}

/**
 * Get onboarding state from localStorage
 */
export function getOnboardingState(): OnboardingState {
  if (typeof window === "undefined") {
    return { isActive: false, currentStep: 0, steps: [], completed: true };
  }

  try {
    const stored = localStorage.getItem("onboarding_v2");
    if (stored) {
      const parsed = JSON.parse(stored);

      // If actively in progress, return stored state (preserves currentStep across reloads)
      if (parsed.isActive && !parsed.completed) {
        const currentStep = (parsed.currentStep || 0) < ONBOARDING_STEPS.length
          ? (parsed.currentStep || 0)
          : 0;
        // Validate step count matches — if steps were added/removed, reset
        const storedStepCount = parsed.steps?.length || 0;
        if (storedStepCount !== ONBOARDING_STEPS.length) {
          const fresh = freshState();
          saveOnboardingState(fresh);
          return fresh;
        }
        return {
          isActive: true,
          currentStep,
          steps: ONBOARDING_STEPS.map((step, i) => ({
            ...step,
            completed: parsed.steps?.[i]?.completed || false,
          })),
          completed: false,
        };
      }

      // Completed or skipped
      if (FORCE_ONBOARDING) {
        // Testing: restart automatically
        const fresh = freshState();
        saveOnboardingState(fresh);
        return fresh;
      }

      // Production: stay completed
      return {
        isActive: false,
        currentStep: 0,
        steps: ONBOARDING_STEPS.map((step) => ({ ...step, completed: true })),
        completed: true,
      };
    }
  } catch {
    // Corrupted — start fresh
  }

  // No stored state — start fresh
  const fresh = freshState();
  saveOnboardingState(fresh);
  return fresh;
}

/**
 * Save onboarding state to localStorage
 */
export function saveOnboardingState(state: OnboardingState): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem("onboarding_v2", JSON.stringify(state));
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
  localStorage.removeItem("onboarding_v2");
}

/**
 * Check if user should see onboarding
 */
export function shouldShowOnboarding(): boolean {
  const state = getOnboardingState();
  return state.isActive && !state.completed;
}
