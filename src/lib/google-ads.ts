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

/** Called once by <GoogleAds> with the server-provided signup conversion label. */
export function configureGoogleAds(opts: { signupLabel?: string | null }): void {
  config.signupLabel = (opts.signupLabel || "").trim();
}

/**
 * Provide user-supplied data for enhanced conversions (email at minimum). Stored
 * in memory only and attached to the next conversion via gtag('set','user_data').
 */
export function setSignupUserData(data: {
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
  } catch {
    // Never let a tracking error affect account creation.
  }
}
