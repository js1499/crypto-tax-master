"use client";

import { useEffect } from "react";
import { firePurchaseConversion, setUserData } from "@/lib/google-ads";

/**
 * Best-effort: record server-side that this session's purchase conversion has fired,
 * so a later success-page refresh/reopen does NOT re-fire. Called only AFTER gtag
 * confirms the send (event_callback). Fail-safe — never throws, never blocks.
 */
function markPurchaseFired(sessionId: string) {
  try {
    fetch("/api/ads/purchase-fired", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      keepalive: true,
      body: JSON.stringify({ sessionId }),
    }).catch(() => {});
  } catch {
    /* ignore */
  }
}

/**
 * Fires the Google Ads Purchase conversion exactly once on mount.
 *
 * Rendered by the /checkout/success Server Component ONLY after the payment was
 * server-verified as paid AND the fire-once guard for this session is not yet set —
 * so this can never fire on an unverified hit, a refresh after a prior fire, a direct
 * visit, or a free/organic state. All values are server-derived (from the verified
 * Stripe session), never the URL. Fail-safe internally.
 */
export function PurchaseConversion({
  value,
  currency,
  transactionId,
  email,
}: {
  value: number;
  currency: string;
  transactionId: string;
  email?: string | null;
}) {
  useEffect(() => {
    if (email) setUserData({ email });
    firePurchaseConversion({
      value,
      currency,
      transactionId,
      // Record the guard only after the send is confirmed — a failed send leaves it
      // unclaimed so a retry can fire (Google dedupes any retry by transaction_id).
      onSent: () => markPurchaseFired(transactionId),
    });
    // Fire exactly once on mount; deps intentionally empty.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
