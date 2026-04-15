import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { getTransactionUsageSummary, getUserPlan } from "@/lib/plan-limits";
import { PLANS, PlanKey } from "@/lib/stripe";

/**
 * GET /api/stripe/status
 * Returns the current user's subscription status and plan details.
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      planId: true,
      subscriptionStatus: true,
      currentPeriodEnd: true,
      hasCpaFiling: true,
      stripeCustomerId: true,
    },
  });

  if (!dbUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const effectivePlan = await getUserPlan(user.id);
  const usage = await getTransactionUsageSummary(user.id, effectivePlan);
  const billingPlanKey = (dbUser.planId || "free") as PlanKey;
  const billingPlan = PLANS[billingPlanKey] || PLANS.free;

  return NextResponse.json({
    planKey: effectivePlan.planKey,
    planName: effectivePlan.planName,
    billingPlanKey,
    billingPlanName: billingPlan.name,
    isPaid: effectivePlan.isPaid,
    subscriptionStatus: effectivePlan.subscriptionStatus || "none",
    currentPeriodEnd: effectivePlan.currentPeriodEnd,
    licensedThroughTaxYear: effectivePlan.licensedThroughTaxYear,
    hasCpaFiling: dbUser.hasCpaFiling,
    hasStripeAccount: !!dbUser.stripeCustomerId,
    limits: {
      transactions: Number.isFinite(effectivePlan.transactionLimit)
        ? effectivePlan.transactionLimit
        : null,
      wallets: Number.isFinite(effectivePlan.walletLimit)
        ? effectivePlan.walletLimit
        : null,
    },
    usage: {
      taxYear: usage.taxYear,
      used: usage.used,
      limit: usage.isUnlimited ? null : usage.limit,
      isUnlimited: usage.isUnlimited,
      remaining: usage.remaining,
      percentUsed: usage.percentUsed,
      isOverLimit: usage.isOverLimit,
    },
    features: effectivePlan.features,
  });
}
