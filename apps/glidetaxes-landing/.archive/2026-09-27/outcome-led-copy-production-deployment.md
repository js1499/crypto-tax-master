---
tags: [vercel, production, alternative, copy, positioning]
category: release
related: [outcome-led-copy-rewrite, workflow-font-cta-production-deployment]
---

# Outcome-led Copy Production Deployment - 2026-09-27

## Summary
Published the benefit-led `/alternative` copy rewrite to the existing Vercel production project and stable alias.

## Context
- **Project**: `jatinsawlani-gmailcoms-projects/glidetaxes-landing`
- **Deployment ID**: `dpl_GgZsjYRwa4WMK7UHATJCssPWo64u`
- **Deployment URL**: `https://glidetaxes-landing-d4hwws0sa-jatinsawlani-gmailcoms-projects.vercel.app`
- **Stable route**: `https://glidetaxes-landing.vercel.app/alternative`
- **Inspect**: `https://vercel.com/jatinsawlani-gmailcoms-projects/glidetaxes-landing/GgZsjYRwa4WMK7UHATJCssPWo64u`

## Key Changes
- Published outcome-led messaging around faster completion, easier review, and accurate results.
- Removed exception and discrepancy framing.
- Removed em dashes from site source and live route copy.
- Deployed with `npx.cmd vercel deploy --prod --yes`.

## Verification
```text
deployment status                         Ready
stable alias                              assigned
/alternative status                      200
new outcome heading                      present
new review heading                       present
rejected exception headline              absent
em dash                                  absent
```
