---
tags: [alternative, section-rhythm, light-theme, dark-theme, accessibility]
category: design
related: [midnight-site-theme, legacy-site-restoration]
---

# Alternating Section Palette - 2026-09-27

## Summary
Reworked `/alternative` from an entirely dark page into an alternating dark/light section rhythm while retaining its structure, product visuals, and hero animation.

## Context
- **Route**: `/alternative`
- **Version**: Next.js 16.3.6
- **Deployment**: not deployed in this task

## Issues Encountered & Solutions

### 1. The midnight palette made the full page visually dense
- Consecutive navy sections reduced separation and made the page feel longer.
- **Fix**: Alternated section surfaces and fully rethemed their headings, copy, cards, borders, controls, and focus states rather than changing only the outer background.

### 2. Light-section small print narrowly missed WCAG AA
- `#64748b` on `#f4f7fb` measured 4.42:1 at 12px.
- **Fix**: Darkened the affected methodology and pricing disclaimer text to `#59697f`.

### 3. A manual QA server caused false hydration failures
- A server started on `localhost` blocked Next.js development resources requested from Playwright's `127.0.0.1` base URL.
- **Fix**: Stopped the manual server and allowed Playwright to launch the app with its configured hostname.

## Palette Sequence
```text
Hero             dark
Methodology      light
Workflow         dark
Integrations     light
Trial            dark
Pricing cards    light
Comparison       dark
FAQ              light
Final CTA        dark
Footer           light
```

## Validation
```text
npm.cmd run check        passed
npm.cmd run test:e2e     30 passed, 4 expected skips
desktop visual QA        1440 × 900
mobile visual QA         390 × 844
```

