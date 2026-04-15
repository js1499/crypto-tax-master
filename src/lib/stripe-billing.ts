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

function getStripeAuthHeader() {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }

  return `Basic ${Buffer.from(`${process.env.STRIPE_SECRET_KEY}:`).toString("base64")}`;
}

async function stripeDashboardRequest<T>(
  path: string,
  options?: {
    method?: "GET" | "POST";
    body?: URLSearchParams;
  },
): Promise<T> {
  const response = await fetch(`https://api.stripe.com/v1${path}`, {
    method: options?.method || "GET",
    headers: {
      Authorization: getStripeAuthHeader(),
      ...(options?.body
        ? { "Content-Type": "application/x-www-form-urlencoded" }
        : {}),
    },
    body: options?.body?.toString(),
    cache: "no-store",
  });

  const data = await response.json();

  if (!response.ok) {
    const message =
      data?.error?.message ||
      `Stripe dashboard request failed for ${options?.method || "GET"} ${path}`;
    throw new Error(message);
  }

  return data as T;
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

      const price = await stripeDashboardRequest<{ product: string }>(
        `/prices/${priceId}`,
      );
      const productId = price.product;

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
  const params = new URLSearchParams();

  params.set("name", MANAGED_PORTAL_CONFIG_NAME);
  params.set("default_return_url", `${FALLBACK_ORIGIN}/settings`);
  params.set(
    "business_profile[headline]",
    "Manage your Glide plan and renewals.",
  );
  params.set("features[customer_update][enabled]", "false");
  params.set("features[invoice_history][enabled]", "true");
  params.set("features[payment_method_update][enabled]", "true");
  params.set("features[subscription_cancel][enabled]", "true");
  params.set("features[subscription_cancel][mode]", "at_period_end");
  params.set("features[subscription_update][enabled]", "true");
  params.set(
    "features[subscription_update][default_allowed_updates][0]",
    "price",
  );
  params.set(
    "features[subscription_update][proration_behavior]",
    "always_invoice",
  );
  params.set(
    "features[subscription_update][billing_cycle_anchor]",
    "unchanged",
  );
  params.set(
    "features[subscription_update][schedule_at_period_end][conditions][0][type]",
    "decreasing_item_amount",
  );
  params.set(
    "features[subscription_update][trial_update_behavior]",
    "continue_trial",
  );
  params.set("metadata[app]", MANAGED_PORTAL_CONFIG_METADATA.app);
  params.set("metadata[purpose]", MANAGED_PORTAL_CONFIG_METADATA.purpose);

  products.forEach((product, productIndex) => {
    params.set(
      `features[subscription_update][products][${productIndex}][product]`,
      product.product,
    );

    product.prices.forEach((price, priceIndex) => {
      params.set(
        `features[subscription_update][products][${productIndex}][prices][${priceIndex}]`,
        price,
      );
    });
  });

  const configurations = await stripeDashboardRequest<{
    data: Stripe.BillingPortal.Configuration[];
  }>("/billing_portal/configurations?limit=20");
  const existing = configurations.data.find(isManagedConfig);

  if (existing) {
    const updated =
      await stripeDashboardRequest<Stripe.BillingPortal.Configuration>(
        `/billing_portal/configurations/${existing.id}`,
        {
          method: "POST",
          body: new URLSearchParams([...params.entries(), ["active", "true"]]),
        },
      );

    return updated.id;
  }

  const created =
    await stripeDashboardRequest<Stripe.BillingPortal.Configuration>(
      "/billing_portal/configurations",
      {
        method: "POST",
        body: params,
      },
    );
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
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
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
