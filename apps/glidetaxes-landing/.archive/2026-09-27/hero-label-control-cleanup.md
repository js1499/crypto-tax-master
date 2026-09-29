---
tags: [hero, copy, controls, animation, cleanup]
category: design
related: [light-hero-palette, faster-workflow-feeling-led-copy]
---

# Hero label and control cleanup - 2026-09-27

## Summary
Removed the requested visible support labels and playback controls from `/alternative`. Not deployed.

## Removed
- “Illustrative workflow · Sample data” and Pause/Replay controls beneath the animation.
- “Start free. Pay only when you are ready to export.” beneath the hero CTAs.
- Methodology eyebrows “Accuracy you can trust”, “Easy to review”, and “Confidence to file”, including their adjacent icons.

## Playback
With playback controls removed, the animation now plays once in nine seconds and holds the finished reports instead of looping. The hook uses one native iteration, tracks completion, and keeps final opacity states visible. Removed unused manual state and control CSS. One-second startup delay, viewport/tab suspension, reduced-motion static reports, and the screen-reader description remain.

## Validation
- `npm.cmd run check` passes lint, TypeScript, and production build. Complete Playwright suite: 37 passed, 5 intentional skips, including automated desktop/mobile accessibility scans.
- Manual full playback: every track stops at 9,000ms; `data-completed=true`, `data-playing=false`; reports and download remain fully visible.
- Screenshot QA at 1440, 1024, 390, and 320px: requested labels absent, no overflow or browser page errors. Desktop hero remains 760px. Screenshots: `docs/design-references/hero-clean-*.png`.
- Regression tests updated to assert removed items, no playback buttons, one-shot timing, final-state persistence, automatic viewport suspension, and accessible description.

## Release Boundary
The light palette and this cleanup are local. Production remains the faster hero deployment `dpl_9V5EK73nLTbThJmVpy2iyLPYRrT2` until deployment is requested.
