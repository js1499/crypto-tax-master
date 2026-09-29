---
tags: [content-design, inclusive-language, platform-coverage, seo, vercel]
category: design
related: [competitor-benchmarked-alternative-design, alternative-vercel-production-deployment]
---

# Inclusive Platform Language - 2026-09-24

## Summary

Broadened Glide's public language from a US-trader and three-chain focus to inclusive portfolio, blockchain, exchange, and wallet coverage across the full marketing experience.

## Context

- **Branch**: Workspace is not a Git repository
- **Version**: Next.js 16.3.6
- **Production route**: `https://glidetaxes-landing.vercel.app/alternative`

## Issues Encountered & Solutions

### 1. Narrow product and audience language appeared in shared content

- The alternative hero referenced Ethereum, Solana, and Base, while headers, metadata, pricing audiences, FAQ content, social artwork, and footers used phrases such as "US traders" or trader-specific segments.
- **Fix**: Audited both homepage designs and shared data, then shifted the language to every portfolio and level of activity. Named platforms remain visible only as illustrative integration and dashboard examples.

### 2. Longer inclusive phrases could affect responsive layouts

- The requested sentence and broader audience labels are longer than the original copy.
- **Fix**: Reviewed the revised homepage and alternative at 390x844 and 1440x900. The text fits without overflow or hierarchy regressions.

## Key Changes

- Added the exact statement: "All major blockchains and exchanges supported."
- Replaced "US traders" with "every portfolio."
- Reframed integrations around blockchains, exchanges, and wallets rather than three named chains.
- Replaced trader-based plan audiences with everyday, growing, complex, and high-volume portfolios.
- Updated FAQ, metadata, structured data source copy, OG artwork, final CTA, and both footers.
- Deployed the update to Vercel production deployment `rdMKNSHUDXFQRRwZhXRBx7yuz9RV`.

## Verification

- `npm run check`: passed.
- `npm run test:e2e`: 21 passed; 3 expected device-specific skips.
- Axe: zero violations on homepage, pricing, and alternative routes at desktop and mobile breakpoints.
- Remote production checks returned 200 and confirmed the requested hero, FAQ, and metadata strings.

## Lessons Learned

Coverage language is distributed across visible copy, metadata, structured content, social artwork, accessibility labels, and shared pricing data; all must be audited together to maintain a consistent product position.
