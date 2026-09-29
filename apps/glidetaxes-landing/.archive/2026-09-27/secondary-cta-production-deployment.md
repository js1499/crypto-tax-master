---
tags: [vercel, production, alternative, hero, cta, responsive]
category: release
related: [workflow-font-cta-production-deployment, outcome-led-copy-production-deployment]
---

# Secondary CTA Production Deployment - 2026-09-27

## Summary
Published the shorter secondary hero CTA while preserving its text size, height, label, and responsive behavior.

## Context
- **Project**: `jatinsawlani-gmailcoms-projects/glidetaxes-landing`
- **Deployment ID**: `dpl_A4Qh436MBJeQvEPjPZdThEcbuq9A`
- **Deployment URL**: `https://glidetaxes-landing-7uyfvdiya-jatinsawlani-gmailcoms-projects.vercel.app`
- **Stable route**: `https://glidetaxes-landing.vercel.app/alternative`
- **Inspect**: `https://vercel.com/jatinsawlani-gmailcoms-projects/glidetaxes-landing/A4Qh436MBJeQvEPjPZdThEcbuq9A`

## Key Changes
- Reduced only the secondary CTA desktop horizontal padding from the previous responsive values to `lg:px-3 xl:px-3`.
- Kept the label at 18px on desktop.
- Deployed with `npx.cmd vercel deploy --prod --yes`.

## Verification
```text
deployment status                         Ready
stable alias                              assigned
primary CTA width at 1440px               219.75px
secondary CTA width at 1440px             208.84px
primary / secondary font size             18px / 18px
horizontal overflow                       false
```
