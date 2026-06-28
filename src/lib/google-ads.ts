/**
 * Google Ads (gtag.js) tracking module — conversion ID AW-18275931897.
 *
 * The conversion ID is INLINED here (it is public — visible in page source — and
 * the base tag must load with no config dependency). The signup conversion LABEL
 * is supplied at runtime from the server (GOOGLE_ADS_SIGNUP_CONVERSION_LABEL) via
 * configureGoogleAds(); when it is empty, fireSignupConversion() is a no-op so a
 * blank-label conversion is never sent to the Ads account.
 *
 * Never log raw email / PII from this module.
 */

/** Public Google Ads conversion ID. Inlined intentionally (single source of truth). */
export const GOOGLE_ADS_ID = "AW-18275931897";

/** Public Google Ads PURCHASE conversion label (server-verified post-payment). Inlined like the ID. */
export const GOOGLE_ADS_PURCHASE_LABEL = "RRi4CJy30MYcEPmt0opE";

/**
 * Public GA4 measurement ID. Inlined to match how the Ads conversion ID is handled.
 * GA4 shares the SAME gtag.js library as Google Ads (one library, a second config
 * call) and is for analytics + audiences ONLY — it is never routed into Ads as a
 * bidding signal and does not touch the Ads conversion tracking.
 */
export const GA4_MEASUREMENT_ID = "G-MPYQLJXN8X";

type GtagFn = (...args: unknown[]) => void;

// Runtime config, populated by <GoogleAds> (which receives the label from the
// server). Module-scoped so any client code can fire the conversion.
const config: { signupLabel: string } = { signupLabel: "" };

/**
 * User-provided data for enhanced conversions. gtag normalizes + hashes this
 * client-side (SHA-256) when Enhanced Conversions is enabled in the Ads UI; we
 * only ever hold it in memory and never log it.
 */
export interface UserData {
  email?: string;
  phone_number?: string;
  address?: { first_name?: string; last_name?: string };
}

let pendingUserData: UserData | null = null;

function getGtag(): GtagFn | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { gtag?: GtagFn };
  return typeof w.gtag === "function" ? w.gtag : null;
}

/**
 * Run `fn(gtag)` as soon as window.gtag exists. The base tag loads via next/script
 * `afterInteractive` in the root layout, which may not be ready at the exact moment
 * a freshly-loaded page's effect runs (e.g. the post-payment success page) — so we
 * poll briefly rather than silently miss the conversion. Gives up after ~3s. Fail-safe.
 */
function whenGtagReady(fn: (gtag: GtagFn) => void): void {
  if (typeof window === "undefined") return;
  let tries = 0;
  const attempt = () => {
    try {
      const gtag = getGtag();
      if (gtag) {
        fn(gtag);
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

/** Called once by <GoogleAds> with the server-provided signup conversion label. */
export function configureGoogleAds(opts: { signupLabel?: string | null }): void {
  config.signupLabel = (opts.signupLabel || "").trim();
}

/**
 * Provide user-supplied data for enhanced conversions (email at minimum). Stored
 * in memory only and attached to the next conversion via gtag('set','user_data').
 * Shared by both the signup and purchase conversions.
 */
export function setUserData(data: {
  email?: string | null;
  phone?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}): void {
  try {
    const ud: UserData = {};
    if (data.email) ud.email = data.email.trim().toLowerCase();
    if (data.phone) ud.phone_number = data.phone.trim();
    if (data.firstName || data.lastName) {
      ud.address = {};
      if (data.firstName) ud.address.first_name = data.firstName.trim();
      if (data.lastName) ud.address.last_name = data.lastName.trim();
    }
    pendingUserData = Object.keys(ud).length > 0 ? ud : null;
  } catch {
    pendingUserData = null;
  }
}

/** @deprecated alias kept for the signup flow — use setUserData. */
export const setSignupUserData = setUserData;

/**
 * Fire the signup conversion. INERT unless a label was configured. Fully
 * fail-safe — any error is swallowed so it can never break the signup flow.
 *
 * @param transactionId unique id used by Google for conversion de-duplication.
 */
export function fireSignupConversion(transactionId?: string): void {
  try {
    const label = config.signupLabel;
    if (!label) return; // no label configured → no-op (never fire a blank label)
    const gtag = getGtag();
    if (!gtag) return;

    // Enhanced conversions: hand gtag the user-provided data to hash client-side.
    if (pendingUserData) {
      gtag("set", "user_data", pendingUserData);
    }

    gtag("event", "conversion", {
      send_to: `${GOOGLE_ADS_ID}/${label}`,
      ...(transactionId ? { transaction_id: transactionId } : {}),
    });
    pendingUserData = null; // clear so a later conversion can't reuse this user's data
  } catch {
    // Never let a tracking error affect account creation.
  }
}

/**
 * Fire the server-verified PURCHASE conversion. The /checkout/success Server
 * Component only renders the component that calls this AFTER Stripe confirmed the
 * payment is paid AND a server-side fire-once claim succeeded — so the gating is
 * entirely server-side. Fully fail-safe; never blocks the page.
 *
 * @param value         actual amount paid in major units (e.g. 49.0) — never 1.0
 * @param currency      ISO currency from Stripe (e.g. "USD")
 * @param transactionId the canonical Stripe Checkout Session id (cs_...). The future
 *                      server-side upload MUST use this same id so Google dedupes the
 *                      web event against the offline upload (zero double-count).
 */
export function firePurchaseConversion(opts: {
  value: number;
  currency: string;
  transactionId: string;
  /** Runs after gtag confirms the event was sent — used to record the fire-once guard. */
  onSent?: () => void;
}): void {
  try {
    if (!opts.transactionId) return; // never fire with an empty transaction_id
    // Wait for gtag in case the base tag hasn't finished loading on this fresh page.
    whenGtagReady((gtag) => {
      try {
        // Enhanced conversions: hand gtag the user-provided data to hash client-side.
        if (pendingUserData) {
          gtag("set", "user_data", pendingUserData);
        }
        gtag("event", "conversion", {
          send_to: `${GOOGLE_ADS_ID}/${GOOGLE_ADS_PURCHASE_LABEL}`,
          value: opts.value,
          currency: opts.currency,
          transaction_id: opts.transactionId,
          // event_callback fires after gtag sends the hit — used to mark the guard
          // only once the send is confirmed (a failed send leaves the guard unclaimed
          // so the conversion can retry; Google dedupes any retry by transaction_id).
          ...(opts.onSent ? { event_callback: opts.onSent } : {}),
          // Extension point: add `new_customer: true|false` here once first-vs-returning
          // is determined server-side (intentionally omitted for now per the brief).
        });
        pendingUserData = null; // clear so a later conversion can't reuse this user's data
      } catch {
        // ignore — never interrupt the post-payment page
      }
    });
  } catch {
    // Never let a tracking error interrupt the post-payment page.
  }
}
