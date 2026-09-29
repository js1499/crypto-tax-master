---
tags: [hero, animation, typography, copywriting, feelings, responsive]
category: design
related: [filing-workflow-hero-promotion, outcome-led-copy-rewrite]
---

# Faster workflow and feeling-led copy - 2026-09-27

## Summary
Accelerated the new hero workflow, moved enlarged step information inside its blue frame, enlarged important table labels, and reframed `/alternative` copy around confidence, relief, and time saved. Not deployed.

## Changes
- `FilingWorkflowAnimation.tsx`: shared duration is 9,000ms, down from 24,000ms. Existing storyboard offsets remain normalized to 24 units. Stages are 0-3s accounts, 3-6s transactions, 6-9s reports. Reduced-motion completion is 8,250ms. Startup delay remains one second.
- Step headings are inside the gradient stage and above `filing-workflow-paper`, with 32px desktop action text and 20px minimum mobile text. High-contrast navy heading surface sits within the shared blue/green gradient.
- CSS frame proportions: desktop 14:10, mobile 4:5. Table columns 44%/27%/29%. Connected and pill text reaches 18px; amounts reach 21px. Mobile minima are 12px and 13px, respectively. Six rows remain aligned.
- Main feature headings: “Feel sure about your numbers.”, “Get your time back.”, “File with peace of mind.” Mechanisms remain in supporting text. Additional copy uses confidence, relief, control, and low-pressure trial messaging. Hero headline remains unchanged; supporting paragraph is positive and benefit-led.
- Factual entitlements, FAQ answers, disclaimers, routes, and analytics events remain unchanged. No em dashes.

## Validation
- `npm.cmd run check`: lint, TypeScript, and production build pass.
- Playwright full suite: 35 passed, 5 intentional project skips. Final targeted copy and responsive tests: 3 passed, 1 intentional skip.
- Coverage includes live playback through all stages within 9 seconds, replay/manual/viewport pause, one-second startup, reduced motion, Axe desktop/mobile, exact shared gradient, title containment, enlarged type, and five viewport widths.
- Visual QA of all three scenes at 1440, 1024, 390, and 320px: no clipped table text or horizontal page overflow. Desktop hero remains 760px. Screenshots: `docs/design-references/hero-fast-*.png`.

## Responsive Finding
The existing 320px CTA row was visually clipped even though the page did not report horizontal overflow, because the hero clips overflow. Changed buttons to stack below 360px without shrinking their text. Added explicit CTA bounds assertions: both now span x=16 to x=304 at 320px. Check element bounds, not only document scroll width.

## Release Boundary
This and the preceding hero promotion remain local. Production still has the earlier separate bottom-preview deployment until the user requests deployment.
