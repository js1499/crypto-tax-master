import prisma from "@/lib/prisma";
import { PLANS, PlanKey } from "@/lib/stripe";

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active", "trialing"]);

/**
 * Returns the current filing tax year.
 * Example: in calendar year 2026, users are generally filing for 2025.
 */
export function getCurrentFilingTaxYear(referenceDate: Date = new Date()): number {
  return referenceDate.getUTCFullYear() - 1;
}

/** The tax year that transaction limits apply to. */
export const LIMIT_TAX_YEAR = getCurrentFilingTaxYear();

function getTaxYearBounds(taxYear: number) {
  return {
    start: new Date(`${taxYear}-01-01T00:00:00Z`),
    end: new Date(`${taxYear}-12-31T23:59:59.999Z`),
  };
}

function isSubscriptionEntitled(status: string | null | undefined): boolean {
  return !!status && ACTIVE_SUBSCRIPTION_STATUSES.has(status);
}

/**
 * Annual subscriptions unlock the most recently completed tax year.
 * Example: a term ending in 2027 unlocks tax year 2025; renewal to 2028 unlocks 2026.
 */
export function getLicensedThroughTaxYear(currentPeriodEnd: Date | null | undefined): number | null {
  if (!currentPeriodEnd) return null;
  return currentPeriodEnd.getUTCFullYear() - 2;
}

export interface UserPlan {
  billingPlanKey: PlanKey;
  billingPlanName: string;
  planKey: PlanKey;
  planName: string;
  transactionLimit: number;
  walletLimit: number;
  features: typeof PLANS.free.features;
  subscriptionStatus: string | null;
  currentPeriodEnd: Date | null;
  licensedThroughTaxYear: number | null;
  isPaid: boolean;
}

export function getPlanTransactionLimitTaxYear(
  plan: Pick<UserPlan, "isPaid" | "licensedThroughTaxYear">,
): number {
  return plan.isPaid && plan.licensedThroughTaxYear !== null
    ? plan.licensedThroughTaxYear
    : LIMIT_TAX_YEAR;
}

export function canAccessTaxYear(
  plan: Pick<UserPlan, "isPaid" | "licensedThroughTaxYear">,
  year: number,
): boolean {
  if (!plan.isPaid) {
    return true;
  }

  return plan.licensedThroughTaxYear !== null && year <= plan.licensedThroughTaxYear;
}

export function getTaxYearAccessMessage(
  plan: Pick<UserPlan, "planName" | "licensedThroughTaxYear">,
  year: number,
): string {
  if (plan.licensedThroughTaxYear === null) {
    return "Your subscription is missing its license renewal date. Please contact support.";
  }

  const nextTaxYear = plan.licensedThroughTaxYear + 1;
  return `Your ${plan.planName} annual license currently covers tax year ${plan.licensedThroughTaxYear} and earlier. Renew to unlock ${nextTaxYear} reports, including ${year}.`;
}

/**
 * Get a user's current plan and limits from the database.
 */
export async function getUserPlan(userId: string): Promise<UserPlan> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { planId: true, subscriptionStatus: true, currentPeriodEnd: true },
  });

  const billingPlanKey = (user?.planId || "free") as PlanKey;
  const billingPlan = PLANS[billingPlanKey] || PLANS.free;
  const subscriptionStatus = user?.subscriptionStatus || null;
  const currentPeriodEnd = user?.currentPeriodEnd || null;
  const isPaid = billingPlanKey !== "free" && isSubscriptionEntitled(subscriptionStatus);
  const licensedThroughTaxYear = isPaid ? getLicensedThroughTaxYear(currentPeriodEnd) : null;
  const effectivePlan = isPaid ? billingPlan : PLANS.free;

  return {
    billingPlanKey,
    billingPlanName: billingPlan.name,
    planKey: isPaid ? billingPlanKey : "free",
    planName: effectivePlan.name,
    transactionLimit: effectivePlan.transactionLimit,
    walletLimit: effectivePlan.walletLimit,
    features: effectivePlan.features,
    subscriptionStatus,
    currentPeriodEnd,
    licensedThroughTaxYear,
    isPaid,
  };
}

/**
 * Check if a user has exceeded their wallet limit.
 */
export async function checkWalletLimit(userId: string): Promise<{ allowed: boolean; current: number; limit: number }> {
  const plan = await getUserPlan(userId);
  const walletCount = await prisma.wallet.count({ where: { userId } });
  return {
    allowed: walletCount < plan.walletLimit,
    current: walletCount,
    limit: plan.walletLimit,
  };
}

/**
 * Build the ownership OR filter for a user's transactions.
 */
async function buildOwnershipFilter(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { wallets: true, exchanges: true },
  });
  const walletAddresses = user?.wallets.map(w => w.address) || [];
  const exchangeNames = user?.exchanges.map(e => e.name) || [];

  const conditions: any[] = [];
  if (walletAddresses.length > 0) {
    conditions.push({ wallet_address: { in: walletAddresses } });
  }
  conditions.push({ source_type: "csv_import", userId });
  if (exchangeNames.length > 0) {
    conditions.push({ source_type: "exchange_api", source: { in: exchangeNames } });
  }

  return conditions.length > 0 ? conditions : [{ userId }];
}

/**
 * Count a user's transactions for a specific tax year.
 * Only tax-year transactions count against the plan limit.
 */
export async function countUserTransactions(userId: string, taxYear: number = LIMIT_TAX_YEAR): Promise<number> {
  const orConditions = await buildOwnershipFilter(userId);
  const { start, end } = getTaxYearBounds(taxYear);

  return prisma.transaction.count({
    where: {
      OR: orConditions,
      tx_timestamp: { gte: start, lte: end },
    },
  });
}

/**
 * Check if a user has exceeded their transaction limit for the tax year.
 */
export async function checkTransactionLimit(userId: string): Promise<{ allowed: boolean; current: number; limit: number }> {
  const plan = await getUserPlan(userId);
  const txCount = await countUserTransactions(userId, getPlanTransactionLimitTaxYear(plan));

  return {
    allowed: txCount < plan.transactionLimit,
    current: txCount,
    limit: plan.transactionLimit,
  };
}
