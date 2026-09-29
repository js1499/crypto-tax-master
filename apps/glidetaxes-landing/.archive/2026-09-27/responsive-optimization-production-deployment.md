---
tags: [vercel, production, alternative, responsive, deployment]
category: release
related: [alternative-responsive-optimization, alternating-palette-production-deployment]
---

# Responsive Optimization Production Deployment - 2026-09-27

## Summary
Published the full `/alternative` desktop/mobile optimization and reduced methodology-card overlap to the existing Vercel production alias.

## Context
- **Project**: `jatinsawlani-gmailcoms-projects/glidetaxes-landing`
- **Deployment ID**: `dpl_Ao8WXengv1MDRGbYm6AJZEeUvRqk`
- **Deployment URL**: `https://glidetaxes-landing-35ihzapc3-jatinsawlani-gmailcoms-projects.vercel.app`
- **Stable route**: `https://glidetaxes-landing.vercel.app/alternative`
- **Inspect**: `https://vercel.com/jatinsawlani-gmailcoms-projects/glidetaxes-landing/Ao8WXengv1MDRGbYm6AJZEeUvRqk`

## Key Changes
- Limited the Exact-second card overlap to 24px on mobile and 32px on desktop.
- Published responsive typography, padding, platform rows, pricing table, FAQ, CTA, and footer refinements.
- Preserved the approved copy, alternating palette, product animation, and analytics integrations.
- Deployed with `npx.cmd vercel deploy --prod --yes`; Vercel built Next.js 16.3.6 and assigned the stable production alias.

## Verification
```text
/alternative                              200
responsive markup                         present
rendered horizontal overflow at 320px     false
rendered horizontal overflow at 1440px    false
chart-card overlap at 320px               24px
chart-card overlap at 1440px              32px
/_vercel/insights/script.js               200
/_vercel/speed-insights/script.js         200
deployment status                         Ready
```

