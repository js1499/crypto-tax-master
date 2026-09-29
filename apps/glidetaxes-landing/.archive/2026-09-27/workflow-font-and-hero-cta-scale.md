---
tags: [alternative, hero, typography, cta, responsive]
category: design
related: [portfolio-animation-typography-scale, portfolio-typography-production-deployment]
---

# Workflow Font and Hero CTA Scale - 2026-09-27

## Summary
Explicitly aligned the animated product window with the site font stack and enlarged both hero CTA labels without changing their button geometry.

## Context
- **Workflow selector**: `.alternative-workflow-window`
- **Site font stack**: `-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif`

## Key Changes
- Added the workflow window to the same CSS font-family rule used by `.legacy-restored` and `.legacy-navigation`.
- Increased hero CTA labels to 14px at 320px, 15px from 360px, and 18px from the `sm` breakpoint.
- Increased the secondary CTA weight to match the primary CTA's stronger visual fill.
- Added a computed-style regression assertion for workflow/site font-family equality and minimum CTA sizing.

## Validation
- `npm run check` passed.
- `npm run test:e2e` passed: 32 passed, 4 intentionally skipped.
- Visual checks at 390x844 and 320x700 confirmed both CTA labels fit without wrapping or clipping.
- Axe and horizontal-overflow coverage remained green.
