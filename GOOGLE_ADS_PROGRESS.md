# Google Ads Setup — Progress Log

**Task source:** `google_ads_setup.md`
**Conversion ID:** `AW-18275931897`
**Started:** 2026-06-28

This is a living log. Status legend: `[ ]` not started · `[~]` in progress · `[x]` done · `[!]` blocked / needs user.

## Scope (from the brief)
- **Phase 1:** Install the Google tag (gtag.js) sitewide, idiomatically, loaded **once**, persisting across client-side navigation.
- **Phase 2:** Capture `gclid`/`gbraid`/`wbraid` (last-click-wins) → first-party cookie + localStorage + timestamp → persist to the user at signup (+ DB migration). Optional first-touch UTM + landing path.
- **Phase 3:** Prepare enhanced conversions + `fireSignupConversion()`, **inert** until `GOOGLE_ADS_SIGNUP_CONVERSION_LABEL` is set.
- **OUT OF SCOPE (next stage):** server-side paid conversion upload / any Google Ads API call.

## Task checklist
### Phase 0 — Discovery
- [x] Stack, rendering model, idiomatic script injection, SPA-nav persistence
- [x] Whether gtag.js / GA4 / GTM is already loaded anywhere
- [x] Signup flow (client + server) + user model + migration convention
- [x] Env-var conventions (client-exposed vs server)

### Phase 1 — Google tag
- [x] Load gtag.js once sitewide via the framework's idiomatic mechanism
- [x] `dataLayer` + `gtag('js', …)` + `gtag('config', 'AW-18275931897')`

### Phase 2 — Click-ID capture
- [x] Read `gclid`/`gbraid`/`wbraid` on every load
- [x] First-party cookie (90d, SameSite=Lax, Secure, JS-readable) + localStorage + timestamp, last-click-wins
- [x] Persist across navigation
- [x] Write click ID + type + timestamp to the user at signup
- [x] DB migration for the new columns
- [x] Organic users handled cleanly (no errors, no empty-string noise)
- [x] (Optional) first-touch utm_source/medium/campaign + landing path

### Phase 3 — Enhanced conversions + signup conversion (inert)
- [x] Tracking module: set user_data (email min) + `fireSignupConversion()`
- [x] Enhanced conversions via explicit gtag method (current spec)
- [x] `fireSignupConversion()` wired to successful signup: label from env, unique `transaction_id`, `user_data`
- [x] Inert when `GOOGLE_ADS_SIGNUP_CONVERSION_LABEL` empty/absent
- [x] No raw PII logged anywhere

### Deliverables
- [x] Code changes in logical commits
- [x] DB migration
- [x] SETUP.md (env vars, Google Ads UI steps, how the label flips tracking on)
- [x] Verification plan

## Discovery findings (Phase 0 — ✅ complete)
- **Stack:** Next.js 15.5.9, App Router, single root layout `src/app/layout.tsx` (Server Component). `next/script` is already imported (L12) and used for the Crisp chat widget (`afterInteractive`, L63–65). The App Router root layout does **not** remount on client-side navigation, so a `<Script>` placed there loads **once** and persists sitewide. → Install the tag here, mirroring the Crisp pattern.
- **Existing analytics:** **No** gtag.js / GA4 / GTM anywhere (verified — only matches are the spec/progress docs). → Fresh single load; nothing to dedupe. Do **not** use `@next/third-parties` (not installed; its helpers target GA4 `G-`/GTM `GTM-` IDs, not a Google Ads `AW-` ID). Must not disturb Sentry (client init + Session Replay) or Crisp.
- **Signup:** server `src/app/api/auth/register/route.ts` reads `{ email, password, name }` (extra body keys are ignored → safe to add a tracking field), user row created at L69–81. Client `src/app/register/page.tsx` POSTs at L60–70; the account exists once past the `!response.ok` throw (L76), so that's the reliable point to fire the conversion (before the Stripe-checkout early `return`). `User` model at `prisma/schema.prisma` L11–42; SQL table is the quoted `"User"`. Migrations are **hand-written SQL** in `prisma/migrations/` applied via `prisma db execute` + `prisma generate` (precedent: `add_cost_basis_method`).
- **Env:** convention is `NEXT_PUBLIC_*` read via static `process.env.NEXT_PUBLIC_X` (only `NEXT_PUBLIC_SENTRY_DSN` exists today). Decisions:
  - **(a) Conversion ID `AW-18275931897` is inlined** as a single `const` in `src/lib/google-ads.ts` — the Phase-1 tag is *required*, so it must load with no config dependency (matches the inlined-Crisp-ID precedent). Documented as inlined; not an env var.
  - **(b) Signup label** keeps the brief's exact name `GOOGLE_ADS_SIGNUP_CONVERSION_LABEL` and is read **server-side** in the layout, then passed to the client tag component as a prop. This honors the brief's var name (no `NEXT_PUBLIC_` rename needed) and is a true no-op when empty. (Note: changing it on Vercel requires a redeploy.)

