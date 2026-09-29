---
tags: [vercel, production, hero, guarantee, animation, visual-polish]
category: release
related: [plain-hero-and-site-polish, light-hero-pricing-production-deployment]
---

# Plain hero and site polish production deployment - 2026-09-27

## Deployment
- Command: `npx.cmd vercel deploy --prod --yes`
- Project: `jatinsawlani-gmailcoms-projects/glidetaxes-landing`
- ID: `dpl_AdeUQamxT9GMwGffTvTnUmXHhPUa`
- Deployment URL: `https://glidetaxes-landing-66d1ld9r7-jatinsawlani-gmailcoms-projects.vercel.app`
- Stable URL: `https://glidetaxes-landing.vercel.app/alternative`
- Inspect: `https://vercel.com/jatinsawlani-gmailcoms-projects/glidetaxes-landing/AdeUQamxT9GMwGffTvTnUmXHhPUa`
- Vercel production build succeeded and `vercel inspect` confirms Ready with existing aliases assigned. No custom-domain or application-routing changes.

## Verified Desktop
- `/alternative` and `/pricing` return HTTP 200.
- Hero solid background is `rgb(244, 247, 251)` with `background-image: none`; desktop height remains 760px.
- Exact user-provided 95% supporting copy appears, with one hero link to `/register` and preserved analytics event.
- Separate hero guarantee and pricing guarantee are present with paid-plan qualifiers.
- Workflow uses 12,400ms infinite timeline, 36px desktop step descriptions, nine-second story plus three-second report hold and 400ms reset.
- Integrations eyebrow is absent. No document overflow or browser page errors at 1440px.
- Pre-deployment checks: lint, TypeScript, build, 37 Playwright cases (5 intentional skips), desktop/mobile Axe, and production audit with zero vulnerabilities.

## Build Notices
Existing Node `>=24` engine and `unrs-resolver` install-script notices remain non-blocking. No dependency changes in this release.

## Verified Mobile
- Live 390px normal and 320px reduced-motion pages return HTTP 200 with exact copy, solid background, single hero CTA, both guarantee panels, and no integrations eyebrow.
- No horizontal overflow. Step descriptions are 24px at 390px and 22px at 320px.
- Natural playback held reports at 9.016s and 10.533s, then restarted account selection at 12.416s on iteration one. Reduced motion immediately presents static completed reports.
- Reviewed live screenshots for hero and report states; no clipping or alignment issues.
