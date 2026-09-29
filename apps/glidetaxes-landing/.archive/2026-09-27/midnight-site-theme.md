---
tags: [alternative, hero, typography, midnight-theme, visual-design]
category: design
related: [alternative-site-copy-redesign, immersive-product-hero, legacy-site-restoration]
---

# Midnight Site Theme - 2026-09-27

## Summary
Extended the `/alternative` hero's midnight-blue, electric-blue, and mint design language through every section while preserving the restored layouts and product illustrations.

## Context
- **Route**: `/alternative`
- **Version**: Next.js 16.3.6
- **Deployment**: not deployed in this task

## Issues Encountered & Solutions

### 1. Legacy body and hero used different visual systems
- The hero used a modern midnight palette and sans-serif typography while the restored body used cream, dark green, and a serif display face.
- **Fix**: Kept the body structure and visuals intact but reskinned section surfaces, cards, controls, pricing, FAQ, header, and footer with the hero palette.

### 2. A longer guarantee headline could overwhelm the product visual
- The required headline adds a second full sentence.
- **Fix**: Preserved the exact text but rendered its guarantee sentence at a smaller size inside the same semantic `h1`.

## Key Changes
- Hero: “Crypto taxes, made simple. Submit with ease or your money back.”
- Typography: replaced legacy serif headings and local legacy body type with the hero's system sans-serif stack.
- Palette: midnight section backgrounds, navy cards, electric-blue actions, mint assurances, and light secondary text.
- Visuals: retained all illustration compositions and light in-product UI cards for legibility.
- Updated route metadata and Playwright headline expectations.

## Validation
```text
npm.cmd run check        passed
npm.cmd run test:e2e     30 passed, 4 expected skips
npm.cmd audit --omit=dev 0 vulnerabilities
```

Visual QA covered hero, methodology, workflow, integrations, pricing, FAQ, and 390px mobile.

