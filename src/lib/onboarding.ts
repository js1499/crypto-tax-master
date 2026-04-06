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
    description: "First, let's configure your tax jurisdiction. Click Settings in the sidebar.",
    targetElement: "[data-onboarding='nav-settings']",
  },
  {
    id: "click-preferences",
    title: "Go to Preferences",
    description: "Click the Preferences tab to find your tax settings.",
    targetPage: "/settings",
    targetElement: "[data-onboarding='select-country']",
  },
  {
    id: "select-jurisdiction",
    title: "Select Your Country",
    description: "Choose your tax jurisdiction from the dropdown. This determines cost basis method, holding period rules, and which tax forms are generated.",
    targetPage: "/settings",
    targetElement: "#tax-jurisdiction",
  },

  // ── Accounts ──
  {
    id: "nav-accounts",
    title: "Connect Your Accounts",
    description: "Now let's connect your wallets and exchanges. Click Accounts in the sidebar.",
    targetElement: "[data-onboarding='nav-accounts']",
  },
  {
    id: "add-account",
    title: "Add Your Accounts",
    description: "Click Add Account to connect wallets, exchanges, or import CSVs. You can add one at a time or add multiple. After adding, we'll automatically sync transactions, pull prices, and compute cost basis.",
    targetPage: "/accounts",
    targetElement: "[data-onboarding='connect-wallet']",
  },

  // ── Transactions ──
  {
    id: "nav-transactions",
    title: "Review Your Transactions",
    description: "Once your wallets are synced and the progress bar completes, click Transactions to review your data.",
    targetElement: "[data-onboarding='nav-transactions']",
  },
  {
    id: "view-transactions",
    title: "Your Transaction Ledger",
    description: "This is your full transaction history. Verify types, prices, and gain/loss are correct. You can filter, edit, or reclassify any transaction.",
    targetPage: "/transactions",
    targetElement: "[data-onboarding='review-transactions']",
  },

  // ── Tax Reports ──
  {
    id: "nav-reports",
    title: "Download Tax Reports",
    description: "Once syncing is complete, click Tax Reports to generate your tax forms.",
    targetElement: "[data-onboarding='nav-tax-reports']",
  },
  {
    id: "download-reports",
    title: "Your Tax Forms",
    description: "Download your required IRS forms here: Schedule D (capital gains summary), Form 8949 (detailed transactions), and Schedule 1 (crypto income). CSV exports for TurboTax are also available.",
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
