---
title: Glide conversion and product-first redesign
date: 2026-09-24
category: feature
tags: [nextjs, landing-page, conversion, accessibility, pricing, vercel-analytics, lighthouse]
---

# Glide conversion and product-first redesign

## Outcome

Rebuilt the marketing site as a production-ready conversion funnel for US crypto traders. The repository now owns `/` and `/pricing`, while application, blog, contact, CPA filing, and legal links remain same-domain destinations.

## Architecture

- Central navigation and public route configuration lives in `src/lib/site.ts`.
- All tier prices, limits, summaries, and the complete feature matrix live in `src/data/pricing.ts`.
- Privacy-safe tracked links use the fixed event union in `src/components/TrackedLink.tsx`.
- The homepage follows hero, methodology, workflow, integrations, compact pricing, FAQ, final CTA, and footer.
- `/pricing` reuses the homepage cards and renders the complete comparison as a semantic table with sticky headers and a sticky feature column.

## Accessibility and behavior

- Header uses CSS sticky positioning rather than a scroll listener.
- Mobile navigation supports keyboard activation, Escape, focus entry, focus return, and outside-click dismissal.
- FAQs use native `details` and `summary` controls.
- All interactive targets are at least 44px, focus states are visible, and links no longer wrap buttons.
- Axe passes on desktop and mobile for both owned routes.

## Search and measurement

- Added metadata base, canonical URLs, title template, Open Graph/Twitter metadata, generated OG artwork, robots rules, sitemap entries, and matching Organization, SoftwareApplication, and FAQPage JSON-LD.
- Vercel Analytics and Speed Insights render on Vercel deployments. CTA event properties contain only location, optional plan, or destination values.

## Performance decisions

- Removed the unused 6.5 MB gauge video and unused logo/font assets.
- Replaced the fake video player and looping animation system with static, accessible workflow visuals.
- Used system fonts for the critical path; this reduced the mobile Lighthouse LCP from 3.2s at baseline to 2.2s.
- Analytics scripts are enabled only when `VERCEL=1`, avoiding local 404 console errors while preserving deployment measurement.

## Verification

- `npm run check`: pass with zero lint errors or warnings; production build succeeds.
- `npm run test:e2e -- --workers=2`: 16 passed, 2 intentionally skipped for non-applicable desktop/mobile project cases.
- `npm audit --omit=dev`: zero vulnerabilities.
- Production Lighthouse: Performance 99, Accessibility 100, Best Practices 100, SEO 100, LCP 2.2s, CLS 0.

## Maintenance notes

- Keep overview plan language softer than the detailed matrix when product copy conflicts.
- Keep supported chains limited to Ethereum, Solana, and Base unless the approved product source changes.
- Run Playwright and Lighthouse after changes to the header, fonts, hero, pricing table, or analytics layout.
