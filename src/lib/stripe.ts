import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-03-25.dahlia",
});

/**
 * Plan configuration - maps plan keys to Stripe price IDs and feature limits.
 * The single source of truth for what each plan includes.
 */
export type PlanKey =
  | "free"
  | "starter"
  | "active"
  | "pro"
  | "prime"
  | "starter_dfy"
  | "active_dfy"
  | "pro_dfy"
  | "prime_dfy";
export type PaidPlanKey = Exclude<PlanKey, "free">;

export interface PlanConfig {
  name: string;
  priceEnvKey: string;
  transactionLimit: number;
  walletLimit: number;
  features: {
    allReports: boolean;
    taxAi: boolean;
    securities: boolean;
    analytics: boolean;
    chatSupport: boolean;
    dfy: boolean;
  };
}

export const PLANS: Record<PlanKey, PlanConfig> = {
  free: {
    name: "Trial",
    priceEnvKey: "",
    transactionLimit: Infinity,
    walletLimit: Infinity,
    features: {
      allReports: false,
      taxAi: false,
      securities: false,
      analytics: false,
      chatSupport: false,
      dfy: false,
    },
  },
  starter: {
    name: "Starter",
    priceEnvKey: "STRIPE_PRICE_STARTER",
    transactionLimit: 300,
    walletLimit: 5,
    features: {
      allReports: true,
      taxAi: false,
      securities: false,
      analytics: false,
      chatSupport: false,
      dfy: false,
    },
  },
  active: {
    name: "Active",
    priceEnvKey: "STRIPE_PRICE_ACTIVE",
    transactionLimit: 1000,
    walletLimit: 10,
    features: {
      allReports: true,
      taxAi: true,
      securities: false,
      analytics: false,
      chatSupport: true,
      dfy: false,
    },
  },
  pro: {
    name: "Pro",
    priceEnvKey: "STRIPE_PRICE_PRO",
    transactionLimit: 10000,
    walletLimit: 50,
    features: {
      allReports: true,
      taxAi: true,
      securities: true,
      analytics: true,
      chatSupport: true,
      dfy: false,
    },
  },
  prime: {
    name: "Prime",
    priceEnvKey: "STRIPE_PRICE_PRIME",
    transactionLimit: 100000,
    walletLimit: 100,
    features: {
      allReports: true,
      taxAi: true,
      securities: true,
      analytics: true,
      chatSupport: true,
      dfy: false,
    },
  },
  starter_dfy: {
    name: "Starter - Done For You",
    priceEnvKey: "STRIPE_PRICE_STARTER_DFY",
    transactionLimit: 300,
    walletLimit: 5,
    features: {
      allReports: true,
      taxAi: false,
      securities: false,
      analytics: false,
      chatSupport: false,
      dfy: true,
    },
  },
  active_dfy: {
    name: "Active - Done For You",
    priceEnvKey: "STRIPE_PRICE_ACTIVE_DFY",
    transactionLimit: 1000,
    walletLimit: 10,
    features: {
      allReports: true,
      taxAi: true,
      securities: false,
      analytics: false,
      chatSupport: true,
      dfy: true,
    },
  },
  pro_dfy: {
    name: "Pro - Done For You",
    priceEnvKey: "STRIPE_PRICE_PRO_DFY",
    transactionLimit: 10000,
    walletLimit: 50,
    features: {
      allReports: true,
      taxAi: true,
      securities: true,
      analytics: true,
      chatSupport: true,
      dfy: true,
    },
  },
  prime_dfy: {
    name: "Prime - Done For You",
    priceEnvKey: "STRIPE_PRICE_PRIME_DFY",
    transactionLimit: 100000,
    walletLimit: 100,
    features: {
      allReports: true,
      taxAi: true,
      securities: true,
      analytics: true,
      chatSupport: true,
      dfy: true,
    },
  },
};

export const PAID_PLAN_KEYS: PaidPlanKey[] = [
  "starter",
  "active",
  "pro",
  "prime",
  "starter_dfy",
  "active_dfy",
  "pro_dfy",
  "prime_dfy",
];

function getRequiredEnvValue(key: string): string | null {
  const value = process.env[key];
  if (!value) {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

/** Get the Stripe price ID for a plan */
export function getPriceId(planKey: PlanKey): string | null {
  const plan = PLANS[planKey];
  if (!plan || !plan.priceEnvKey) return null;
  return getRequiredEnvValue(plan.priceEnvKey);
}

/** Get a plan config by its Stripe price ID */
export function getPlanByPriceId(
  priceId: string,
): { key: PlanKey; config: PlanConfig } | null {
  for (const [key, config] of Object.entries(PLANS)) {
    const envKey = config.priceEnvKey;
    if (envKey && getRequiredEnvValue(envKey) === priceId.trim()) {
      return { key: key as PlanKey, config };
    }
  }
  return null;
}
