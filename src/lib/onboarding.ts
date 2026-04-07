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
  /** If true, auto-advance when target is clicked (default true). Set false for steps where user needs to interact then hit Next. */
  autoAdvance?: boolean;
  /** If true, auto-advance when the target element disappears from the DOM. Used for "wait for progress" steps. */
  advanceWhenGone?: boolean;
  completed: boolean;
}

export interface OnboardingState {
  isActive: boolean;
  currentStep: number;
  steps: OnboardingStep[];
  completed: boolean;
}

export const ONBOARDING_STEPS: Omit<OnboardingStep, "completed">[] = [
  // ── Accounts ──
  {
    id: "nav-accounts",
    title: "Connect Your Accounts",
    description: "Let's connect your wallets and exchanges. Click Accounts in the sidebar.",
    targetElement: "[data-onboarding='nav-accounts']",
  },
  {
    id: "click-add-account",
    title: "Add an Account",
    description: "Click Add Account, then choose 'Add One Account' or 'Add Multiple' from the dropdown.",
    targetPage: "/accounts",
    targetElement: "[data-onboarding='connect-wallet']",
  },
  {
    id: "add-account-dialog",
    title: "Set Up Your Account",
    description: "Use the Wallets tab to connect on-chain wallets (SOL, ETH, BTC), the Exchanges tab for API connections (Coinbase, Binance), or CSV Upload to import transaction files. Enter your details and click Add & Sync.",
    targetElement: "[data-onboarding='add-account-dialog']",
    autoAdvance: false,
    advanceWhenGone: true,
  },
  {
    id: "confirm-accounts",
    title: "All Accounts Added?",
    description: "If you need to add more wallets or exchanges, click Add Account again. Otherwise, click Next to continue.",
    targetPage: "/accounts",
    targetElement: "[data-onboarding='connect-wallet']",
    autoAdvance: false,
  },
  {
    id: "wait-for-sync",
    title: "Syncing in Progress",
    description: "Your accounts are being synced, prices pulled, and cost basis computed. This runs automatically in the background. Once the progress bar completes, we'll move to the next step.",
    targetElement: "[data-onboarding='pipeline-progress']",
    autoAdvance: false,
    advanceWhenGone: true,
  },

  // ── Transactions ──
  {
    id: "nav-transactions",
    title: "Review Your Transactions",
    description: "Syncing is complete! Click Transactions to review your data.",
    targetElement: "[data-onboarding='nav-transactions']",
  },
  {
    id: "view-transactions",
    title: "Your Transaction Ledger",
    description: "This is your full transaction history. Verify types, prices, and gain/loss are correct. You can filter, search, edit, or reclassify any transaction. You can always come back here for a deeper review after completing the tutorial.",
    targetPage: "/transactions",
    targetElement: "[data-onboarding='review-transactions']",
    autoAdvance: false,
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
    title: "Your Required Tax Forms",
    description: "For US taxpayers, you'll need: Schedule D (capital gains summary), Form 8949 (detailed transaction list), and Schedule 1 (crypto income). TurboTax-compatible CSV exports are also available. Download what you need!",
    targetPage: "/tax-reports",
    targetElement: "[data-onboarding='download-reports']",
    autoAdvance: false,
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
