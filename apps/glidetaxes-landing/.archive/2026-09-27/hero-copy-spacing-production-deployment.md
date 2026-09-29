---
tags: [vercel, production, alternative, hero, responsive-copy]
category: release
related: [responsive-optimization-production-deployment, alternative-responsive-optimization]
---

# Hero Copy Spacing Production Deployment - 2026-09-27

## Summary
Published the constrained hero supporting-copy measure and protected copy-to-product spacing to the existing Vercel production alias.

## Context
- **Project**: `jatinsawlani-gmailcoms-projects/glidetaxes-landing`
- **Deployment ID**: `dpl_Aaz1aAPd81KB2ojcPFgod7SzhzMh`
- **Deployment URL**: `https://glidetaxes-landing-mfejlupnx-jatinsawlani-gmailcoms-projects.vercel.app`
- **Stable route**: `https://glidetaxes-landing.vercel.app/alternative`
- **Inspect**: `https://vercel.com/jatinsawlani-gmailcoms-projects/glidetaxes-landing/Aaz1aAPd81KB2ojcPFgod7SzhzMh`

## Key Changes
- Constrained the supporting paragraph to a balanced desktop measure.
- Added breakpoint-specific spacing between the hero copy and animated product window.
- Added a Playwright regression assertion requiring at least 20px between the two elements.
- Deployed with `npx.cmd vercel deploy --prod --yes`; Vercel built Next.js 16.3.6 and assigned the stable production alias.

## Verification
```text
/alternative                              200
rendered copy/product gap at 1024px       25px
rendered copy/product gap at 1488px       28px
horizontal overflow                       false
/_vercel/insights/script.js               200
/_vercel/speed-insights/script.js         200
deployment status                         Ready
```

