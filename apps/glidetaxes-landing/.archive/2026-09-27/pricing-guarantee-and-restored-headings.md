---
tags: [pricing, money-back-guarantee, copy, comparison, responsive]
category: design
related: [faster-workflow-feeling-led-copy, hero-label-control-cleanup]
---

# Pricing guarantee and restored headings - 2026-09-27

## Summary
Restored two earlier `/alternative` headings, simplified its pricing heading, and made the paid-plan guarantee prominent. Not deployed.

## Copy
- Integrations: “One clear result for your whole portfolio.”
- Trial: “See your result free. Pay when you are ready to file.”
- Alternative pricing section: “Pricing”, without the extra pricing eyebrow.

## Guarantee Presentation
- Added a high-contrast mint callout above plan cards with a shield icon and bold “Money-back guarantee” heading. It repeats the approved accuracy guarantee and specifies every paid plan, with the existing purchase-time eligibility qualification. No deadline or new guarantee terms are invented.
- Added the guarantee directly after Price in `src/data/pricing.ts`. Trial: “Not applicable”; Starter, Active, Pro, Prime: included.
- Added optional `FeatureRow.highlighted` and distinct highlight styling in both the alternative comparison and `/pricing` FeatureGrid, preserving one shared entitlement source.

## Responsive Fixes
- The restored longer trial heading overflowed the old fixed 450px desktop card, clipping its CTA. Replaced `lg:h-[450px]` with `lg:min-h-[450px]` so content determines height.
- Comparison table headers had top offsets of 70/72px inside horizontal scroll containers, painting over Price. Changed both to `top-0` so the first rows remain visible.
- Visual QA at 320, 390, 1024, 1440px: no page overflow or trial copy clipping. Screenshots: `docs/design-references/pricing-guarantee-*.png` and `*-guarantee-grid-final.png`.

## Release Boundary
This change, the light hero, and preceding label cleanup are local. Production remains `dpl_9V5EK73nLTbThJmVpy2iyLPYRrT2` until deployment is requested.

## Validation
- `npm.cmd run check` passes lint, TypeScript, and production build.
- Full Playwright suite: 37 passed, 5 intentional skips. Four targeted desktop/mobile comparison tests passed after adding header-overlap assertions.
- Verified guarantee row order, Trial exclusion, four paid-plan inclusions, distinct highlight styles, banner copy, restored headings, trial content containment at five widths, horizontal table scrolling, and automated accessibility scans.
