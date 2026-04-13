import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
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

  const planKey = (dbUser.planId || "free") as PlanKey;
  const plan = PLANS[planKey] || PLANS.free;

  return NextResponse.json({
    planKey,
    planName: plan.name,
    subscriptionStatus: dbUser.subscriptionStatus || "none",
    currentPeriodEnd: dbUser.currentPeriodEnd,
    hasCpaFiling: dbUser.hasCpaFiling,
    hasStripeAccount: !!dbUser.stripeCustomerId,
    limits: {
      transactions: plan.transactionLimit,
      wallets: plan.walletLimit,
    },
    features: plan.features,
  });
}
