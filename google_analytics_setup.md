# Task: Add GA4 to the existing gtag setup (do NOT double-load gtag.js)

In the Glide codebase, GA4 has given me a measurement ID: G-MPYQLJXN8X. Add GA4
tracking, but integrate it with the EXISTING Google tag we already load for Google Ads
(AW-18275931897). Do not add a second gtag.js library <script> tag.

Requirements:
- We already load https://www.googletagmanager.com/gtag/js for AW-18275931897. Reuse
  that single library load. Add only a gtag('config', 'G-MPYQLJXN8X') call alongside
  the existing gtag('config', 'AW-18275931897'). One library, two config calls.
- If for any framework reason a separate load is unavoidable, justify it; default is to
  reuse.
- Read the GA4 ID from a client-exposed env var to match repo convention (or inline if
  that's the existing pattern for the Ads ID; be consistent with how AW-18275931897 is
  handled). The G- ID is not a secret.
- Ensure GA4 fires on every page and persists across client-side navigation (SPA route
  changes), same as the Ads tag.
- Do NOT route any GA4 conversion into Google Ads as a bidding signal. GA4 is for
  analytics and audiences only. Do not alter the existing Ads conversion tracking
  (signup label bqRjCNOjo8ccEPmt0opE, purchase RRi4CJy30MYcEPmt0opE) or enhanced
  conversions.
- Do not double-count: verify only one gtag.js library load exists after your change,
  with both config calls present.

Deliverable: the change by file, the env var if used, and how to verify in Tag
Assistant / GA4 DebugView that GA4 is collecting on multiple pages with no duplicate
library load.

---

## ✅ Progress / Execution log (2026-06-28)

**Done.** Added GA4 `G-MPYQLJXN8X` as a SECOND `gtag('config', …)` on the existing
single gtag.js load. No second library; the Ads conversions are untouched.

### Changes by file
- `src/lib/google-ads.ts` — added `export const GA4_MEASUREMENT_ID = "G-MPYQLJXN8X";`
  (inlined, to match how the Ads ID `GOOGLE_ADS_ID` is handled).
- `src/components/google-ads.tsx` — the existing init script (mounted once in the root
  layout) now issues both config calls on the one shared library:
  ```
  gtag('config', 'AW-18275931897');   // existing — Google Ads
  gtag('config', 'G-MPYQLJXN8X');     // new — GA4
  ```
  The single loader `gtag/js?id=AW-18275931897` is unchanged → **one library, two configs**.

### Env var
- **None.** The GA4 ID is inlined to be consistent with the inlined Ads ID
  `AW-18275931897`. The `G-` ID is public, not a secret. (No new env var to add.)

### Design notes
- **One library, two configs** — reuses the existing `<Script id="google-ads-loader">`;
  no second `gtag.js` `<script>` was added. Verified there is still exactly one loader.
- **SPA persistence** — the tag is mounted once in the App Router root layout (it does
  not remount on navigation), and GA4 **enhanced measurement** (on by default) auto-tracks
  `page_view` on Next.js History-API client navigations. No manual `page_view` events were
  added on purpose — that would double-count against enhanced measurement.
- **Kept separate from Ads** — only a GA4 `config` call was added. The signup
  (`bqRjCNOjo8ccEPmt0opE`) and purchase (`RRi4CJy30MYcEPmt0opE`) conversions + enhanced
  conversions are unchanged, and no GA4 event is routed into Ads as a bidding signal.

### Verify (Tag Assistant / GA4 DebugView)
1. Load the site, DevTools → Network, filter `gtag` → confirm
   `googletagmanager.com/gtag/js?id=AW-18275931897` loads **exactly once** (no 2nd library).
2. Google Tag Assistant → confirm **both** tags present: Google Ads `AW-18275931897` AND
   GA4 `G-MPYQLJXN8X`, each with a `config`.
