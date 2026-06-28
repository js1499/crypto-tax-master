# Task: Install the Google tag (Google Ads) + click-ID capture, and pre-wire enhanced conversions

You are working in the Glide codebase (crypto and equities tax SaaS). Google Ads has
issued the Google tag and is asking me to install it. Do that sitewide, and while
you're in here, do the two adjacent things that have no external dependency: capture
the Google click ID on every visit and persist it to the user at signup, and prepare
(but do not activate) enhanced conversions and the signup conversion event so the next
stage is a config change rather than a build.

This is the exact tag Google Ads gave me (conversion ID AW-18275931897). Install this,
adapted to the framework's idiomatic script-injection method (do not paste raw <script>
tags if the framework has a proper mechanism):

  <!-- Google tag (gtag.js) -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=AW-18275931897"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', 'AW-18275931897');
  </script>

Scope boundary: do NOT build the server-side paid conversion upload or any Google Ads
API integration in this task. That is the next stage and needs IDs and API access I
don't have yet. Capture the click ID now; stop there on the revenue loop.

## Step 0: Discover before writing code
Investigate and report back briefly before implementing:
1. Stack: frontend framework and rendering model (SSR/SSG/CSR), how third-party
   scripts are currently injected, how client-side navigation works (so the tag
   persists across route changes in a SPA, not just first load).
2. Whether a Google tag / gtag.js / GA4 is ALREADY loaded anywhere. gtag.js is a
   shared library: if it's already present, add the config call for AW-18275931897
   rather than loading the library a second time.
3. Signup flow: where account creation happens (client call and server handler), the
   user model/schema, and where I'd add columns.
4. Where env vars/secrets live, and the convention for client-exposed (public) env
   vars in this framework.

## Phase 1: Install the Google tag (required)
- Load gtag.js on EVERY page (it is the base tag, not a per-page snippet), using the
  framework's idiomatic script mechanism, loaded once and persisting across
  client-side navigation. A common failure is loading it only on the homepage or
  re-injecting it on every route change; avoid both.
- Use conversion ID AW-18275931897 as shown above. The ID is not a secret (it's
  visible in page source). You may inline it, OR if the repo already uses env vars for
  similar third-party config, read it from a client-exposed env var to match repo
  conventions. Pick one and be consistent; don't half-do both.
- Initialize dataLayer and call gtag('js', new Date()) and
  gtag('config', 'AW-18275931897') per the snippet, adapted to this framework.
- If GA4/gtag already exists, reuse the single library load and just add the config
  call for AW-18275931897. Do not double-load the library.

## Phase 2: Capture and persist the Google click ID (do this now; no dependency)
- On every page load, read gclid, gbraid, and wbraid from the URL query string.
- If any is present, store it (last click wins: overwrite any existing value) in a
  first-party cookie with: 90+ day expiry, SameSite=Lax (must survive the redirect
  from Google), Secure, and readable by JS (not httpOnly, since the signup flow needs
  to read it). Mirror to localStorage as a fallback. Record a capture timestamp.
- Persist the value across navigation so it survives until the user signs up.
- At account creation, write the stored click ID, its type (gclid/gbraid/wbraid), and
  the capture timestamp onto the user record. Add a DB migration for these columns.
- Organic users will have no click ID; handle that cleanly with no errors and no
  empty-string noise.
- (Optional, cheap, useful later) Also capture first-touch utm_source/medium/campaign
  and landing path into the same cookie and onto the user record. Mark this clearly so
  I can drop it if I don't want it.

## Phase 3: Prepare enhanced conversions + the signup conversion, but DO NOT activate
- Create a small tracking module exposing: a way to set user-provided data for
  enhanced conversions (email at minimum; phone/name if readily available at signup),
  and a fireSignupConversion() helper.
- Enhanced conversions: use the explicit Google tag (gtag) method, passing
  user-provided data so the tag normalizes and hashes it client-side. Do NOT rely on
  automatic field detection (it scrapes the DOM and is fragile). Follow Google's
  CURRENT gtag enhanced-conversions spec for the exact call shape; don't assume a
  remembered signature.
- Wire fireSignupConversion() to run on successful signup, sending to AW-18275931897
  with a conversion label read from env, a unique transaction_id for dedup, and the
  user_data for enhanced conversions.
- CRITICAL: this must be INERT until the label env var is set. If
  GOOGLE_ADS_SIGNUP_CONVERSION_LABEL is empty/absent, fireSignupConversion() is a
  no-op. Never fire a conversion with a blank or placeholder label; that pollutes the
  Ads account. Once I create the conversion action and set the env var, it activates
  with no further code change.
