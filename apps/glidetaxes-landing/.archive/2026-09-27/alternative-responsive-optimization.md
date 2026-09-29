---
tags: [alternative, responsive, mobile, desktop, accessibility, methodology]
category: design
related: [alternating-section-palette, guided-workflow-hero-animation]
---

# Alternative Responsive Optimization - 2026-09-27

## Summary
Optimized the full `/alternative` page across desktop, tablet, and mobile and reduced the “Exact second” card to a shallow, controlled overlap.

## Context
- **Route**: `/alternative`
- **Version**: Next.js 16.3.6
- **Viewports**: 320, 390, 768, 1024, and 1440px
- **Deployment**: not deployed in this task

## Issues Encountered & Solutions

### 1. Exact-second detail obscured too much of the hourly chart
- The detail card was absolutely positioned over a large portion of the SOL/USDC visualization.
- **Fix**: Returned the card to document flow with a small negative margin, limiting overlap to 24px on phones and 32px on larger screens.

### 2. Platform marks did not fit the narrowest supported viewport
- Six 44px marks plus gaps exceeded the usable width at 320px.
- **Fix**: Use 40px marks below 360px and 44px marks above it while retaining a single six-column row.

### 3. Mobile comparison table hid plan data behind its feature column
- The 280px sticky feature column consumed nearly the full mobile content width.
- **Fix**: Reduced the mobile feature column to 190px and plan columns to 110px, retaining the larger desktop dimensions from 768px onward.

## Key Changes
- Reduced mobile heading sizes and internal card padding while preserving desktop scale.
- Tightened mobile methodology, workflow, integrations, trial, FAQ, final CTA, and footer layouts.
- Removed unnecessary mobile integrations height and reduced pricing-card minimum heights on phones.
- Added stable test hooks for the hourly chart and exact-second card.
- Added a five-width Playwright test for document overflow, overlap limits, and platform-grid containment.

## Validation
```text
npm.cmd run check        passed
npm.cmd run test:e2e     31 passed, 5 expected skips
axe desktop/mobile       no violations
horizontal overflow      none at 320/390/768/1024/1440
chart-card overlap       24px mobile, 32px tablet/desktop
```

