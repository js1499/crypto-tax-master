import { NextRequest, NextResponse } from "next/server";
import { stripe, getPlanByPriceId } from "@/lib/stripe";
import prisma from "@/lib/prisma";

/**
 * POST /api/stripe/webhook
 * Handles Stripe webhook events. Updates user subscription status in DB.
 * Must receive raw body (not JSON-parsed) for signature verification.
 */
export async function POST(request: NextRequest) {
  const body = await request.text();
  const sig = request.headers.get("stripe-signature");

  if (!sig || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Missing signature or webhook secret" }, { status: 400 });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("[Stripe Webhook] Signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as any;
        const customerId = session.customer as string;
        const subscriptionId = session.subscription as string;

        if (subscriptionId) {
          // Fetch the subscription to get plan details
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          const priceId = subscription.items.data[0]?.price.id;
          const plan = priceId ? getPlanByPriceId(priceId) : null;

          // Check if this is a CPA filing add-on
          const isCpa = priceId === process.env.STRIPE_PRICE_CPA_FILING;

          if (isCpa) {
            // CPA filing: just flag the user, don't change their plan
            await prisma.user.update({
              where: { stripeCustomerId: customerId },
              data: { hasCpaFiling: true },
            });
          } else {
            await prisma.user.update({
              where: { stripeCustomerId: customerId },
              data: {
                subscriptionId,
                subscriptionStatus: subscription.status,
                planId: plan?.key || "free",
                currentPeriodEnd: new Date(subscription.current_period_end * 1000),
              },
            });
          }
        }
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data.object as any;
        const customerId = subscription.customer as string;
        const priceId = subscription.items.data[0]?.price.id;
        const plan = priceId ? getPlanByPriceId(priceId) : null;
        const isCpa = priceId === process.env.STRIPE_PRICE_CPA_FILING;

        if (isCpa) {
          await prisma.user.update({
            where: { stripeCustomerId: customerId },
            data: {
              hasCpaFiling: subscription.status === "active",
            },
          });
        } else {
          await prisma.user.update({
            where: { stripeCustomerId: customerId },
            data: {
              subscriptionId: subscription.id,
              subscriptionStatus: subscription.status,
              planId: plan?.key || "free",
              currentPeriodEnd: new Date(subscription.current_period_end * 1000),
            },
          });
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as any;
        const customerId = subscription.customer as string;
        const priceId = subscription.items.data[0]?.price.id;
        const isCpa = priceId === process.env.STRIPE_PRICE_CPA_FILING;

        if (isCpa) {
          await prisma.user.update({
            where: { stripeCustomerId: customerId },
            data: { hasCpaFiling: false },
          });
        } else {
          await prisma.user.update({
            where: { stripeCustomerId: customerId },
            data: {
              subscriptionId: null,
              subscriptionStatus: "canceled",
              planId: "free",
              currentPeriodEnd: null,
            },
          });
        }
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as any;
        const subscriptionId = invoice.subscription as string;
        if (subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          const customerId = subscription.customer as string;
          await prisma.user.update({
            where: { stripeCustomerId: customerId },
            data: {
              subscriptionStatus: "active",
              currentPeriodEnd: new Date(subscription.current_period_end * 1000),
            },
          });
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as any;
        const subscriptionId = invoice.subscription as string;
        if (subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          const customerId = subscription.customer as string;
          await prisma.user.update({
            where: { stripeCustomerId: customerId },
            data: { subscriptionStatus: "past_due" },
          });
        }
        break;
      }

      default:
        // Ignore events we don't handle
        break;
    }
  } catch (err) {
    console.error("[Stripe Webhook] Error processing event:", event.type, err);
    // Return 200 anyway so Stripe doesn't retry (we logged the error)
  }

  return NextResponse.json({ received: true });
}
