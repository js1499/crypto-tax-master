import prisma from "@/lib/prisma";
import { PLANS, PlanKey } from "@/lib/stripe";

/** The tax year that transaction limits apply to. */
export const LIMIT_TAX_YEAR = 2025;

const TAX_YEAR_START = new Date(`${LIMIT_TAX_YEAR}-01-01T00:00:00Z`);
const TAX_YEAR_END = new Date(`${LIMIT_TAX_YEAR}-12-31T23:59:59.999Z`);

export interface UserPlan {
  planKey: PlanKey;
  planName: string;
  transactionLimit: number;
  walletLimit: number;
  features: typeof PLANS.free.features;
  subscriptionStatus: string | null;
  isPaid: boolean;
}

/**
 * Get a user's current plan and limits from the database.
 */
export async function getUserPlan(userId: string): Promise<UserPlan> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { planId: true, subscriptionStatus: true },
  });

  const planKey = (user?.planId || "free") as PlanKey;
  const plan = PLANS[planKey] || PLANS.free;
  const isPaid = planKey !== "free" && user?.subscriptionStatus === "active";

  return {
    planKey: isPaid ? planKey : "free",
    planName: isPaid ? plan.name : "Trial",
    transactionLimit: isPaid ? plan.transactionLimit : PLANS.free.transactionLimit,
    walletLimit: isPaid ? plan.walletLimit : PLANS.free.walletLimit,
    features: isPaid ? plan.features : PLANS.free.features,
    subscriptionStatus: user?.subscriptionStatus || null,
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
 * Count a user's transactions for the current tax year (2025).
 * Only tax-year transactions count against the plan limit.
 */
export async function countUserTransactions(userId: string): Promise<number> {
  const orConditions = await buildOwnershipFilter(userId);

  return prisma.transaction.count({
    where: {
      OR: orConditions,
      tx_timestamp: { gte: TAX_YEAR_START, lte: TAX_YEAR_END },
    },
  });
}

/**
 * Check if a user has exceeded their transaction limit for the tax year.
 */
export async function checkTransactionLimit(userId: string): Promise<{ allowed: boolean; current: number; limit: number }> {
  const plan = await getUserPlan(userId);
  const txCount = await countUserTransactions(userId);

  return {
    allowed: txCount < plan.transactionLimit,
    current: txCount,
    limit: plan.transactionLimit,
  };
}