**Implementation file plan:** `src/lib/google-ads.ts` (ID const + setUserData + fireSignupConversion), `src/lib/click-id.ts` (capture/retrieve), `src/components/google-ads.tsx` (client: Scripts + configure + capture on mount), `src/app/layout.tsx` (mount it), `prisma/schema.prisma` + migration (User columns), `src/app/api/auth/register/route.ts` (persist), `src/app/register/page.tsx` (read cookie → POST + fire conversion), `env.example`, `GOOGLE_ADS_SETUP.md`.

## Implementation log
- **Phase 1 (tag):** `src/lib/google-ads.ts` (inlined ID `GOOGLE_ADS_ID`, `configureGoogleAds`, `setSignupUserData`, `fireSignupConversion`), `src/lib/click-id.ts` (capture/retrieve), `src/components/google-ads.tsx` (`"use client"` — renders the two `next/script` tags + configures the module + captures the click ID on mount), mounted once in `src/app/layout.tsx`. Loads `gtag.js?id=AW-18275931897` once sitewide via the Crisp-style `afterInteractive` pattern.
- **Phase 2 (click ID):** capture on every load → `glide_ad_click` cookie (90d, SameSite=Lax, Secure on https, JS-readable) + localStorage + `capturedAt`, last-click-wins, organic = no-op. Persisted at signup: `register/page.tsx` reads the cookie and adds `adTracking` to the POST; `api/auth/register/route.ts` sanitizes + writes `adClickId/adClickIdType/adClickCapturedAt` (+ optional `utm*`/`landingPath`) to the user. Migration `20260628000000_add_ad_click_tracking_to_user` applied to the live DB (7 columns verified). Optional first-touch UTM included, clearly marked as droppable.
- **Phase 3 (conversion, inert):** `fireSignupConversion()` uses the explicit gtag enhanced-conversions method (`gtag('set','user_data',…)` → `gtag('event','conversion',{ send_to: 'AW-18275931897/<label>', transaction_id })`). Wired in `register/page.tsx` right after the registration succeeds (before any redirect), with the new user's id as `transaction_id`. **Inert** until the label is set; fully fail-safe; no PII logged.
- **Verified:** `tsc` clean on all touched files; `npm run build` exit 0; migration applied + columns confirmed.

## Env vars introduced
- `GOOGLE_ADS_SIGNUP_CONVERSION_LABEL` — **leave blank** until the Google Ads signup conversion action exists. Blank ⇒ `fireSignupConversion()` is a no-op. Read server-side (layout) and passed to the client tag (no `NEXT_PUBLIC_` needed). Set in Vercel (Production) + `.env.local`; **changing it needs a redeploy**.
- Conversion ID `AW-18275931897` is **inlined** in `src/lib/google-ads.ts` (not an env var).
- Also documented the pre-existing `NEXT_PUBLIC_SENTRY_DSN` in `env.example` (was an undocumented gap).

## What the user must do in Google Ads / config  (see GOOGLE_ADS_GO_LIVE.md)
1. Deploy, then confirm the **AW-18275931897** tag is detected (Ads → Conversions → Diagnostics / Tag Assistant).
2. Create the **Sign-up** conversion action; copy its **label**.
3. Set `GOOGLE_ADS_SIGNUP_CONVERSION_LABEL` in Vercel + **redeploy** → activates signup tracking (no code change).
4. Enable **Enhanced Conversions** (Google tag method) + accept terms; set the conversion window.
5. (Next stage, out of scope) server-side gclid→revenue upload via the Ads API.

## Verification  (full plan in GOOGLE_ADS_GO_LIVE.md)
- **Tag:** Network panel — `gtag/js?id=AW-18275931897` loads exactly once; not re-requested on client-side navigation.
- **Click ID:** visit `/?gclid=TEST123` → `glide_ad_click` cookie written; sign up → `User.ad_click_id=TEST123`, type/timestamp set; clean URL → columns null, no errors.
- **Conversion:** after the label is set + redeploy, Tag Assistant shows a conversion to `AW-18275931897/<label>` with `transaction_id` + `user_data`; before it's set, none fires.

## Status: ✅ Code complete and pushed. Remaining is the user's Google Ads UI config (above) to activate the signup conversion.
