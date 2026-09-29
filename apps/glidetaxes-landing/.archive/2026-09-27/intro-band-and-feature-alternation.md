---
tags: [sections, methodology, palette, layout, responsive, release]
category: design
related: [light-first-alternation-portfolio-review]
---

# Intro band and individual feature alternation - 2026-09-27

## Requested Refinement
The screenshot identifies only the methodology heading, supporting copy and three tabs as the dark introduction. Each feature below it must be a separate alternating section, not three white cards inside one large dark section.

## Changes
- `LegacyMethodology` now returns four sibling sections: dark `#product-alt` intro, light `#methodology-pricing`, dark `#methodology-audit`, light `#methodology-accuracy`.
- Intro contains no figures or feature cards. Tabs remain in the intro rather than sticking over later sections; existing anchor destinations still work. Feature sections retain their IDs and have labelled headings with 80px scroll margins.
- Each feature receives full-width background and 64px/80px vertical padding. Card proportions and product graphics are unchanged. Review card is navy with white heading/slate-light copy; its illustrative product window stays white.
- Full cadence: hero light, intro dark, valuation light, review dark, accuracy light, how dark, integrations light, trial dark, pricing light, comparison dark, FAQ light, final CTA dark, footer light.
- Rethemed downstream direct text, footer links/logo, FAQ controls and comparison table for their surfaces. Preserved all copy, guarantees, pricing entitlements, routes, events, hero animation and new review graphic.

## Validation
- Full Playwright suite: 41 passed, 5 intentional skips. Covers 13 exact background colors and DOM order, intro-only contents, independent full-width feature sections, 320/390/768/1024/1440 responsive behavior, graphic sums/containment, navigation and desktop/mobile Axe.
- Manual screenshots reviewed for desktop intro-to-first-feature transition, dark review section, and 320px intro. Anchor clicks verified at 1440/390/320 with no clipped headings or horizontal overflow.
- `npm.cmd audit --omit=dev`: zero vulnerabilities.