- Never log raw email or PII anywhere in this module.

## Do not
- Do not load gtag.js more than once.
- Do not fire any conversion with a missing/placeholder label; signup tracking stays
  inert until the label is configured.
- Do not build the server-side paid upload or any Ads API call in this task (next
  stage). Click-ID capture is in scope; the upload is not.
- Do not break or block signup. Click-ID capture and conversion firing must fail safe:
  a tracking error must never fail account creation.
- Do not log raw PII.
- Do not modify GA4/Clarity/other analytics, but do not break existing GA4 if present.

## Env vars to stub and list for me
- GOOGLE_ADS_SIGNUP_CONVERSION_LABEL  (leave blank for now; I'll fill it when I create
  the signup conversion action, which activates Phase 3)
- (Only if you chose the env-var route for the tag ID) the client-exposed var holding
  AW-18275931897; otherwise note that it's inlined.

## Deliverables
1. Code changes listed by file, in logical commits (tag install / click-ID capture /
   enhanced-conversion prep).
2. The DB migration for the click-ID (and optional UTM) columns.
3. A SETUP.md covering: every env var and where to put it; the steps I do next in the
   Google Ads UI (confirm the AW-18275931897 tag is detected, create the signup
   conversion action and copy its label, enable Enhanced Conversions via the Google tag
   method and accept the terms, set the conversion window); and how setting
   GOOGLE_ADS_SIGNUP_CONVERSION_LABEL flips signup tracking on.
4. A verification plan: confirm gtag.js for AW-18275931897 loads exactly once on
   multiple pages and after client-side navigation (check network requests, no
   duplicate library load); confirm visiting a page with ?gclid=TEST123 writes the
   cookie and that it persists to the user record on signup; and, once the label is
   set, confirm the signup conversion fires with enhanced-conversion user_data using
   Google Tag Assistant.

When done, summarize what you changed, what I must configure in Google Ads to go live,
and how to verify each piece end to end.


***NEW PROMPT***

# Task: Build the post-payment success page + Google Ads Purchase conversion (page-load, server-verified)

You are working in the Glide codebase (crypto and equities tax SaaS). Build a
post-payment success page and fire the Google Ads Purchase conversion on it, server-
verified, with the real amount paid and enhanced conversions attached. Integrate with
the prior tasks (the Google tag AW-18275931897 + click-ID capture + the
enhanced-conversions/tracking module + the now-live signup conversion). Do not create a
parallel or conflicting tracking setup.

This is the Purchase event snippet Google gave me (conversion ID AW-18275931897, label
RRi4CJy30MYcEPmt0opE). value and transaction_id below are placeholders and MUST be
replaced as described, never shipped literally:

  <!-- Event snippet for Purchase conversion page -->
  <script>
    gtag('event', 'conversion', {
        'send_to': 'AW-18275931897/RRi4CJy30MYcEPmt0opE',
        'value': 1.0,
        'currency': 'USD',
        'transaction_id': ''
    });
  </script>

## Step 0: Discover and report back BEFORE writing code
1. Stack and routing: framework, rendering model (SSR/SSG/CSR), how server-side data
   reaches a page, how redirects are done.
2. Stripe integration: which product is in use (Checkout, Payment Links,
   Billing/Subscriptions, or Elements/PaymentIntents), and exactly where a payment is
   confirmed in the current code. Identify the canonical "this payment truly
   succeeded" object and its id (Checkout Session cs_..., PaymentIntent pi_..., or
   Invoice in_...).
3. Conversion model: charge-at-signup (one session) or free-signup-then-pay (a gap).
   Determine from the code, not assumption.
4. Value + identity at success: where the actual amount paid, the currency, and the
   customer email are available from the verified Stripe object (e.g. amount_total,
   currency, customer_details.email). Confirm the real per-plan price
   (Active/Pro/Prime) flows through, not a flat number.
5. Prior tasks: how the tracking module exposes enhanced-conversions user_data and the
   conversion helpers, and the columns added for the click ID, so you extend rather
   than duplicate.
   Report findings before implementing. If Stripe genuinely cannot return a verifiable
   payment object to this page (e.g. fully off-site flow with no retrievable session),
   say so; that purchase would then have to be tracked server-side only.

