---
tags: [vercel, production, alternative, hero, portfolio-animation]
category: release
related: [account-calculation-hero-redesign, hero-copy-spacing-production-deployment]
---

# Account Calculation Hero Production Deployment - 2026-09-27

## Summary
Published the lighter guarantee-led hero and three-stage portfolio calculation animation to the existing Vercel production alias.

## Context
- **Project**: `jatinsawlani-gmailcoms-projects/glidetaxes-landing`
- **Deployment ID**: `dpl_6GbTxbgT4JQ2Kmek8bZGMfaNbVqW`
- **Deployment URL**: `https://glidetaxes-landing-bnw1te73d-jatinsawlani-gmailcoms-projects.vercel.app`
- **Stable route**: `https://glidetaxes-landing.vercel.app/alternative`
- **Inspect**: `https://vercel.com/jatinsawlani-gmailcoms-projects/glidetaxes-landing/6GbTxbgT4JQ2Kmek8bZGMfaNbVqW`

## Key Changes
- Published the exact `Accurate taxes or your money back` headline.
- Published the account-sync, per-account P/L, and combined `+$12,324.68` portfolio sequence.
- Preserved the existing stable production alias and telemetry integrations.
- Deployed with `npx.cmd vercel deploy --prod --yes`.

## Verification
```text
/alternative                              200
new headline                              present
old headline                              absent
initial workflow stage                    sync
final workflow stage                      total
live portfolio total                      +$12,324.68
horizontal overflow at 1440px             false
/_vercel/insights/script.js               200
/_vercel/speed-insights/script.js         200
deployment status                         Ready
```
