---
tags: [vercel, production, alternative, alternating-palette, deployment]
category: release
related: [alternating-section-palette, midnight-theme-production-deployment]
---

# Alternating Palette Production Deployment - 2026-09-27

## Summary
Published the alternating dark/light `/alternative` redesign to the existing Vercel production alias.

## Context
- **Project**: `jatinsawlani-gmailcoms-projects/glidetaxes-landing`
- **Deployment ID**: `dpl_74PBg4SSvxQqXupjgukwwmWKHN91`
- **Deployment URL**: `https://glidetaxes-landing-6eqfxhh74-jatinsawlani-gmailcoms-projects.vercel.app`
- **Stable route**: `https://glidetaxes-landing.vercel.app/alternative`
- **Inspect**: `https://vercel.com/jatinsawlani-gmailcoms-projects/glidetaxes-landing/74PBg4SSvxQqXupjgukwwmWKHN91`

## Key Changes
- Published the dark hero, workflow, trial, comparison, and final CTA surfaces.
- Published the light methodology, integrations, pricing, FAQ, and footer surfaces.
- Preserved the approved headline, product animation, content, layout, and analytics integration.
- Deployed with `npx.cmd vercel deploy --prod --yes`; Vercel built Next.js 16.3.6 and assigned the stable production alias.

## Verification
```text
/alternative                              200
approved guarantee headline               present
light methodology                         present
dark workflow                             present
light integrations                        present
dark trial                                present
light pricing                             present
light FAQ                                 present
/_vercel/insights/script.js               200
/_vercel/speed-insights/script.js         200
deployment status                         Ready
```

