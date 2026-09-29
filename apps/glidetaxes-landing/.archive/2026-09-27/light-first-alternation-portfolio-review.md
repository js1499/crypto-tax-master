---
tags: [palette, sections, portfolio-review, graphic, responsive, accessibility]
category: design
related: [hero-guarantee-above-headline, plain-hero-and-site-polish, alternating-section-palette]
---

# Light-first section alternation and portfolio review - 2026-09-27

## Changes
- `/alternative` outer backgrounds now alternate exactly: hero light, methodology dark, how light, integrations dark, trial light, pricing dark, comparison light, FAQ dark, final CTA light, footer dark.
- Light is `#f4f7fb`; dark is `#071b39`. Direct text, FAQ controls, comparison table, footer logo/links, borders and focus indicators were adjusted for their surfaces. Product mockup cards remain white; trial/final CTA retain blue-green gradient cards.
- Kept hero copy, guarantee placement, animation, routes, pricing entitlements and analytics unchanged.
- Replaced the old ambiguous shrinking red/yellow bars in `AuditRiskVisual` with server-rendered `PortfolioReviewGraphic.tsx` and a scoped CSS Module.
- New illustrative review includes local Coinbase, Hyperliquid and Solana marks, aligned gains of $5,420.00 / $4,680.60 / $2,740.00, and matching $12,840.60 net total. Blue/mint contribution segments correspond proportionally to those figures. Visible Sample data and Ready labels; no new product claims or dependencies.
- Retained the existing gradient frame and card layout, exactly 500px high on desktop. Mobile frame grows intrinsically to fit all content, approximately 444px.

## Validation
- Full Playwright suite: 41 passed, 5 intentional skips, including desktop/mobile Axe, all ten surface colors, graphic totals and five-width containment.
- After final desktop spacing trim: targeted graphic/responsive suite 3 passed, 1 intentional skip.
- `npm.cmd run check`: lint, TypeScript and production build passed.
- `npm.cmd audit --omit=dev`: zero vulnerabilities.
- Screenshot QA for graphic at 1440, 1024, 390 and 320; all rows/values contained, no horizontal overflow. Additional screenshots reviewed for how, integrations, comparison, pricing, FAQ and footer.
- No global CSS or production dependency changes in this release.

## Deployment
- Command: `npx.cmd vercel deploy --prod --yes`
- ID: `dpl_AN93HqNeMWAVKWYk2dEUGeMznVmu`
- Deployment URL: `https://glidetaxes-landing-34c7fjate-jatinsawlani-gmailcoms-projects.vercel.app`
- Stable URL: `https://glidetaxes-landing.vercel.app/alternative`
- Vercel reports production Ready with existing stable aliases assigned. Live desktop1440 verifies exact alternating colors for all nine sections plus footer, graphic height500px with three rows and correct total, no horizontal overflow/browser errors, and preserved pricing guarantee. `/alternative` and `/pricing` return HTTP200.
- Live mobile320/390 checks passed: all ten surfaces alternate correctly, no overflow, graphic labels/amounts stay contained and sum to the displayed total, and the latest hero copy/guarantee/singleCTA and pricing guarantee remain intact. Mobile screenshots reviewed.
