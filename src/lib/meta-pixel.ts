/**
 * Meta (Facebook) Pixel — pixel ID 1977085329674970.
 *
 * Loaded sitewide via <MetaPixel> in the root layout (base tag + PageView), mirroring the Google
 * Ads gtag setup. Standard conversion events are fired from the SAME spots as the Google Ads
 * conversions: CompleteRegistration on signup, Purchase on a server-verified checkout. Every call
 * is fully fail-safe so a tracking error can never break the app. Never log raw PII here.
 */

/** Public Meta Pixel ID. Inlined intentionally (it's visible in page source), like the Ads ID. */
export const META_PIXEL_ID = "1977085329674970";

type FbqFn = (...args: unknown[]) => void;

function getFbq(): FbqFn | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { fbq?: FbqFn };
  return typeof w.fbq === "function" ? w.fbq : null;
}

/**
 * Run `fn(fbq)` as soon as window.fbq exists. The base pixel loads via next/script afterInteractive,
 * which may not be ready at the exact moment a fresh page's effect fires — so poll briefly rather
 * than silently miss the event. Gives up after ~3s. Mirrors whenGtagReady. Fail-safe.
 */
function whenFbqReady(fn: (fbq: FbqFn) => void): void {
  if (typeof window === "undefined") return;
  let tries = 0;
  const attempt = () => {
    try {
      const fbq = getFbq();
      if (fbq) {
        fn(fbq);
        return;
      }
    } catch {
      return;
    }
    if (++tries > 15) return; // ~3s at 200ms intervals
    setTimeout(attempt, 200);
  };
  attempt();
}

/**
 * Fire the Meta "CompleteRegistration" standard event on a free signup — the Meta equivalent of the
 * Google Ads signup conversion. `eventId` (the new user's id) is passed as the Meta eventID so a
 * future server-side Conversions API event with the same id de-duplicates. Fail-safe.
 */
export function fireMetaSignup(eventId?: string): void {
  try {
    whenFbqReady((fbq) => {
      try {
        if (eventId) {
          fbq("track", "CompleteRegistration", {}, { eventID: eventId });
        } else {
          fbq("track", "CompleteRegistration");
        }
      } catch {
        /* never interrupt the signup flow */
      }
    });
  } catch {
    /* ignore */
  }
}

/**
 * Fire the Meta "StartTrial" standard event. In Glide the free trial begins at signup, so this
 * fires alongside CompleteRegistration on the register page. value:1 is a placeholder for Meta
 * bidding; `eventId` (the new user's id) is the Meta eventID for CAPI de-dup. Fail-safe.
 */
export function fireMetaStartTrial(eventId?: string): void {
  try {
    whenFbqReady((fbq) => {
      try {
        if (eventId) {
          fbq("track", "StartTrial", { value: 1 }, { eventID: eventId });
        } else {
          fbq("track", "StartTrial", { value: 1 });
        }
      } catch {
        /* never interrupt the signup flow */
      }
    });
  } catch {
    /* ignore */
  }
}

/**
 * Fire the Meta "Purchase" standard event on a server-verified checkout — the Meta equivalent of the
 * Google Ads purchase conversion. Value + currency come from the verified Stripe session; the Stripe
 * Checkout Session id is used as the Meta eventID for Conversions-API de-duplication. Fail-safe.
 */
export function fireMetaPurchase(opts: { value: number; currency: string; transactionId: string }): void {
  try {
    if (!opts.transactionId) return;
    whenFbqReady((fbq) => {
      try {
        fbq(
          "track",
          "Purchase",
          { value: opts.value, currency: opts.currency },
          { eventID: opts.transactionId },
        );
      } catch {
        /* never interrupt the post-payment page */
      }
    });
  } catch {
    /* ignore */
  }
}
