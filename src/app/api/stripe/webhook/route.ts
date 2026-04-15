import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { stripe, getPlanByPriceId } from "@/lib/stripe";
import prisma from "@/lib/prisma";

const CHECKOUT_STRIPE_VERSION = "2026-03-25.dahlia";
const AUTO_RENEW_FIELD_KEY = "auto_renew";
const AUTO_RENEW_DISABLED = "no";

function getCustomerId(customer: string | Stripe.Customer | Stripe.DeletedCustomer): string | null {
  return typeof customer === "string" ? customer : customer.id;
}

function getCurrentPeriodEnd(subscription: Stripe.Subscription): Date | null {
  const currentPeriodEnd = subscription.items.data[0]?.current_period_end;
  return currentPeriodEnd ? new Date(currentPeriodEnd * 1000) : null;
}

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

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("[Stripe Webhook] Signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const rawSession = event.data.object as Stripe.Checkout.Session;
        const customerId = rawSession.customer as string | null;

        if (!customerId) {
          break;
        }

        const session = await stripe.checkout.sessions.retrieve(rawSession.id, {}, {
          apiVersion: CHECKOUT_STRIPE_VERSION,
        });
        const subscriptionId = typeof session.subscription === "string"
          ? session.subscription
          : session.subscription?.id || null;

        if (subscriptionId) {
          let subscription = await stripe.subscriptions.retrieve(subscriptionId) as unknown as Stripe.Subscription;
          const autoRenewPreference = session.custom_fields?.find(
            (field) => field.key === AUTO_RENEW_FIELD_KEY,
          )?.dropdown?.value;

          if (autoRenewPreference === AUTO_RENEW_DISABLED && !subscription.cancel_at_period_end) {
            subscription = await stripe.subscriptions.update(subscriptionId, {
              cancel_at_period_end: true,
            }) as unknown as Stripe.Subscription;
          }

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
                currentPeriodEnd: getCurrentPeriodEnd(subscription),
              },
            });
          }
        }
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = getCustomerId(subscription.customer);
        if (!customerId) {
          break;
        }
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
              currentPeriodEnd: getCurrentPeriodEnd(subscription),
            },
          });
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = getCustomerId(subscription.customer);
        if (!customerId) {
          break;
        }
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
        const invoice = event.data.object as Stripe.Invoice & { subscription?: string | Stripe.Subscription | null };
        const subscriptionId = typeof invoice.subscription === "string"
          ? invoice.subscription
          : invoice.subscription?.id || null;
        if (subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId) as unknown as Stripe.Subscription;
          const customerId = getCustomerId(subscription.customer);
          if (!customerId) {
            break;
          }
          await prisma.user.update({
            where: { stripeCustomerId: customerId },
            data: {
              subscriptionStatus: "active",
              currentPeriodEnd: getCurrentPeriodEnd(subscription),
            },
          });
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice & { subscription?: string | Stripe.Subscription | null };
        const subscriptionId = typeof invoice.subscription === "string"
          ? invoice.subscription
          : invoice.subscription?.id || null;
        if (subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId) as unknown as Stripe.Subscription;
          const customerId = getCustomerId(subscription.customer);
          if (!customerId) {
            break;
          }
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
