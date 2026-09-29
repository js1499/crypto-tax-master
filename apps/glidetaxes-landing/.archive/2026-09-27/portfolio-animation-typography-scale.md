---
tags: [alternative, hero, typography, motion, responsive]
category: design
related: [account-calculation-hero-redesign, account-calculation-hero-production-deployment]
---

# Portfolio Animation Typography Scale - 2026-09-27

## Summary
Increased all text inside the `/alternative` portfolio animation by approximately 40% while preserving the fixed hero and product-window geometry.

## Context
- **Component**: `src/components/alternative/AnimatedHeroWorkflow.tsx`
- **Breakpoints checked**: 1440x900, 390x844, and 320x700

## Issues Encountered & Solutions

### 1. Enlarged mobile step labels wrapped inconsistently
- Sync and Portfolio wrapped while Calculate remained on one line.
- **Fix**: gave all three labels a consistent 60px, two-line mobile measure and restored single-line labels from the `sm` breakpoint.

### 2. The 320px total state approached the bottom crop
- The larger title wrapped because the secondary `Illustrative` badge consumed horizontal space.
- **Fix**: hid only the redundant in-window badge below 360px; the persistent figure label remains visible. This kept the title on one line and the final card fully visible.

## Key Changes
- Increased step, header, account, status, P/L, summary, and total typography by about 40%.
- Added explicit compact line heights so account rows retained their original geometry.
- Kept all five accounts, all three stages, and the hero height unchanged.
- Preserved zero horizontal overflow at 320px, 390px, and 1440px.

## Validation
- `npm run check` passed.
- `npm run test:e2e` passed: 32 passed, 4 intentionally skipped.
- Axe checks passed at desktop and mobile sizes.
- Visual checks covered sync, calculate, and total stages.