3. GA4 → Admin → **DebugView** (or Realtime): navigate a few routes in-app (`/`,
   `/accounts`, `/transactions`) → confirm GA4 records a `page_view` for each, with no
   duplicate library load.
4. Confirm the Ads conversions still fire on their own events (signup / purchase) — unchanged.

---

### Update (2026-06-28): GA4 ID changed
GA4 measurement ID replaced **`G-MPYQLJXN8X` → `G-4YLLBY4ZM0`** per follow-up request.
The single source of truth is `GA4_MEASUREMENT_ID` in `src/lib/google-ads.ts`, which now
holds `G-4YLLBY4ZM0`; the `gtag('config', …)` call and all verification use that ID.
(Mentions of `G-MPYQLJXN8X` above reflect the original ID.) Still inlined, no env var.


*MICROSOFT CLARITY TAG*
# Task: Add Microsoft Clarity sitewide

In the Glide codebase, add the Microsoft Clarity tracking script (project id
xema6mwgl2). Install it once, sitewide, so it loads in the <head> on EVERY page and
persists across client-side navigation (SPA route changes), the same way the existing
Google tag is loaded.

This is the snippet Clarity gave me:

  <script type="text/javascript">
    (function(c,l,a,r,i,t,y){
        c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
        t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
        y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
    })(window, document, "clarity", "script", "xema6mwgl2");
  </script>

Requirements:
- Load it sitewide via the framework's idiomatic method for injecting a head script
  across all pages (the same mechanism/location used for the Google tag
  AW-18275931897). Do not add it to a single page only.
- Load the Clarity library only ONCE; ensure SPA navigation does not re-inject or
  duplicate it.
- Read the Clarity project id (xema6mwgl2) from a client-exposed env var to match repo
  convention, or inline it if that's the existing pattern for similar tags; be
  consistent. The id is not a secret (it's visible in page source).
- Do not modify or interfere with the existing Google Ads tag, GA4, conversion
  tracking, or enhanced conversions. Clarity is independent analytics; it should sit
  alongside them without touching them.
- Fail safe: a Clarity load failure must never block rendering or break the page.

Deliverable: the change by file, the env var if used, and how to verify (load a few
pages, confirm the Clarity script loads once, and confirm sessions start appearing in
the Clarity dashboard).

---

## ✅ Microsoft Clarity — Execution log (2026-06-29)

**Done.** Installed Microsoft Clarity (project `xema6mwgl2`) sitewide, loaded once,
independent of the Google tag.

### Change by file
- `src/app/layout.tsx` — added a `<Script id="ms-clarity" strategy="afterInteractive">`
  in the root-layout `<body>` (alongside the Crisp + Google tags) running Clarity's
  standard IIFE loader with project id `xema6mwgl2` inlined.

### Env var
- **None.** The Clarity project id is inlined, consistent with the inlined Crisp website
  id and the Ads/GA4 ids. The id is public (visible in page source).

### Design notes
- **Loaded once, sitewide, SPA-safe** — mounted in the App Router root layout (which does
  not remount on client navigation), so the loader runs once and Clarity persists across
  route changes without re-injecting. `next/script` also dedupes by the `id="ms-clarity"`.
  Mirrors the existing Crisp `<Script>` precedent.
- **Independent** — it is a standalone `<Script>`; it does not touch the Google Ads tag,
  GA4, the signup/purchase conversions, or enhanced conversions.
- **Fail-safe** — `afterInteractive` loads after the page is interactive (never blocks
  render), and the loader only appends a script tag; a Clarity load failure can't break
  the page.

### Verify
1. Load the site, DevTools → Network → confirm `https://www.clarity.ms/tag/xema6mwgl2`
   loads **exactly once**; navigate a few routes in-app and confirm it is **not** re-requested.
2. Clarity dashboard → Recordings/Sessions → confirm new sessions appear after browsing.
3. Confirm the Google tag (`gtag/js?id=AW-18275931897`), GA4, and Ads conversions are unaffected.