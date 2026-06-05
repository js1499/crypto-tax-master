import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { stripe } from "@/lib/stripe";

// Subscriptions in these states are already finished and cannot be canceled
// again; everything else is still (potentially) billable and must be canceled.
const TERMINAL_SUBSCRIPTION_STATUSES = new Set<string>([
  "canceled",
  "incomplete_expired",
]);

/**
 * DELETE /api/auth/delete-account
 * Permanently deletes the user's account and all associated data.
 */
export async function DELETE(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      // `select` and `include` are mutually exclusive in Prisma (passing both
      // throws at runtime), so select the wallets relation here instead.
      select: { stripeCustomerId: true, wallets: true },
    });

    if (!dbUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Cancel any still-billable Stripe subscription if one exists. We list
    // "all" and skip only terminal statuses, so trialing/past_due/unpaid/
    // incomplete/paused subscriptions are also canceled — otherwise a deleted
    // account could keep getting billed.
    if (dbUser.stripeCustomerId) {
      try {
        const subscriptions = await stripe.subscriptions.list({
          customer: dbUser.stripeCustomerId,
          status: "all",
        });
        for (const sub of subscriptions.data) {
          if (TERMINAL_SUBSCRIPTION_STATUSES.has(sub.status)) {
            continue;
          }
          await stripe.subscriptions.cancel(sub.id);
        }
      } catch {
        // Stripe error shouldn't block account deletion
      }
    }

    const walletAddresses = dbUser.wallets.map((w: any) => w.address);

    // Delete all user data in order (respecting foreign keys)
    if (walletAddresses.length > 0) {
      await prisma.transaction.deleteMany({
        where: { wallet_address: { in: walletAddresses } },
      });
    }
    await prisma.transaction.deleteMany({
      where: { userId: user.id },
    });
    await prisma.taxReportCache.deleteMany({ where: { userId: user.id } });
    await prisma.securitiesTransaction.deleteMany({ where: { userId: user.id } });
    await prisma.brokerage.deleteMany({ where: { userId: user.id } });
    await prisma.wallet.deleteMany({ where: { userId: user.id } });
    await prisma.exchange.deleteMany({ where: { userId: user.id } });
    await prisma.session.deleteMany({ where: { userId: user.id } });
    await prisma.account.deleteMany({ where: { userId: user.id } });

    // Delete the user
    await prisma.user.delete({ where: { id: user.id } });

    return NextResponse.json({ status: "success" });
  } catch (error) {
    console.error("[Delete Account] Error:", error);
    return NextResponse.json(
      { error: "Failed to delete account. Please contact support." },
      { status: 500 },
    );
  }
}
