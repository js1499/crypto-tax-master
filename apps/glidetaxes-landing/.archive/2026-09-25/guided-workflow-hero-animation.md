---
tags: [alternative, hero, motion, accessibility, playwright, vercel]
category: design
related: [immersive-product-hero, alternative-vercel-production-deployment]
---

# Guided Workflow Hero Animation - 2026-09-25

## Summary
Replaced the `/alternative` hero collage with a production React animation that demonstrates connecting accounts, reviewing activity, and generating tax reports.

## Context
- **Route**: `/alternative`
- **Framework**: Next.js 16.3.6, React 19.2.4, Motion 13.4.4
- **Production alias**: https://glidetaxes-landing.vercel.app/alternative

## Issues Encountered & Solutions

### Light mockup readability and clipping
- The original 1.2 desktop scale pushed the workflow past the viewport and over the headline.
- **Fix**: Used the full 61% grid column, reduced the desktop scale to 1.08, and narrowed negative margins so the complete product window remains visible.

### Animated microcopy contrast
- Axe detected low contrast while tiny labels were fading over light surfaces.
- **Fix**: Darkened secondary text tokens and paused the staged demo before the stable-state Axe scan.

### Reduced-motion rendering
- A static report state still inherited individual Motion entrances.
- **Fix**: Added a static mode that mounts report elements at their final values and removes the playback control.

### Source cursor speed and alignment
- Percentage coordinates relative to the full scene made the pointer move too quickly and miss its intended source cards.
- **Fix**: Anchored the cursor to the three-column source grid, targeted each cell center, synchronized the selected state to its click timestamp, and allowed 1.2 seconds per Coinbase, Hyperliquid, Ethereum, and Solana choice.

### Initial playback and Review cursor visibility
- Playback began as soon as hydration completed, and removing the earlier busy Review motion also removed the pointer that explained the attention-state interaction.
- **Fix**: Gated the state machine until one second after the browser `load` event, then restored a table-relative Review cursor with a long full-opacity dwell directly over the `Needs review` status.

### First Connect cycle skipped its animation
- The first Connect screen rendered with all checks and the completion banner visible, while the cursor was mounted at zero opacity; only later loops animated correctly.
- **Cause**: `AnimatePresence initial={false}` suppressed the initial state of nested Motion elements, including elements mounted when playback changed from waiting to active.
- **Fix**: Restored initial animations on the scene transition boundary, explicitly defined the idle state for cards and the completion banner, and changed Playwright coverage to validate cursor movement on the first cycle instead of waiting for a loop.

## Key Changes
- Added `AnimatedHeroWorkflow.tsx` as the isolated Client Component while retaining a server-rendered figure wrapper.
- Added a typed 15.6-second `connect → review → report` timeline, pause/resume control, IntersectionObserver pausing, and document visibility handling.
- Reduced concurrent movement, slowed selection/status reveals, and added an explicit 1-second completed-state hold after every stage.
- Added a one-second initial playback delay and a focused Review-scene cursor pass that remains centered over the attention status long enough to be understood.
- Added responsive desktop/tablet/mobile product scenes using local platform marks and illustrative data only.
- Removed the obsolete orbit, scan-line, dark-dashboard, and infinite animation CSS.
- Extended Playwright coverage for stage progression, outputs, reduced motion, pause behavior, viewport pausing, accessibility, and overflow.

## Verification
- `npm run check`: passed.
- Playwright: 30 passed, 4 expected device-specific skips, including initial-delay and cursor-geometry coverage.
- `npm audit --omit=dev`: 0 vulnerabilities.
- Production Lighthouse: Performance 99, Accessibility 100, Best Practices 100, LCP 2.1s, CLS 0. SEO is 66 only because `/alternative` intentionally remains `noindex`.
- Latest production deployment: `3mxgSjSkp631aJ3RtdBi4MheJKRd`.
- Live browser smoke tests confirmed zero initial checks, a hidden completion banner, the visible first-cycle cursor and Coinbase selection, all four final checks, and the Review cursor at full opacity over the attention status.

## Lessons Learned
For UI-story animations, a small typed React state machine with Motion produces crisper responsive product scenes and more testable accessibility behavior than a remote Lottie asset.
