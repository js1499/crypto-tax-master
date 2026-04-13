import { NextRequest, NextResponse } from "next/server";
import { stripe, getPriceId, PlanKey } from "@/lib/stripe";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";

/**
 * POST /api/stripe/checkout
 * Creates a Stripe Checkout session for a given plan.
 * Body: { planKey: "starter" | "active" | ... | "cpa_filing" }
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await request.json();
  const { planKey } = body as { planKey: string };

  // Get the price ID
  let priceId: string | null = null;
  if (planKey === "cpa_filing") {
    priceId = process.env.STRIPE_PRICE_CPA_FILING || null;
  } else {
    priceId = getPriceId(planKey as PlanKey);
  }

  if (!priceId) {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }

  // CPA filing requires an active plan
  if (planKey === "cpa_filing") {
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { planId: true, subscriptionStatus: true },
    });
    if (!dbUser || dbUser.planId === "free" || dbUser.subscriptionStatus !== "active") {
      return NextResponse.json(
        { error: "CPA Filing requires an active subscription. Please subscribe to a plan first." },
        { status: 400 },
      );
    }
  }

  // Get or create Stripe customer
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { stripeCustomerId: true, email: true, name: true },
  });

  let customerId = dbUser?.stripeCustomerId;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: dbUser?.email || user.email || undefined,
      name: dbUser?.name || user.name || undefined,
      metadata: { userId: user.id },
    });
    customerId = customer.id;
    await prisma.user.update({
      where: { id: user.id },
      data: { stripeCustomerId: customerId },
    });
  }

  // Determine success/cancel URLs
  const origin = request.headers.get("origin") || "http://localhost:3000";

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${origin}/pricing?success=true&plan=${planKey}`,
    cancel_url: `${origin}/pricing?canceled=true`,
    metadata: { userId: user.id, planKey },
  });

  return NextResponse.json({ url: session.url });
}
