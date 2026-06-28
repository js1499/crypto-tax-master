import Link from "next/link";
import { stripe } from "@/lib/stripe";
import prisma from "@/lib/prisma";
import { PurchaseConversion } from "@/components/purchase-conversion";

// Reads searchParams + Stripe + DB per request; never cache/prerender.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Payment successful | Glide",
};

interface VerifiedPurchase {
  fire: boolean;
  value: number;
  currency: string;
  transactionId: string;
  email: string | null;
}

/**
 * Server-side: retrieve the Checkout Session, verify it is genuinely PAID, and
 * atomically claim a one-time fire for this session id. Returns fire=true ONLY the
 * first time a paid session is seen. Never throws — a tracking/verification failure
 * must never interrupt the page or trap the user.
 *
 * Anti-spoof: value/currency/email come from the Stripe API object (not the URL);
 * only payment_status === 'paid' fires (trials are 'no_payment_required'); and the
 * DB unique key on session_id prevents refresh/reopen double-counting.
 */
async function verifyAndClaim(
  sessionId: string | undefined,
): Promise<VerifiedPurchase | null> {
  if (!sessionId) return null;
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== "paid") {
      // Unpaid / trial (no_payment_required) / expired → render onward, never fire.
      return null;
    }

    // Fire-once guard (read-only here): has this session's web conversion already
    // been recorded? The row is written AFTER the client confirms the send (POST
    // /api/ads/purchase-fired), so a client that never fires does NOT consume the
    // guard — a later load can retry. Sequential refresh/reopen/back after a
    // successful fire find the row and do NOT re-fire; the transaction_id (session id)
    // gives Google a second dedup layer against a rare concurrent double-load.
    let alreadyFired = false;
    try {
      const existing = await prisma.adsPurchaseConversion.findUnique({
        where: { sessionId: session.id },
      });
      alreadyFired = !!existing;
    } catch {
      alreadyFired = false;
    }

    // amount_total is in the currency's minor unit. Assumes a 2-decimal currency
    // (USD) — the only currency sold today; revisit for zero-decimal currencies (JPY).
    const value =
      typeof session.amount_total === "number" ? session.amount_total / 100 : 0;
    const currency = (session.currency || "usd").toUpperCase();
    const email = session.customer_details?.email ?? null;

    // Fire only if not already recorded and it's a real (>0) charge.
    return { fire: !alreadyFired && value > 0, value, currency, transactionId: session.id, email };
  } catch {
    // Stripe retrieve failed / unknown id → render onward without firing.
    return null;
  }
}

export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string; plan?: string }>;
}) {
  const params = await searchParams;
  const result = await verifyAndClaim(params.session_id);

  return (
    <main className="min-h-screen flex items-center justify-center bg-[#f8f9f7] px-4">
      <div className="w-full max-w-md rounded-2xl border border-[#E5E5E0] bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-[#ECFDF5]">
          <svg
            className="h-7 w-7 text-[#10b981]"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </div>
        <h1 className="text-[22px] font-bold text-[#1A1A1A]">Payment successful</h1>
        <p className="mt-2 text-[14px] text-[#6B7280]">
          Thanks — your payment was received and we&apos;re setting up your account now.
        </p>
        <Link
          href="/accounts"
          className="mt-6 inline-flex w-full items-center justify-center rounded-lg bg-[#10b981] px-4 py-3 text-[15px] font-semibold text-white transition-colors hover:bg-[#0ea372]"
        >
          Go to dashboard
        </Link>
      </div>

      {/* Conversion fires only when the payment was server-verified paid AND this is
          the first claim for the session. All data is server-derived. */}
      {result?.fire && (
        <PurchaseConversion
          value={result.value}
          currency={result.currency}
          transactionId={result.transactionId}
          email={result.email}
        />
      )}
    </main>
  );
}
