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

    // Delete all user data atomically. The new owner foreign keys cascade most of
    // this on user.delete(), but we still delete explicitly so (a) deletion is
    // complete even before the FK migration is applied, and (b) transaction rows
    // whose user_id was never backfilled are removed via wallet_address.
    await prisma.$transaction(async (tx) => {
      if (walletAddresses.length > 0) {
        await tx.transaction.deleteMany({ where: { wallet_address: { in: walletAddresses } } });
      }
      await tx.transaction.deleteMany({ where: { userId: user.id } });
      await tx.taxReportCache.deleteMany({ where: { userId: user.id } });

      // Securities domain — previously NOT deleted here, so it orphaned on delete.
      await tx.securitiesWashSale.deleteMany({ where: { userId: user.id } });
      await tx.securitiesTaxableEvent.deleteMany({ where: { userId: user.id } });
      await tx.securitiesDividend.deleteMany({ where: { userId: user.id } });
      await tx.securitiesLot.deleteMany({ where: { userId: user.id } });
      await tx.securitiesEquivalenceGroup.deleteMany({ where: { userId: user.id } });
      await tx.securitiesTaxSettings.deleteMany({ where: { userId: user.id } });
      await tx.securitiesTransaction.deleteMany({ where: { userId: user.id } });
      await tx.brokerage.deleteMany({ where: { userId: user.id } });

      await tx.wallet.deleteMany({ where: { userId: user.id } });
      await tx.exchange.deleteMany({ where: { userId: user.id } });
      await tx.session.deleteMany({ where: { userId: user.id } });
      await tx.account.deleteMany({ where: { userId: user.id } });

      await tx.user.delete({ where: { id: user.id } });
    });

    return NextResponse.json({ status: "success" });
  } catch (error) {
    console.error("[Delete Account] Error:", error);
    return NextResponse.json(
      { error: "Failed to delete account. Please contact support." },
      { status: 500 },
    );
  }
}
