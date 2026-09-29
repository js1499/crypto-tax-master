---
tags: [glide, copywriting, positioning, alternative, hero, money-back-guarantee]
category: design
related: [competitor-benchmarked-alternative-design, guided-workflow-hero-animation, legacy-site-restoration]
---

# Alternative Site Copy Redesign - 2026-09-27

## Summary
Rewrote the complete `/alternative` landing-page message around ease, reduced review work, proof, free evaluation, and a general money-back guarantee on paid plans.

## Context
- **Branch**: workspace has no Git metadata
- **Version**: Next.js 16.3.6
- **Source material**: `C:\Users\Jatin\Downloads\Glide Hero Copy.pdf`

## Issues Encountered & Solutions

### 1. PDF Section A was explicitly excluded from the hero
- The PDF proposed “File your crypto taxes knowing where every number comes from.”
- **Fix**: Used a distinct relief-led hero, “Crypto taxes, without the tax-season grind,” and moved transaction-level proof into the body.

### 2. Review language made the product sound labor-intensive
- Existing copy repeatedly emphasized reviewing transactions.
- **Fix**: Reframed the workflow as Glide organizing the busywork and surfacing one focused exception; preserved traceability as optional proof rather than another task.

### 3. Guarantee terms were unspecified
- No duration or detailed eligibility rules were provided.
- **Fix**: Used the general claim “money-back guarantee on paid plans” without inventing a time period, and stated that eligibility terms are presented at purchase.

## Key Changes
- Hero: relief-led positioning, ease-of-use support, free-to-start offer, and guarantee reassurance.
- Product proof: block-timestamp pricing, exception-based review, and source-linked calculations.
- Workflow: connect once, Glide organizes, reports become ready.
- Integrations: one inclusive portfolio story across major exchanges, chains, and wallets.
- Trial/pricing: see the result free; pay when ready to export.
- FAQ/final CTA/footer: objection handling and a consistent “easier path to done” narrative.
- Tests updated for the new visible copy and accessible figure description.

## Validation
```text
npm.cmd run check       # passed
npm.cmd run test:e2e    # 30 passed, 4 expected skips
npm.cmd audit --omit=dev # 0 vulnerabilities
```

Visual checks were performed at 1440x900 and 390x844. The change was not deployed in this task.

