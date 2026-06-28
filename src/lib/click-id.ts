/**
 * Google click-ID capture (gclid / gbraid / wbraid) + optional first-touch UTM.
 *
 * Stored in a first-party, JS-readable cookie (so the signup form can read it on
 * submit) with a localStorage mirror and a capture timestamp. Last click wins.
 * Every access is wrapped so a tracking failure can never break the page or the
 * signup flow. Organic visits (no click ID) write nothing.
 */

const COOKIE_NAME = "glide_ad_click";
const COOKIE_MAX_AGE_DAYS = 90;

export type ClickIdType = "gclid" | "gbraid" | "wbraid";

export interface AdClickData {
  clickId: string;
  clickIdType: ClickIdType;
  capturedAt: string; // ISO timestamp
  // Optional first-touch attribution (see the UTM note in the migration / SETUP).
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  landingPath?: string;
}

// Priority order when more than one is present (rare). gclid is the standard
// web click ID; gbraid/wbraid are the iOS app/web variants.
const CLICK_ID_PARAMS: ClickIdType[] = ["gclid", "wbraid", "gbraid"];

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function writeCookie(value: string): void {
  const maxAge = COOKIE_MAX_AGE_DAYS * 24 * 60 * 60;
  // Secure on https only (so it still works on http://localhost in dev).
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  // SameSite=Lax so the cookie survives the top-level redirect back from Google;
  // NOT HttpOnly because the signup form reads it client-side.
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(value)}; Max-Age=${maxAge}; Path=/; SameSite=Lax${secure}`;
}

function readCookie(): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Read click-ID + UTM params from the current URL and persist them (last click
 * wins). No-op when there's no click ID. Call on every page load (client-side);
 * safe to call repeatedly.
 */
export function captureClickIdFromUrl(): void {
  if (!isBrowser()) return;
  try {
    const params = new URLSearchParams(window.location.search);

    let clickId: string | null = null;
    let clickIdType: ClickIdType | null = null;
    for (const p of CLICK_ID_PARAMS) {
      const v = params.get(p);
      if (v) {
        clickId = v;
        clickIdType = p;
        break;
      }
    }

    // Organic visit (no click ID): write nothing, leave any prior value intact.
    if (!clickId || !clickIdType) return;

    const data: AdClickData = {
      clickId,
      clickIdType,
      capturedAt: new Date().toISOString(),
    };

    // Optional first-touch UTM + landing path. Drop this block (and the matching
    // DB columns) if you don't want UTM attribution.
    const utmSource = params.get("utm_source");
    const utmMedium = params.get("utm_medium");
    const utmCampaign = params.get("utm_campaign");
    if (utmSource) data.utmSource = utmSource;
    if (utmMedium) data.utmMedium = utmMedium;
    if (utmCampaign) data.utmCampaign = utmCampaign;
    data.landingPath = window.location.pathname;

    const serialized = JSON.stringify(data);
    writeCookie(serialized);
    try {
      window.localStorage.setItem(COOKIE_NAME, serialized);
    } catch {
      /* localStorage may be unavailable (private mode); the cookie is primary */
    }
  } catch {
    /* never throw from capture */
  }
}

/** Read the stored click-ID data (cookie first, then localStorage). null if none. */
export function getStoredClickId(): AdClickData | null {
  if (!isBrowser()) return null;
  try {
    const raw = readCookie() || window.localStorage.getItem(COOKIE_NAME);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AdClickData;
    if (!parsed || !parsed.clickId || !parsed.clickIdType) return null;
    return parsed;
  } catch {
    return null;
  }
}
