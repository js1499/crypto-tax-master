---
tags: [alternative, hero, motion, portfolio, accessibility, responsive]
category: design
related: [guided-workflow-hero-animation, alternative-responsive-optimization]
---

# Account Calculation Hero Redesign - 2026-09-27

## Summary
Reframed the `/alternative` hero around a calm three-step account-sync, per-account P/L, and combined-portfolio calculation story.

## Context
- **Branch**: no Git metadata is present in the workspace
- **Framework**: Next.js 16.3.6, React 19, Motion for React
- **Reference**: Awaken.tax's stable account-row storytelling pattern, without copying its design or assets

## Issues Encountered & Solutions

### 1. Animated text lost contrast mid-transition
- Axe evaluated text while its parent rows and overlapping status labels were partially transparent.
- **Fix**: kept all text fully opaque, used transform/progress motion, and swapped high-contrast sync/calculation states discretely.

### 2. Final total was clipped in the fixed-height product window
- Five desktop/mobile rows plus the summary exceeded the existing hero figure height.
- **Fix**: compacted row, heading, and workspace spacing while preserving all five accounts and the unchanged hero height.

### 3. Local Playwright reused a server with the wrong development host
- A manually started `localhost` server was reused by tests configured for `127.0.0.1`, preventing client hydration.
- **Fix**: stopped the manual server and let Playwright start Next with the configured hostname.

## Key Changes
- Exact hero headline: `Crypto taxes, made simple. Accurate taxes or your money back.`
- Removed the hero assurance badge and all three assurance bullets.
- Lightened the blue hero gradients and increased grid visibility.
- Replaced the cursor-led workflow with `sync -> calculate -> total` stages.
- Illustrative account P/L values sum to `+$12,324.68` across Coinbase, Hyperliquid, Kraken, Solana, and Ethereum.
- Stage progress pauses when manually paused, offscreen, or in a hidden tab; reduced motion renders the final state.
- Updated route metadata, figure description, and Playwright assertions.

## Validation
- `npm run check` passed.
- `npm run test:e2e` passed: 32 passed, 4 intentionally skipped.
- Desktop and mobile Axe checks passed.
- `npm run audit:prod` reported 0 vulnerabilities.
- Visual QA covered 1440x900 and 390x844, including the final calculation state.

## Lessons Learned
For illustrative product animations, persistent spatial structure plus discrete state changes communicates progression more clearly than cursor choreography or full-scene transitions. Avoid opacity animation on functional-looking text because contrast must remain valid at every frame.
