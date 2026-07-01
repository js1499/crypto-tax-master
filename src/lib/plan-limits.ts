import prisma from "@/lib/prisma";
import { PLANS, PlanKey } from "@/lib/stripe";

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active", "trialing"]);

/**
 * Accounts (by email, case-insensitive) granted unconditional FULL access — unlimited
 * transactions + wallets, every feature, and all tax years. This is evaluated in
 * getUserPlan (the single entitlement chokepoint), so it overrides billing entirely and
 * survives Stripe webhooks (it does not depend on planId / subscriptionStatus). Use for
 * owner / comp accounts.
 */
const UNLIMITED_ACCESS_EMAILS = new Set<string>([
  "aaravsawlani1@gmail.com",
]);

/** A synthetic "everything unlocked, forever" plan for allowlisted accounts. */
function buildUnlimitedPlan(): UserPlan {
  return {
    billingPlanKey: "prime",
    billingPlanName: "Prime",
    planKey: "prime",
    planName: "Prime",
    transactionLimit: Infinity,
    walletLimit: Infinity,
    features: {
      allReports: true,
      taxAi: true,
      securities: true,
      analytics: true,
      chatSupport: true,
      dfy: true,
    },
    subscriptionStatus: "active",
    // Far-future term so any date-derived licensing is unbounded; access is driven by the
    // explicit licensedThroughTaxYear below regardless.
    currentPeriodEnd: new Date("9999-12-31T23:59:59.999Z"),
    licensedThroughTaxYear: 9999, // canAccessTaxYear passes for every real year
    isPaid: true,
  };
}

/**
 * Returns the current filing tax year.
 * Example: in calendar year 2026, users are generally filing for 2025.
 */
export function getCurrentFilingTaxYear(
  referenceDate: Date = new Date(),
): number {
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
export function getLicensedThroughTaxYear(
  currentPeriodEnd: Date | null | undefined,
): number | null {
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

export interface TransactionUsageSummary {
  taxYear: number;
  used: number;
  limit: number;
  isUnlimited: boolean;
  remaining: number | null;
  percentUsed: number;
  isOverLimit: boolean;
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

  return (
    plan.licensedThroughTaxYear !== null && year <= plan.licensedThroughTaxYear
  );
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
    select: { email: true, planId: true, subscriptionStatus: true, currentPeriodEnd: true },
  });

  // Owner / comp accounts: full access, independent of billing.
  if (user?.email && UNLIMITED_ACCESS_EMAILS.has(user.email.toLowerCase())) {
    return buildUnlimitedPlan();
  }

  const billingPlanKey = (user?.planId || "free") as PlanKey;
  const billingPlan = PLANS[billingPlanKey] || PLANS.free;
  const subscriptionStatus = user?.subscriptionStatus || null;
  const currentPeriodEnd = user?.currentPeriodEnd || null;
  const isPaid =
    billingPlanKey !== "free" && isSubscriptionEntitled(subscriptionStatus);
  // A free trial's period end is only ~30 days out, which would otherwise
  // license a stale tax year. Grant the current filing year during the trial
  // so it delivers full access to this season's reports.
  const isTrialing = subscriptionStatus === "trialing";
  const licensedThroughTaxYear = isPaid
    ? isTrialing
      ? getCurrentFilingTaxYear()
      : getLicensedThroughTaxYear(currentPeriodEnd)
    : null;
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
export async function checkWalletLimit(
  userId: string,
): Promise<{ allowed: boolean; current: number; limit: number }> {
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
  // Tenant isolation: a row is the user's if it's from one of their wallets
  // (wallet_address) OR explicitly owned by them (userId, for CSV/exchange).
  // Drops the leaky exchange `source`-name branch (a name is not user-unique) but
  // keeps wallet_address scoping, which is safe (a user only matches addresses they
  // added) and preserves rows on wallets shared between users.
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { wallets: true },
  });
  const walletAddresses = user?.wallets.map((w) => w.address) || [];
  return [
    { wallet_address: { in: walletAddresses } },
    { userId },
  ];
}

/**
 * Count a user's transactions for a specific tax year.
 * Only tax-year transactions count against the plan limit.
 */
export async function countUserTransactions(
  userId: string,
  taxYear: number = LIMIT_TAX_YEAR,
): Promise<number> {
  const orConditions = await buildOwnershipFilter(userId);
  const { start, end } = getTaxYearBounds(taxYear);

  return prisma.transaction.count({
    where: {
      OR: orConditions,
      tx_timestamp: { gte: start, lte: end },
    },
  });
}

export async function getTransactionUsageSummary(
  userId: string,
  plan?: UserPlan,
): Promise<TransactionUsageSummary> {
  const resolvedPlan = plan ?? (await getUserPlan(userId));
  const taxYear = getPlanTransactionLimitTaxYear(resolvedPlan);
  const used = await countUserTransactions(userId, taxYear);
  const limit = resolvedPlan.transactionLimit;
  const isUnlimited = !Number.isFinite(limit);

  return {
    taxYear,
    used,
    limit,
    isUnlimited,
    remaining: isUnlimited ? null : Math.max(limit - used, 0),
    percentUsed:
      isUnlimited || limit <= 0
        ? 0
        : Math.min(Math.round((used / limit) * 100), 100),
    isOverLimit: !isUnlimited && used > limit,
  };
}

/**
 * Check if a user has exceeded their transaction limit for the tax year.
 */
export async function checkTransactionLimit(
  userId: string,
): Promise<{ allowed: boolean; current: number; limit: number }> {
  const plan = await getUserPlan(userId);
  const usage = await getTransactionUsageSummary(userId, plan);

  return {
    allowed: usage.isUnlimited || usage.used < plan.transactionLimit,
    current: usage.used,
    limit: plan.transactionLimit,
  };
}
