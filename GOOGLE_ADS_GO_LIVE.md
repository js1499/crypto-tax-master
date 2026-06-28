# Google Ads — Setup & Go-Live Guide

What's installed in code, the env vars, the steps **you** do in the Google Ads UI to go
live, and how to verify each piece end to end.

**Conversion ID:** `AW-18275931897` (inlined in `src/lib/google-ads.ts` — it's public).

---

## 1. What's installed (code)

| Piece | Where | Status |
|---|---|---|
| Google tag (gtag.js) sitewide | `src/components/google-ads.tsx`, mounted once in `src/app/layout.tsx` | ✅ Active |
| Click-ID capture (gclid/gbraid/wbraid) + first-touch UTM | `src/lib/click-id.ts` (runs on every load) | ✅ Active |
| Persist click ID + UTM to the user at signup | `src/app/register/page.tsx` → `src/app/api/auth/register/route.ts` → `User` columns | ✅ Active |
| Enhanced conversions + `fireSignupConversion()` | `src/lib/google-ads.ts` | ⏸️ **Inert** until the label env var is set |

The base tag and click-ID capture work **now** with no configuration. The signup
**conversion** stays dormant (a no-op) until you create the conversion action and set its
label — see §3.

---

## 2. Environment variables

| Var | Where to set | Value | Notes |
|---|---|---|---|
| `GOOGLE_ADS_SIGNUP_CONVERSION_LABEL` | Vercel → Settings → Environment Variables (Production), and `.env.local` for dev | **Blank for now.** Later: the label from the Google Ads conversion action (the part after the slash in `AW-18275931897/XXXX`). | Read **server-side** and passed to the client tag. Blank ⇒ `fireSignupConversion()` is a no-op. **Changing it requires a redeploy** to take effect. |
| `NEXT_PUBLIC_SENTRY_DSN` | (pre-existing; now documented) | your client Sentry DSN | Unrelated to Ads; added to `env.example` to close a doc gap. |

The **conversion ID is not an env var** — it's inlined in `src/lib/google-ads.ts`
(`GOOGLE_ADS_ID`). To change it, edit that one constant.

> **Why the label has no `NEXT_PUBLIC_` prefix:** Next.js only inlines `NEXT_PUBLIC_*`
> vars into the browser bundle. Rather than rename it, the root layout (a Server
> Component) reads `process.env.GOOGLE_ADS_SIGNUP_CONVERSION_LABEL` and passes it to the
> client `<GoogleAds>` tag as a prop. Same effect; keeps the brief's variable name.

---

## 3. What you do in the Google Ads UI (to go live)

1. **Confirm the tag is detected.** Deploy first (the tag is already in code). Then in
   Google Ads → **Goals → Conversions → Diagnostics** (or Google Tag Assistant), confirm
   the tag for **AW-18275931897** is firing on the live site.
2. **Create the signup conversion action.** Goals → Conversions → **+ New conversion
   action → Website**. Category: **Sign-up**. Counting: **One**. Set a **conversion
   window**. After saving, open it → "Tag setup → Use Google tag" and **copy the
   conversion label** (the string after the slash in `send_to: AW-18275931897/<LABEL>`).
3. **Set the env var + redeploy.** Put that label in
   `GOOGLE_ADS_SIGNUP_CONVERSION_LABEL` in Vercel (Production) and **redeploy**. That one
   step activates signup tracking — **no code change**.
4. **Enable Enhanced Conversions.** In the conversion action (or Conversions → Settings →
   Enhanced conversions): turn it **on**, choose the **Google tag** method, and **accept
   the terms**. The code already passes `user_data` (email, and name if given); Google
   hashes it client-side once this is enabled.
5. (Optional) Confirm the conversion window and value settings match your goals.

The **server-side paid-conversion upload / Offline Conversions API** (uploading the
captured `gclid` with revenue) is intentionally **not** built — that's the next stage and
needs the conversion IDs + API access. The click ID is already captured and stored on
each user, ready for it.

---

## 4. Verification plan

### A. Base tag loads once, sitewide, survives SPA navigation
- Site open, DevTools → **Network**, filter `gtag`. Confirm
  `googletagmanager.com/gtag/js?id=AW-18275931897` loads **exactly once**.
- Navigate client-side (e.g. Accounts → Transactions). Confirm gtag.js is **not**
  re-requested (no duplicate library load) and `window.dataLayer` still exists.
- Spot-check `/`, `/register`, `/accounts` — the tag is present on all.

### B. Click-ID capture → persists to the user
- Visit `https://<your-domain>/?gclid=TEST123`. DevTools → Application → Cookies: confirm
  a `glide_ad_click` cookie with `clickId:"TEST123"`, `clickIdType:"gclid"`, and a
  `capturedAt` timestamp (also mirrored in localStorage).
- Navigate around, then **sign up**. Confirm the new `User` row has `ad_click_id =
  TEST123`, `ad_click_id_type = gclid`, `ad_click_captured_at` set (and `utm_*` /
  `landing_path` if those params were present).
- Sign up from a clean URL (no `gclid`) → those columns are **null** (organic, no errors).

### C. Signup conversion (after the label is set)
- With `GOOGLE_ADS_SIGNUP_CONVERSION_LABEL` set + redeployed, install **Google Tag
  Assistant**, sign up a test account, and confirm a **conversion** event fires to
  `AW-18275931897/<label>` with a `transaction_id` (the new user's id) and `user_data`
  present (enhanced conversions). Before the label is set, confirm **no** conversion fires.

---

## 5. Guardrails baked into the code
- **Never breaks signup:** click-ID read and conversion firing are wrapped fail-safe; a
  tracking error cannot fail account creation.
- **Never fires a blank label:** `fireSignupConversion()` early-returns on an empty label,
  so no placeholder conversion can pollute the account.
- **No PII logged:** the tracking module never logs raw email/phone/name.
- **No double-load:** the tag is mounted once in the root layout, not per page.

## 6. Dropping the optional UTM tracking
First-touch `utm_source/medium/campaign` + `landing_path` are captured as a convenience.
To remove: delete the UTM block in `src/lib/click-id.ts`, the four `utm*`/`landingPath`
fields in `prisma/schema.prisma` (`model User`) and the matching lines in the register
route, then drop the columns (`utm_source`, `utm_medium`, `utm_campaign`, `landing_path`)
from `"User"`. The click-ID capture is independent and unaffected.
