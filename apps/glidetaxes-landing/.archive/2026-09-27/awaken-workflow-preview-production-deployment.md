---
tags: [vercel, production, alternative, animation, preview]
category: release
related: [awaken-workflow-preview, secondary-cta-production-deployment]
---

# Workflow preview production deployment - 2026-09-27

## Summary
Published the new three-step workflow animation at the bottom of `/alternative`, preserving the existing hero.

## Context
- Project: `jatinsawlani-gmailcoms-projects/glidetaxes-landing`
- Deployment ID: `dpl_B4BvpuxaujjGEmn4jbtvAUETdL4F`
- Deployment URL: `https://glidetaxes-landing-3nlgrubnr-jatinsawlani-gmailcoms-projects.vercel.app`
- Stable preview: `https://glidetaxes-landing.vercel.app/alternative#hero-animation-preview`
- Inspect: `https://vercel.com/jatinsawlani-gmailcoms-projects/glidetaxes-landing/B4BvpuxaujjGEmn4jbtvAUETdL4F`

## Deployment
Ran `npx.cmd vercel deploy --prod --yes`. Vercel build and TypeScript passed; production status Ready and stable alias assigned. No application domain or routing changes.

## Verification
- Production `/alternative` returns HTTP 200.
- Existing hero and new bottom preview both present.
- New animation paused offscreen at initial page load.
- Watched live desktop playback through accounts, transactions, reports. Each scene reached full opacity at the expected stage.
- Download control fades in during the final scene.
- No browser page errors or desktop horizontal overflow.
- Live 390px check: starts on scroll, first account reveals, manual pause freezes, resume advances, no page errors or overflow.
- Live 320px reduced-motion check: completed reports and download shown, playback controls hidden, preview fits within 16px side margins with no overflow.
- Pre-deployment validation: `npm.cmd run check` passed, complete Playwright suite 41 passed / 5 intentional skips.
