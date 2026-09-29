---
tags: [alternative-design, competitor-benchmark, crypto-tax, accessibility, playwright]
category: design
related: [glide-conversion-redesign, vercel-preview-deployment]
---

# Competitor-Benchmarked Alternative Design - 2026-09-24

## Summary

Built a complete, production-ready alternative landing page at `/alternative` using familiar crypto-tax SaaS conventions while preserving Glide's verified product claims and existing conversion routes.

## Context

- **Branch**: Workspace is not a Git repository
- **Version**: Next.js 16.3.6
- **Related Issue**: Compare a new product-first direction against the current homepage without replacing it

## Issues Encountered & Solutions

### 1. Category familiarity without copying competitors

- Competitor research showed a recurring pattern: a short outcome-led hero, product proof above the fold, a three-step explanation, supported-source visibility, and transaction-based plan cards.
- **Fix**: Recombined those category conventions into a distinct navy/blue Glide design with an original dashboard mockup, bento feature proof, dark integration band, and Glide's centralized tier data. No competitor assets, testimonials, customer counts, guarantees, or unsupported product claims were used.

### 2. Preserve the validated homepage while exploring a new direction

- Replacing `/` immediately would remove the ability to compare the existing redesign against the alternative.
- **Fix**: Added `/alternative` as a static `noindex, nofollow` evaluation route. The existing homepage and `/pricing` remain unchanged.

### 3. Small UI labels initially missed WCAG contrast

- The first Axe pass found muted dashboard, pricing, CTA, and footer labels below the 4.5:1 threshold.
- **Fix**: Darkened the secondary slate palette, increased white opacity on dark surfaces, and added a landmark to the announcement bar. Desktop and mobile Axe scans now report zero violations.

## Key Changes

- Added `src/app/alternative/page.tsx` with route-specific preview metadata.
- Added `src/components/alternative/AlternativeHeader.tsx` with a responsive menu, keyboard focus management, and Escape handling.
- Added `src/components/alternative/AlternativeLanding.tsx` with a product-led hero, dashboard mockup, bento feature proof, three-step workflow, supported sources, shared pricing tiers, FAQ, final CTA, and footer.
- Reused `pricingTiers`, `faqs`, `PlatformMarks`, `TrackedLink`, and the existing Glide logo instead of duplicating business data or analytics behavior.
- Expanded `tests/site.spec.ts` to cover the alternative conversion path, `noindex` metadata, semantic controls, mobile navigation, route health, and Axe accessibility.

## Verification

- `npm run check`: passed lint, strict TypeScript, and production build.
- `npm run test:e2e`: 21 passed across desktop and mobile; 3 expected device-specific skips.
- `npm audit --omit=dev`: 0 vulnerabilities.
- Visual QA completed at 1440x900 and 390x844.

## Lessons Learned

- A competitor-comparable experience comes more from information order and visible product proof than from matching another brand's surface styling.
- Keeping experimental redesigns on an explicit `noindex` route makes side-by-side review safe without creating duplicate indexable marketing pages.
- Small text in dense dashboard mockups needs a deliberately darker secondary palette than ordinary body copy.
