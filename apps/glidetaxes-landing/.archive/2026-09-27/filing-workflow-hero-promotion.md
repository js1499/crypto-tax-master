---
tags: [alternative, hero, animation, blue-green, responsive, web-animations]
category: design
related: [awaken-workflow-preview, awaken-workflow-preview-production-deployment]
---

# Filing workflow hero promotion - 2026-09-27

## Summary
Promoted the bottom-page three-step workflow to the `/alternative` hero and replaced its warm gradient with the site's existing blue/green product-card gradient. Not deployed in this turn.

## Key Changes
- `AlternativeHero.tsx` renders `FilingWorkflowAnimation`; `AlternativeLanding.tsx` no longer renders the bottom preview.
- `globals.css` defines `--glide-blue-green-gradient`, shared with the existing `.legacy-method-visual-three` card. Internal accents use navy, blue, and mint.
- Desktop stage uses 14:9 proportions and a compact report layout, preserving the 760px hero. Mobile retains six readable rows and the near-square frame.
- Removed obsolete hero visual transforms. CTA buttons wrap at constrained desktop widths to avoid overlap with the frame, keeping text size unchanged.
- `useWorkflowPlayback.ts` waits one second after page load before playing from time zero. Shared timeline, manual/visibility pauses, replay, and reduced motion are preserved.
- Updated tests target hero placement, all three scenes, delay, controls, shared background, and responsive behavior.

## Validation
- `npm.cmd run check`: lint, typecheck, and production build pass.
- Full Playwright suite: 35 passed, 5 intentional project skips. Targeted responsive test passed again after adding desktop CTA separation checks.
- Axe passes on desktop and mobile, including focused playback controls.
- No page overflow at 320, 390, 768, 1024, or 1440px. Desktop hero remains 760px at 1024 and 1440px. Download illustration remains within the stage.
- Screenshot QA: `docs/design-references/hero-filing-*.png`, including every scene on desktop and reduced-motion reports at all target widths.

## Issues Encountered and Solutions
- The dev server served stale global CSS after the new shared variable was added. Module CSS updated, but the gradient was transparent and removed transforms persisted. Restarting `npm.cmd run dev -- --hostname 127.0.0.1` refreshed global CSS. Verify computed `backgroundImage` when source and screenshots disagree.
- At 1024px, the combined CTA widths exceeded the copy column. Added `lg:flex-wrap xl:flex-nowrap` and verified CTA right edges stay left of the workflow frame.

## Release Boundary
Current production is still the prior bottom-preview deployment `dpl_B4BvpuxaujjGEmn4jbtvAUETdL4F`. Await a deployment request before publishing this hero promotion.
