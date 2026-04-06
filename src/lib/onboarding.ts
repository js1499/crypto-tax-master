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
    id: "nav-settings",
    title: "Set Your Country",
    description: "Click Settings to choose your tax jurisdiction (US, UK, or Germany). This determines how your taxes are calculated.",
    targetElement: "[data-onboarding='nav-settings']",
  },
  {
    id: "nav-accounts",
    title: "Connect Your Accounts",
    description: "Click Accounts to connect wallets and exchanges. We'll sync transactions, pull prices, and compute cost basis automatically.",
    targetElement: "[data-onboarding='nav-accounts']",
  },
  {
    id: "nav-transactions",
    title: "Review Transactions",
    description: "Click Transactions to see your imported data. Verify types, prices, and categories are correct. You can edit anything.",
    targetElement: "[data-onboarding='nav-transactions']",
  },
  {
    id: "nav-reports",
    title: "Download Tax Reports",
    description: "Click Tax Reports to generate IRS forms (Form 8949, Schedule D) and CSV exports for your tax filing.",
    targetElement: "[data-onboarding='nav-tax-reports']",
  },
  {
    id: "nav-tutorial",
    title: "Need More Help?",
    description: "Click Tutorial for a detailed step-by-step guide, or click the ? button anytime to restart this walkthrough.",
    targetElement: "[data-onboarding='nav-tutorial']",
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
