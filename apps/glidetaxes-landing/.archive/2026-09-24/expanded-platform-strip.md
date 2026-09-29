---
tags: [integrations, exchanges, hyperliquid, responsive-grid, vercel]
category: design
related: [inclusive-platform-language, alternative-vercel-production-deployment]
---

# Expanded Platform Strip - 2026-09-24

## Summary

Expanded the `/alternative` featured-platform strip from five examples to twelve, including Hyperliquid and major centralized exchanges.

## Context

- **Branch**: Workspace is not a Git repository
- **Version**: Next.js 16.3.6
- **Production route**: `https://glidetaxes-landing.vercel.app/alternative`

## Issues Encountered & Solutions

### 1. Additional platforms crowded the original single-row layout

- Adding seven exchanges to the existing five examples made the original flex row too dense.
- **Fix**: Reworked the strip as a responsive grid with six columns on wide screens, four and three columns at intermediate widths, and two columns on mobile.

### 2. New platform marks needed accessible identities

- Plain decorative badges would not communicate platform names to assistive technology.
- **Fix**: Added local SVG marks with explicit accessible names and retained visible text labels for every platform.

## Key Changes

- Added Hyperliquid, Binance, Gemini, Crypto.com, OKX, Bybit, and KuCoin.
- Retained Coinbase, Kraken, Ethereum, Solana, and Base.
- Added Playwright assertions covering all seven new exchange names.
- Published Vercel deployment `7xKTrvSzDekhydxrMHS86PskZCRs` to the stable production alias.

## Verification

- `npm run check`: passed.
- Alternative desktop/mobile behavior and Axe checks: passed.
- Desktop and mobile strip screenshots reviewed.
- Remote production route returned 200 and contained every newly added platform.

## Lessons Learned

Platform coverage scales more cleanly as a responsive grid than a compressed logo ribbon, especially when names such as Hyperliquid and Crypto.com must remain visible.
