---
tags: [hero, light-theme, palette, contrast, alternative]
category: design
related: [faster-hero-production-deployment, faster-workflow-feeling-led-copy]
---

# Light hero palette - 2026-09-27

## Summary
Changed only the `/alternative` hero's surrounding surface to light blue-white with dark text. Not deployed.

## Changes
- `globals.css`: hero base `#f6f9fe`, pale blue/mint gradients, and a subtle dark-blue grid. The blue/green animation frame variable is unchanged.
- `AlternativeHero.tsx`: headline navy `#0b2447`, guarantee line `#174ea6`, supporting copy `#435873`, note `#536176`. Secondary CTA is white with navy text. Focus outlines use dark blue and primary hover is darker blue.
- `FilingWorkflowAnimation.module.css`: external playback controls use `#29415f`, with darker hover/focus treatments and a slate illustration label.
- Preserved all copy, the header, below-hero sections, nine-second animation, blue frame, sizing, and layout. Desktop hero remains 760px.

## Validation Notes
- `npm.cmd run check`: lint, TypeScript, and production build pass.
- Playwright: all 35 existing tests passed with 5 intentional skips; both new palette tests passed on rerun after correcting test assumptions. Automated desktop/mobile accessibility checks passed.
- Visual QA at 1440, 1024, 390, and 320px showed the correct light surface and no horizontal overflow. Screenshots: `docs/design-references/hero-light-*.png`.
- Added palette regression assertions to `tests/site.spec.ts`.
- Dev server again needed a restart to refresh `globals.css`, while component/module changes appeared immediately. Confirm computed background rather than assuming Fast Refresh applied every style.
- Tailwind's `bg-white/80` can serialize as an OKLab color. Color tests should normalize this rather than assume the browser returns an RGB string.

## Release Boundary
Production still uses the preceding darker hero release, `dpl_9V5EK73nLTbThJmVpy2iyLPYRrT2`. Await a deployment request for the light palette.
