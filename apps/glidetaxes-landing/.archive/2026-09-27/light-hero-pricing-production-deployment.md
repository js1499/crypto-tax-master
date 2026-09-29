---
tags: [vercel, production, light-hero, pricing, guarantee, copy]
category: release
related: [light-hero-palette, hero-label-control-cleanup, pricing-guarantee-and-restored-headings, faster-hero-production-deployment]
---

# Light hero and pricing production deployment - 2026-09-27

## Summary
Published the light hero, removed supporting labels and controls, restored integrations/trial headings, and prominent pricing guarantee.

## Deployment
- Command: `npx.cmd vercel deploy --prod --yes`
- Project: `jatinsawlani-gmailcoms-projects/glidetaxes-landing`
- ID: `dpl_CvooTfNgCynQihmhE4SDC45o7YBM`
- Deployment URL: `https://glidetaxes-landing-et9ohukgp-jatinsawlani-gmailcoms-projects.vercel.app`
- Stable URL: `https://glidetaxes-landing.vercel.app/alternative`
- Inspect: `https://vercel.com/jatinsawlani-gmailcoms-projects/glidetaxes-landing/CvooTfNgCynQihmhE4SDC45o7YBM`
- Vercel build succeeded; `vercel inspect` confirms production Ready and stable alias assigned. No domain/routing changes.

## Verification
- `/alternative` and `/pricing` return HTTP 200.
- Hero background is `rgb(246, 249, 254)` and headline is dark navy `rgb(11, 36, 71)`.
- Requested labels and playback controls are absent. The workflow finishes once at 9,000ms and holds reports fully visible.
- Integrations: “One clear result for your whole portfolio.” Trial: “See your result free. Pay when you are ready to file.” Pricing heading: “Pricing”.
- Prominent guarantee callout present. Both comparisons include the guarantee directly after Price. Trial is Not applicable; four paid plans are Included.
- Desktop has no horizontal overflow or browser page errors.
- Live 390px normal and 320px reduced-motion checks pass: no overflow, clipped headings, or browser errors; both CTAs fit 16px margins; guarantee banner and row are correct. Normal playback holds reports after 9,000ms; reduced motion stays static at 8,250ms.
- Pre-deployment validation: `npm.cmd run check` passed; Playwright 37 passed / 5 intentional skips; four targeted comparison regressions passed.

## Build Notices
Existing Node `>=24` engine and `unrs-resolver` install-script notices remain non-blocking. No dependency changes in this release.
