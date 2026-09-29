---
tags: [alternative, restoration, legacy-design, playwright, vercel]
category: release
related: [guided-workflow-hero-animation, competitor-benchmarked-alternative-design, alternative-vercel-production-deployment]
---

# Legacy Site Restoration with Guided Hero - 2026-09-25

## Summary

Restored the pre-redesign information architecture and green/cream visual language beneath `/alternative` while preserving the new guided Connect, Review, and Reports hero animation.

## Source and scope

- Vercel had no retained deployment from exactly one week earlier. The newest retained pre-redesign build was the September 2, 2026 deployment `dpl_EUQRYavM44pziu9mBa3WrGJVrYUM`.
- The restoration applies to `/alternative`; `/` and `/pricing` remain the production-ready routes introduced by the conversion redesign.
- Restored visual patterns and section order without reintroducing outdated or unsupported claims, stub links, fake signup behavior, or inaccessible controls.

## Key changes

- Kept the current midnight hero, conversion copy, CTAs, analytics, and guided product animation unchanged.
- Restored the cream/green header and footer treatment, local legacy typography, block-timestamp methodology panels, guided workflow section, platform field, trial callout, pricing cards, full feature matrix, FAQ, and final CTA.
- Retained inclusive platform language and current real destinations.
- Added semantic product illustrations instead of embedding the historical fake video treatment.
- Added CSS containment to wide pricing tables so their scroll regions do not create document-level mobile overflow.
- Preserved mobile menu focus management and Escape behavior, with an explicit hydration-ready test signal to avoid testing the server-rendered button before React attaches handlers.
- Captured source and restored reference screenshots under `docs/design-references/legacy-restoration/` and recorded the inferred legacy specs under `docs/research/`.

## Verification

- `npm run check`: passed lint, strict TypeScript, and production build.
- Playwright: 30 passed, 4 expected device-specific skips.
- Axe: zero automated violations on desktop and mobile.
- `npm audit --omit=dev`: zero vulnerabilities.
- Live smoke test: `/alternative` returned 200, retained the guided workflow hero, rendered the restored methodology and pricing sections, and had no horizontal overflow at 390px.

## Deployment

- Project: `jatinsawlani-gmailcoms-projects/glidetaxes-landing`
- Deployment ID: `dpl_9MH3vYhRyiYq3FiXrcxPxN6em17Q`
- Production URL: `https://glidetaxes-landing-2u592pxrq-jatinsawlani-gmailcoms-projects.vercel.app`
- Stable alias: `https://glidetaxes-landing.vercel.app/alternative`

## Recovery note

Use deployment `dpl_EUQRYavM44pziu9mBa3WrGJVrYUM` as the visual reference for the legacy body and `dpl_3mxgSjSkp631aJ3RtdBi4MheJKRd` as the reference for the guided hero immediately before this combined release.
