---
tags: [copy, positioning, benefits, reduced-review, accuracy, alternative]
category: design
related: [alternative-site-copy-redesign, account-calculation-hero-redesign]
---

# Outcome-led copy rewrite - 2026-09-27

## Summary
Reframed the alternative landing page around finishing faster, reviewing easily, and getting accurate results.

## Context
- **Branch**: No Git metadata in workspace
- **Route**: `/alternative`

## Issues Encountered & Solutions

### 1. Mechanisms were presented as the value proposition
- Labels such as "Exact pricing," "Less review," and "Clear proof" described how Glide works before explaining why the customer should care.
- **Fix**: Replaced the hierarchy with "Finish faster," "Review easily," and "File accurately." Supporting copy now introduces product details only as evidence for those outcomes.

### 2. Review language implied cleanup work
- "Spend your time on the exceptions" suggested that customers would need to find and fix errors.
- **Fix**: Removed exception and discrepancy framing across the methodology, DeFi FAQ, hero, and review illustration. The new promise is to review the result without working through every transaction.

### 3. Copy sounded generic and overworked
- Several headlines used abstract phrases and repeated internal workflow language.
- **Fix**: Used shorter, direct statements such as "Review the result, not every transaction" and "Get your crypto taxes done faster."

### 4. Em dashes remained in visible copy
- **Fix**: Removed em dashes from source copy and replaced comparison-table absence marks with a multiplication sign while preserving screen-reader text.

## Key Changes
- Rewrote hero support copy and alternative metadata.
- Reframed methodology tabs, cards, illustrations, and calls to action.
- Rewrote workflow, integrations, free-trial, pricing, FAQ, final CTA, and footer copy.
- Updated shared Trial and FAQ copy to keep messaging consistent.
- Kept the animated hero structure and timing unchanged, aside from benefit-led stage headings.

## Validation
- `npm.cmd run check`: passed.
- `npm.cmd run test:e2e`: 32 passed, 4 intentionally skipped.
- Desktop and mobile Axe checks passed.
- No em dash remains in `src` or visible route copy.

## Lessons Learned
Lead with the customer outcome. Use mechanisms only as proof. Do not frame normal product use as error correction, exception handling, or required cleanup.
