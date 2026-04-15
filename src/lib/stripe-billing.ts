import Stripe from "stripe";
import {
  PAID_PLAN_KEYS,
  getPlanByPriceId,
  getPriceId,
  stripe,
} from "@/lib/stripe";

const FALLBACK_ORIGIN = "https://crypto-tax-master.vercel.app";
const MANAGED_PORTAL_CONFIG_NAME = "Glide Managed Billing";
const MANAGED_PORTAL_CONFIG_METADATA = {
  app: "glide",
  purpose: "managed-billing",
} as const;
const MANAGED_SUBSCRIPTION_STATUSES = new Set([
  "active",
  "trialing",
  "past_due",
  "unpaid",
  "incomplete",
]);

function getCustomerId(
  customer:
    | string
    | Stripe.Customer
    | Stripe.DeletedCustomer
    | null
    | undefined,
): string | null {
  if (!customer) {
    return null;
  }

  return typeof customer === "string" ? customer : customer.id;
}

function isManagedConfig(configuration: Stripe.BillingPortal.Configuration) {
  return (
    configuration.metadata?.app === MANAGED_PORTAL_CONFIG_METADATA.app &&
    configuration.metadata?.purpose === MANAGED_PORTAL_CONFIG_METADATA.purpose
  );
}

function isManagedPlanSubscription(subscription: Stripe.Subscription) {
  const priceId = subscription.items.data[0]?.price.id;

  return (
    subscription.items.data.length === 1 &&
    !!priceId &&
    !!getPlanByPriceId(priceId) &&
    MANAGED_SUBSCRIPTION_STATUSES.has(subscription.status)
  );
}

async function buildManagedPortalProducts(): Promise<
  Stripe.BillingPortal.ConfigurationCreateParams.Features.SubscriptionUpdate.Product[]
> {
  const productsById = new Map<string, Set<string>>();

  await Promise.all(
    PAID_PLAN_KEYS.map(async (planKey) => {
      const priceId = getPriceId(planKey);
      if (!priceId) {
        return;
      }

      const price = await stripe.prices.retrieve(priceId);
      const productId =
        typeof price.product === "string" ? price.product : price.product?.id;

      if (!productId) {
        return;
      }

      const prices = productsById.get(productId) ?? new Set<string>();
      prices.add(priceId);
      productsById.set(productId, prices);
    }),
  );

  return Array.from(productsById.entries()).map(([product, prices]) => ({
    product,
    prices: Array.from(prices),
  }));
}

async function ensureManagedPortalConfiguration() {
  if (process.env.STRIPE_BILLING_PORTAL_CONFIG_ID) {
    return process.env.STRIPE_BILLING_PORTAL_CONFIG_ID;
  }

  const products = await buildManagedPortalProducts();
  const params: Stripe.BillingPortal.ConfigurationCreateParams = {
    name: MANAGED_PORTAL_CONFIG_NAME,
    default_return_url: `${FALLBACK_ORIGIN}/settings`,
    business_profile: {
      headline:
        "Manage your Glide annual license, renewals, and payment details.",
    },
    features: {
      customer_update: {
        enabled: false,
      },
      invoice_history: {
        enabled: true,
      },
      payment_method_update: {
        enabled: true,
      },
      subscription_cancel: {
        enabled: true,
        mode: "at_period_end",
      },
      subscription_update: {
        enabled: true,
        default_allowed_updates: ["price"],
        products,
        proration_behavior: "always_invoice",
        billing_cycle_anchor: "unchanged",
        schedule_at_period_end: {
          conditions: [{ type: "decreasing_item_amount" }],
        },
        trial_update_behavior: "continue_trial",
      },
    },
    metadata: MANAGED_PORTAL_CONFIG_METADATA,
  };

  const configurations = await stripe.billingPortal.configurations.list({
    limit: 20,
  });
  const existing = configurations.data.find(isManagedConfig);

  if (existing) {
    const updated = await stripe.billingPortal.configurations.update(
      existing.id,
      {
        ...params,
        active: true,
      },
    );

    return updated.id;
  }

  const created = await stripe.billingPortal.configurations.create(params);
  return created.id;
}

export function normalizeOrigin(rawOrigin: string | null): string {
  if (!rawOrigin) {
    return FALLBACK_ORIGIN;
  }

  return rawOrigin.replace(/\/$/, "");
}

export function getBrandAssetOrigin(origin: string): string {
  if (origin.includes("localhost") || origin.includes("127.0.0.1")) {
    return FALLBACK_ORIGIN;
  }

  return origin;
}

export function getBillingReturnUrl(origin: string): string {
  return `${origin}/settings`;
}

export async function getPrimaryPlanSubscription(options: {
  customerId: string;
  preferredSubscriptionId?: string | null;
}) {
  const { customerId, preferredSubscriptionId } = options;

  if (preferredSubscriptionId) {
    try {
      const preferred = await stripe.subscriptions.retrieve(
        preferredSubscriptionId,
      );
      if (
        getCustomerId(preferred.customer) === customerId &&
        isManagedPlanSubscription(preferred)
      ) {
        return preferred;
      }
    } catch (error) {
      console.warn(
        "[Stripe Billing] Failed to retrieve preferred subscription:",
        preferredSubscriptionId,
        error,
      );
    }
  }

  const subscriptions = await stripe.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 20,
  });

  return (
    subscriptions.data
      .filter(isManagedPlanSubscription)
      .sort((left, right) => right.created - left.created)[0] ?? null
  );
}

export function isSamePlanSelection(
  subscription: Stripe.Subscription,
  priceId: string,
) {
  return subscription.items.data[0]?.price.id === priceId;
}

export async function createManagedBillingPortalSession(options: {
  customerId: string;
  returnUrl: string;
}) {
  const { customerId, returnUrl } = options;
  const configuration = await ensureManagedPortalConfiguration();
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    configuration,
    return_url: returnUrl,
  });

  return session.url;
}

export async function createPlanChangePortalSession(options: {
  customerId: string;
  returnUrl: string;
  subscription: Stripe.Subscription;
  priceId: string;
}) {
  const { customerId, returnUrl, subscription, priceId } = options;
  const configuration = await ensureManagedPortalConfiguration();
  const item = subscription.items.data[0];

  if (!item) {
    throw new Error("No subscription item found for plan change.");
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    configuration,
    return_url: returnUrl,
    flow_data: {
      type: "subscription_update_confirm",
      after_completion: {
        type: "redirect",
        redirect: {
          return_url: `${returnUrl}?billing_updated=1`,
        },
      },
      subscription_update_confirm: {
        subscription: subscription.id,
        items: [
          {
            id: item.id,
            price: priceId,
            quantity: item.quantity ?? 1,
          },
        ],
      },
    },
  });

  return session.url;
}
