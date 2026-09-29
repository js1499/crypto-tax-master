---
tags: [vercel, production, alternative-design, deployment, routing]
category: release
related: [competitor-benchmarked-alternative-design, vercel-preview-deployment]
---

# Alternative Vercel Production Deployment - 2026-09-24

## Summary

Published the competitor-benchmarked design to the stable production alias for the linked `glidetaxes-landing` Vercel project and verified `/alternative` remotely.

## Context

- **Project**: `jatinsawlani-gmailcoms-projects/glidetaxes-landing`
- **Deployment ID**: `dpl_BAaAkjhg8F2rzaHGgYguyZDZv5Qa`
- **Stable route**: `https://glidetaxes-landing.vercel.app/alternative`
- **Inspect**: `https://vercel.com/jatinsawlani-gmailcoms-projects/glidetaxes-landing/BAaAkjhg8F2rzaHGgYguyZDZv5Qa`

## Issues Encountered & Solutions

### 1. Custom domain is owned by another project

- `glidetaxes.com` is assigned to `crypto-tax-master`, while this workspace is linked to `glidetaxes-landing`.
- **Fix**: Deployed to the linked project's stable production alias. The custom domain was not moved because that would break the application routes owned by `crypto-tax-master`.

## Key Changes

- Ran `vercel deploy --prod --yes` from the linked workspace.
- Vercel built Next.js 16.3.6 successfully and generated `/alternative` as a static route.
- Vercel aliased the deployment to `https://glidetaxes-landing.vercel.app`.

## Verification

- 200: `/`
- 200: `/alternative`
- 200: `/pricing`
- 200: `/_vercel/insights/script.js`
- 200: `/_vercel/speed-insights/script.js`
- Remote HTML contains the alternative headline and `noindex, nofollow` metadata.
- Remote Chromium screenshot confirmed the production render.

## Lessons Learned

Path-level publication on `glidetaxes.com/alternative` requires a rewrite or route addition in `crypto-tax-master`; it cannot be achieved safely by moving the domain to this standalone landing project.
