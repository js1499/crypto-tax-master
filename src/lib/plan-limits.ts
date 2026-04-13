import prisma from "@/lib/prisma";
import { PLANS, PlanKey } from "@/lib/stripe";

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
 * Check if a user has exceeded their transaction limit.
 */
export async function checkTransactionLimit(userId: string): Promise<{ allowed: boolean; current: number; limit: number }> {
  const plan = await getUserPlan(userId);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { wallets: true },
  });
  const walletAddresses = user?.wallets.map(w => w.address) || [];

  let txCount = 0;
  if (walletAddresses.length > 0) {
    txCount = await prisma.transaction.count({
      where: { wallet_address: { in: walletAddresses } },
    });
  }

  return {
    allowed: txCount < plan.transactionLimit,
    current: txCount,
    limit: plan.transactionLimit,
  };
}
