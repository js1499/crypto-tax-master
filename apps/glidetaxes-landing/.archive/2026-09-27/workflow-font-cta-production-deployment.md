---
tags: [vercel, production, alternative, font, cta]
category: release
related: [workflow-font-and-hero-cta-scale, portfolio-typography-production-deployment]
---

# Workflow Font and CTA Production Deployment - 2026-09-27

## Summary
Published the shared site/workflow font stack and larger hero CTA labels to the existing Vercel production alias.

## Context
- **Project**: `jatinsawlani-gmailcoms-projects/glidetaxes-landing`
- **Deployment ID**: `dpl_9pmMYo1XUopDw6QCT4kPbA6XdeJg`
- **Deployment URL**: `https://glidetaxes-landing-h3gclt1bo-jatinsawlani-gmailcoms-projects.vercel.app`
- **Stable route**: `https://glidetaxes-landing.vercel.app/alternative`
- **Inspect**: `https://vercel.com/jatinsawlani-gmailcoms-projects/glidetaxes-landing/9pmMYo1XUopDw6QCT4kPbA6XdeJg`

## Key Changes
- Published explicit font-family equality between the product workflow and site content.
- Published 18px desktop and 14px 320px hero CTA labels.
- Preserved button dimensions and responsive fit.
- Deployed with `npx.cmd vercel deploy --prod --yes`.

## Verification
```text
deployment status                         Ready
stable alias                              assigned
workflow/site fonts                       match
desktop primary/secondary CTA             18px / 18px
mobile primary/secondary CTA              14px / 14px
horizontal overflow at 1440px             false
horizontal overflow at 320px              false
```
