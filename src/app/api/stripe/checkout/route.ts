import { NextRequest, NextResponse } from "next/server";
import { stripe, getPriceId, PlanKey } from "@/lib/stripe";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { getCurrentFilingTaxYear } from "@/lib/plan-limits";
import {
  createManagedBillingPortalSession,
  createPlanChangePortalSession,
  getBillingReturnUrl,
  getBrandAssetOrigin,
  getPrimaryPlanSubscription,
  isSamePlanSelection,
  normalizeOrigin,
} from "@/lib/stripe-billing";

const CHECKOUT_STRIPE_VERSION = "2026-03-25.dahlia";
const CHECKOUT_BRANDING = {
  background_color: "#f8f9f7",
  border_style: "rounded" as const,
  button_color: "#10b981",
  display_name: "Glide",
  font_family: "inter" as const,
};

/**
 * POST /api/stripe/checkout
 * Creates a Stripe Checkout session for a given plan.
 * Requires authentication — unauthenticated users get 401 and the
 * frontend redirects them to /register?plan=<key>.
 * Body: { planKey: "starter" | "active" | ... | "cpa_filing" }
 */
export async function POST(request: NextRequest) {
  try {
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
      if (
        !dbUser ||
        dbUser.planId === "free" ||
        dbUser.subscriptionStatus !== "active"
      ) {
        return NextResponse.json(
          {
            error:
              "CPA Filing requires an active subscription. Please subscribe to a plan first.",
          },
          { status: 400 },
        );
      }
    }

    // Get or create Stripe customer
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        stripeCustomerId: true,
        subscriptionId: true,
        email: true,
        name: true,
      },
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

    const origin = normalizeOrigin(request.headers.get("origin"));
    const assetOrigin = getBrandAssetOrigin(origin);
    const billingReturnUrl = getBillingReturnUrl(origin);
    const currentFilingTaxYear = getCurrentFilingTaxYear();
    const nextRenewalTaxYear = currentFilingTaxYear + 1;

    if (planKey !== "cpa_filing" && customerId) {
      const existingSubscription = await getPrimaryPlanSubscription({
        customerId,
        preferredSubscriptionId: dbUser?.subscriptionId,
      });

      if (existingSubscription) {
        if (isSamePlanSelection(existingSubscription, priceId)) {
          const portalUrl = await createManagedBillingPortalSession({
            customerId,
            returnUrl: billingReturnUrl,
          });

          return NextResponse.json({ url: portalUrl });
        }

        const portalUrl = await createPlanChangePortalSession({
          customerId,
          returnUrl: billingReturnUrl,
          subscription: existingSubscription,
          priceId,
        });

        return NextResponse.json({ url: portalUrl });
      }
    }

    const session = await stripe.checkout.sessions.create(
      {
        customer: customerId,
        mode: "subscription",
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${origin}/accounts?success=true&plan=${planKey}`,
        cancel_url: `${origin}/#pricing`,
        metadata: { userId: user.id, planKey },
        custom_fields: [
          {
            key: "auto_renew",
            label: {
              type: "custom",
              custom: "Auto-renew next year? (Optional)",
            },
            type: "dropdown",
            optional: true,
            dropdown: {
              default_value: "yes",
              options: [
                { label: "Yes, renew automatically", value: "yes" },
                { label: "No, end after this term", value: "no" },
              ],
            },
          },
        ],
        custom_text: {
          submit: {
            message: `Annual access covers tax year ${currentFilingTaxYear} and earlier. Auto-renew defaults to yes, and renewal unlocks tax year ${nextRenewalTaxYear}.`,
          },
        },
        branding_settings: {
          ...CHECKOUT_BRANDING,
          logo: {
            type: "url",
            url: `${assetOrigin}/landing/logos/glide-logo-checkout.png`,
          },
        },
      },
      {
        apiVersion: CHECKOUT_STRIPE_VERSION,
      },
    );

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("[Stripe Checkout] Failed to create billing session:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to open billing flow",
      },
      { status: 500 },
    );
  }
}
