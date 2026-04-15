import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import {
  createManagedBillingPortalSession,
  getBillingReturnUrl,
  normalizeOrigin,
} from "@/lib/stripe-billing";

/**
 * POST /api/stripe/portal
 * Creates a Stripe Customer Portal session for billing management.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { stripeCustomerId: true },
    });

    if (!dbUser?.stripeCustomerId) {
      return NextResponse.json(
        { error: "No billing account found" },
        { status: 400 },
      );
    }

    const origin = normalizeOrigin(request.headers.get("origin"));
    const sessionUrl = await createManagedBillingPortalSession({
      customerId: dbUser.stripeCustomerId,
      returnUrl: getBillingReturnUrl(origin),
    });

    return NextResponse.json({ url: sessionUrl });
  } catch (error) {
    console.error(
      "[Stripe Portal] Failed to create billing portal session:",
      error,
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to open billing portal",
      },
      { status: 500 },
    );
  }
}
