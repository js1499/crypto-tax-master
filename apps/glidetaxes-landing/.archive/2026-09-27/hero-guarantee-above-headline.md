---
tags: [hero, guarantee, copy, vercel, release]
category: release
related: [plain-hero-and-site-polish, plain-hero-polish-production-deployment]
---

# Hero guarantee above headline - 2026-09-27

## Changes
- Moved the mint hero guarantee above `Crypto taxes, made simple.` with a consistent 24px/28px gap.
- Removed the hero guarantee's smaller `Money-back guarantee on all paid plans.` line. Kept `Accurate taxes or your money back.` and centered the shield vertically.
- Pricing guarantee and its eligibility/paid-plan text remain unchanged.
- Exact supporting copy: `Spend up to 95% less time on crypto taxes, accurately. Connect your accounts, review your summary, and download your reports.`
- Single hero CTA, animation, desktop hero height, and all other sections unchanged.

## Verification
- `npm.cmd run check`: lint, TypeScript, production build passed.
- Targeted Playwright: 7 passed, 1 intentional viewport-matrix skip. Includes desktop/mobile Axe, exact copy, guarantee text and order, pricing qualifiers, and five-width responsive checks.
- Screenshot QA at 1440px and 390px; geometry checked at 1440/1024/390/320. No horizontal overflow. Guarantee is above H1 at all tested widths.

## Deployment
- Command: `npx.cmd vercel deploy --prod --yes`
- Deployment ID: `dpl_5Kc7pKzCZT7D2611qeeBoHxPRnaJ`
- Deployment URL: `https://glidetaxes-landing-aewmbnlyk-jatinsawlani-gmailcoms-projects.vercel.app`
- Stable URL: `https://glidetaxes-landing.vercel.app/alternative`
- Confirmed production Ready and stable alias assigned. Live 1440px/390px checks returned HTTP 200, exact revised text, guarantee above headline, no horizontal overflow, and no browser errors.