## Phase 1: Build the success page (reachable ONLY on confirmed payment)
- Create a dedicated post-payment success route (e.g. /checkout/success or
  /welcome). After a successful payment, Stripe (or your post-payment handler) sends
  the user here with a reference to the payment (e.g. the Checkout Session id in the
  URL, per Stripe's success_url pattern), OR your server sets a verified state.
- CRITICAL anti-spoof: do NOT fire the conversion merely because this URL loaded.
  Server-side, retrieve the payment object from Stripe by its id and verify it is
  genuinely paid (e.g. session payment_status === 'paid', or PaymentIntent status ===
  'succeeded'). Only a server-verified-paid result is allowed to fire the conversion.
  If verification fails or is absent, render the page WITHOUT firing and send the user
  onward; never fire on an unverified hit, refresh, or direct URL visit.
- After the conversion fires, provide the redirect/CTA back into the product as
  intended.

## Phase 2: Fire the Purchase conversion with real, server-verified data
- Fire the conversion ONLY on the server-verified-paid result from Phase 1.
- value: the actual amount paid from the verified Stripe object (real number, e.g.
  49.0), passed dynamically. NEVER 1.0. currency: from Stripe (USD).
- transaction_id: the verified Stripe payment id (the same canonical id from Step 0,
  e.g. the Checkout Session id or PaymentIntent id). This MUST be the id the future
  server-side webhook will use for this same purchase, so Google dedupes web vs server.
- Attach enhanced conversions: set user_data (email at minimum, from the verified
  Stripe object or the logged-in user; phone/name if readily available) via the current
  gtag enhanced-conversions method so it hashes client-side, with/before this event.
  Reuse the prior task's module. Follow Google's CURRENT spec for the call shape; do not
  assume a remembered signature.
- Do NOT send new_customer for now. Leave a clearly marked extension point for it.
- The conversion ID/label may be inlined (public) or read from env to match repo
  convention; pick one, consistently.

## Phase 3: Fire-once guard
- Guarantee at most one conversion per payment even if the success page is refreshed,
  reopened, or back-navigated. Use a guard keyed to the payment id (e.g. persist that
  this id already fired, server-side preferred), in addition to the transaction_id
  dedup. A second load of the same successful payment must NOT fire again.
- Never fire for free/organic users or any non-payment state.

## Phase 4: Forward-compatibility with the server-side webhook (do NOT build it now)
- Do not build the Google Ads API / offline-conversion webhook in this task; it is the
  next stage and needs API access I don't have yet.
- But structure this so that the SAME conversion action (RRi4CJy30MYcEPmt0opE) and the
  SAME transaction_id (the canonical Stripe payment id) can later be sent server-side,
  letting Google dedupe the web event against the server upload with zero double-count.
  State clearly in your summary which exact Stripe id you used as transaction_id so the
  webhook uses the identical one.

## Reconcile with existing conversions
- The signup conversion (label bqRjCNOjo8ccEPmt0opE) is live and fires on signup
  success as a SEPARATE event. Keep signup and purchase distinct and non-overlapping;
  do not let one suppress or double-fire the other. Both should fire on their own
  events, cleanly.

## Do not
- Do not ship value: 1.0 or an empty transaction_id. Both are required corrections.
- Do not fire on a generic render, refresh, direct URL hit, or any unverified or
  non-paid state. Server-verified-paid only.
- Do not double-count: one method per action now (web), with transaction_id chosen so
  the future webhook dedupes.
- Do not build the Ads API upload in this task; only make it forward-compatible.
- Do not break or block checkout or the redirect. Tracking must fail safe: a tracking
  error must never fail or interrupt a payment or trap the user on the success page.
- Do not log raw email or PII.

## Deliverables
1. Code changes by file, in logical commits (success page / server-side payment
   verification / conversion fire + guard).
2. Any new route, env var, or config, listed.
3. A SETUP.md note: the success route and how Stripe sends users to it; how payment is
   verified server-side; where value, currency, and transaction_id come from (name the
   exact Stripe id used); and what I confirm in the Google Ads UI for the Purchase
   action (category Purchase; value setting = "Use different values for each
   conversion"; Count = One; leave it Secondary for now).
4. Verification plan: with Stripe test mode, complete a real test purchase and confirm
   via Google Tag Assistant that the Purchase conversion fires exactly once, with a
   non-1.0 dynamic value matching the plan price, a populated transaction_id (the Stripe
   id), and enhanced-conversions user_data present; confirm refreshing the success page
   does NOT fire again; confirm hitting the success URL directly without a valid paid
   session does NOT fire; confirm organic signup does not fire it.

When done, summarize what fires where, the exact Stripe id used as transaction_id, what
I must set in Google Ads, and how to verify end to end.