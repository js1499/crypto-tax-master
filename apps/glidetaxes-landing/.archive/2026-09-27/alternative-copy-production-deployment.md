---
tags: [vercel, production, alternative, copywriting, deployment]
category: release
related: [alternative-site-copy-redesign, alternative-vercel-production-deployment, legacy-site-restoration]
---

# Alternative Copy Production Deployment - 2026-09-27

## Summary
Published the complete `/alternative` copy redesign to the existing `glidetaxes-landing` Vercel production project and verified the stable public route.

## Context
- **Project**: `jatinsawlani-gmailcoms-projects/glidetaxes-landing`
- **Deployment ID**: `dpl_4oMi3fTmL8PcGRWX9GrS3ZwWng9t`
- **Deployment URL**: `https://glidetaxes-landing-prega0u1d-jatinsawlani-gmailcoms-projects.vercel.app`
- **Stable route**: `https://glidetaxes-landing.vercel.app/alternative`
- **Inspect**: `https://vercel.com/jatinsawlani-gmailcoms-projects/glidetaxes-landing/4oMi3fTmL8PcGRWX9GrS3ZwWng9t`

## Issues Encountered & Solutions

### 1. Preserve the existing domain boundary
- `glidetaxes.com` remains assigned to the separate `crypto-tax-master` application project.
- **Fix**: Deployed to the linked landing project and retained its stable `glidetaxes-landing.vercel.app` alias without moving the custom domain.

### 2. Build warnings were non-blocking
- Vercel warned that `node >=24` can advance to a future major version and that one dependency install script was not allow-listed.
- **Fix**: No action was required for this deployment; the production build completed and reached Ready status.

## Key Changes
- Ran `npx.cmd vercel deploy --prod --yes` from the linked workspace.
- Vercel built Next.js 16.3.6 and statically generated `/alternative`.
- Confirmed the live HTML contains the new ease-led headline, money-back guarantee, reduced-review methodology copy, and `noindex, nofollow` directive.
- Confirmed Vercel Analytics and Speed Insights scripts return HTTP 200.

## Verification
```text
/alternative                              200
/_vercel/insights/script.js               200
/_vercel/speed-insights/script.js         200
deployment status                         Ready
```

