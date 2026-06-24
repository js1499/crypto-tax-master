import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
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
    const { planKey, code } = body as { planKey: string; code?: string };
    const isCpaFiling = planKey === "cpa_filing";

    // Discount / comp codes:
    //  - the free-trial secret starts a no-card 30-day trial (subscriptions only)
    //  - any other code is resolved as a Stripe promotion code ($1 comps)
    const submittedCode = code?.trim() ?? "";
    const freeTrialCode = process.env.STRIPE_FREE_TRIAL_CODE?.trim() || null;
    const isFreeTrial =
      submittedCode.length > 0 &&
      freeTrialCode !== null &&
      submittedCode === freeTrialCode;

    if (isFreeTrial && isCpaFiling) {
      return NextResponse.json(
        {
          error:
            "The free-trial code applies to subscription plans, not CPA Filing.",
        },
        { status: 400 },
      );
    }

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

    // When a comp code is supplied, always create a fresh checkout session so
    // the trial/discount is honored, rather than diverting to the plan-change portal.
    if (!isCpaFiling && customerId && !submittedCode) {
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

    // Resolve a $1 comp code to a Stripe promotion code. Each $1 coupon is
    // restricted to one product, so Stripe rejects a code used on the wrong plan.
    let promotionCodeId: string | null = null;
    if (submittedCode && !isFreeTrial) {
      const matches = await stripe.promotionCodes.list({
        code: submittedCode,
        active: true,
        limit: 1,
      });
      if (matches.data.length === 0) {
        return NextResponse.json(
          { error: "That discount code isn't valid or has expired." },
          { status: 400 },
        );
      }
      promotionCodeId = matches.data[0].id;
    }

    // CPA Filing is a one-time service, not a recurring plan, so it checks out
    // in payment mode. Everything else is an annual subscription.
    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      customer: customerId,
      mode: isCpaFiling ? "payment" : "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/accounts?success=true&plan=${planKey}`,
      cancel_url: `${origin}/#pricing`,
      metadata: { userId: user.id, planKey },
      // Collect the billing address (needed for sales-tax compliance and stored on
      // the customer). customer_update[address]=auto is REQUIRED here because we pass
      // an existing `customer` — it lets Checkout write the collected address back to
      // the customer so Stripe Tax and invoices can use it.
      billing_address_collection: "required",
      customer_update: { address: "auto", name: "auto" },
      branding_settings: {
        ...CHECKOUT_BRANDING,
        logo: {
          type: "url",
          url: `${assetOrigin}/landing/logos/glide-logo-checkout.png`,
        },
      },
    };

    // Automatic sales-tax calculation via Stripe Tax. Gated behind an env flag
    // because automatic_tax REQUIRES Dashboard setup first — activate Stripe Tax,
    // set your origin address, add a New York `state_sales_tax` registration, and
    // set product tax codes / a default tax behavior. Without that, Stripe rejects
    // the session and checkout breaks for everyone. Flip STRIPE_TAX_ENABLED=true
    // once the Dashboard setup is complete. (Address collection above is always on.)
    if (process.env.STRIPE_TAX_ENABLED === "true") {
      sessionParams.automatic_tax = { enabled: true };
    }

    if (promotionCodeId) {
      sessionParams.discounts = [{ promotion_code: promotionCodeId }];
    }

    // Free-trial code: a 30-day, no-card trial that auto-cancels at the end.
    if (isFreeTrial) {
      sessionParams.payment_method_collection = "if_required";
      sessionParams.subscription_data = {
        trial_period_days: 30,
        trial_settings: {
          end_behavior: { missing_payment_method: "cancel" },
        },
      };
    }

    // Auto-renew choice and annual-term messaging only make sense for a normal
    // paid subscription — not the one-time CPA Filing purchase or a free trial.
    if (!isCpaFiling && !isFreeTrial) {
      sessionParams.custom_fields = [
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
      ];
      sessionParams.custom_text = {
        submit: {
          message: `Annual access covers tax year ${currentFilingTaxYear} and earlier. Auto-renew defaults to yes, and renewal unlocks tax year ${nextRenewalTaxYear}.`,
        },
      };
    }

    const session = await stripe.checkout.sessions.create(sessionParams, {
      apiVersion: CHECKOUT_STRIPE_VERSION,
    });

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
