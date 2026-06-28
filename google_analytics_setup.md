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