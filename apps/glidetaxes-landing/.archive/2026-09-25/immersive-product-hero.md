---
title: Immersive product hero redesign
date: 2026-09-25
category: design
tags: [hero-redesign, immersive-dashboard, css-animation, accessibility, vercel]
related: [competitor-benchmarked-alternative-design, expanded-platform-strip, alternative-vercel-production-deployment]
---

# Immersive product hero redesign

## Summary

Rebuilt the `/alternative` hero as a full-width midnight product stage that makes Glide's value visible: representative accounts and networks flow into a reconciliation workspace and emerge as tax-ready reports. The route remains deployed at `https://glidetaxes-landing.vercel.app/alternative`.

## Context

- Workspace: `C:\Users\Jatin\glidetaxes-landing`
- Framework: Next.js 16.3.6, React 19, Tailwind CSS v4
- Scope: `/alternative` hero only; navigation, pricing, routes, and analytics contracts were preserved
- Current production deployment: `dpl_DnYmexD7QCK148PnwhCYHnD9KRp5`
- Production alias: `https://glidetaxes-landing.vercel.app`

## Problems addressed

- The prior split hero looked polished but did not communicate Glide's activity-to-report workflow immediately.
- The product visual needed greater depth without adding video, WebGL, remote assets, runtime imagery, or a client-side animation dependency.
- Desktop, tablet, and narrow mobile layouts needed the dashboard to remain prominent without horizontal overflow.
- Motion needed a useful reduced-motion fallback and content had to remain visible after every reveal.

## Key changes

- Added `src/components/alternative/ImmersiveHeroScene.tsx` as a server-rendered, labelled `<figure>`.
- Composed the scene from React, CSS, local SVG marks, and existing product concepts:
  - Coinbase, Hyperliquid, Ethereum, Solana, and Binance source nodes
  - reconciliation dashboard and review queue
  - reviewed, classified, and needs-attention states
  - Form 8949, Schedule D, capital gains, and income report outputs
  - accounts-synced, review-progress, and reports-ready status cards
- Reworked `AlternativeLanding.tsx` into a dark, product-dominant composition while preserving the headline, CTA destinations, and event names.
- Added scoped CSS entrance, path-pulse, glow-cycle, and maximum-4px ambient movement in `globals.css`.
- Added a `prefers-reduced-motion` fallback that removes meaningful transforms and looping motion.
- Kept the expanded platform section directly below the hero unchanged.
- Extended Playwright coverage for the figure label, headline, CTAs, source/report content, responsive overflow, and reduced-motion behavior.

## Responsive decisions

- Desktop gives the product scene roughly 60% of the hero and lets it overlap the normal content boundary.
- Tablet typography and CTA spacing were tightened to avoid collision around 1024px.
- Mobile removes perspective, hides lower-priority floating nodes/cards, and retains three representative sources plus the report-ready output.
- Assurance points move beneath the product figure on mobile so the dashboard appears in the first viewport.

## Validation

- `npm run check`: passed (lint, TypeScript, production build)
- Playwright: 25 passed, 3 expected device-specific skips
- Axe: zero violations on desktop and mobile `/alternative`
- `npm audit --omit=dev`: zero vulnerabilities
- Visual QA: 1440x900, 1024x768, 390x844, and 320x700
- Production Lighthouse:
  - Performance: 98
  - Accessibility: 100
  - Best Practices: 100
  - SEO: 66 because `/alternative` intentionally remains `noindex`
  - LCP: 2.4s
  - CLS: 0
- Production smoke checks returned 200 for `/alternative`, Vercel Analytics, and Speed Insights.

## Deployment notes

- Unique deployment: `https://glidetaxes-landing-a2r6ukxam-jatinsawlani-gmailcoms-projects.vercel.app`
- Stable route: `https://glidetaxes-landing.vercel.app/alternative`
- `glidetaxes.com` remains attached to the separate `crypto-tax-master` Vercel project, so the landing project's stable Vercel alias is the safe production destination.

## Lessons

- A complex, cinematic product hero can stay fully server-rendered when the visual hierarchy is semantic HTML and SVG and the motion is scoped CSS.
- At tablet widths, adjusting headline scale and CTA padding is more robust than shrinking the product scene until it loses visual impact.
- A deliberately non-indexed concept route cannot receive a perfect Lighthouse SEO score; the audit result should be documented rather than weakening the intended routing policy.

## Clarity and motion revision

After live visual review, the atmospheric scene was reorganized into an explicit three-stage narrative:

1. `Activity in` groups readable exchange and blockchain sources.
2. `Review in Glide` enlarges the transaction count, review progress, activity states, and attention queue.
3. `Tax-ready output` resolves into a bright report-export card.

Motion now explains the workflow instead of only adding ambience:

- repeating connection pulses move from source activity into Glide and from Glide toward reports;
- a visible scan line travels through the reconciliation workspace;
- the review bar fills on entrance and receives an occasional sheen;
- activity rows sweep in sequence;
- connection indicators and the completed-report check pulse without fading content out;
- all motion is disabled by the existing `prefers-reduced-motion` rule.

Responsive refinements keep five sources on wide desktop, three readable sources on the constrained two-column tablet layout, and expose the first two numbered stages in the first mobile viewport. The CTA pair was compacted on narrow screens without changing destinations or analytics.

Revision validation:

- `npm run check`: passed
- Playwright: 27 passed, 3 expected device-specific skips
- Axe: zero violations on desktop and mobile
- Visual QA: 1440x900, 1024x768, 390x844, and 320x700
- No horizontal overflow at any tested breakpoint
- Live animation: `alternative-data-flow`, 1.8 seconds, infinite
- Production route, Analytics, and Speed Insights: HTTP 200

Revision deployment:

- ID: `dpl_2fHbpELf65iXMhs2PSTjbeVgXXBi`
- Unique URL: `https://glidetaxes-landing-i439jp2a7-jatinsawlani-gmailcoms-projects.vercel.app`
- Stable URL: `https://glidetaxes-landing.vercel.app/alternative`

## Twenty-percent product scale correction

The initial 5-6% enlargement was too conservative. The product workflow now uses the requested material scale increase while the left copy, mobile layout, and hero layout height remain unchanged.

- 1280px and wider: `translate3d(10px, -6px, 0) scale(1.2)`
- 1024-1279px: `translate3d(8px, -4px, 0) scale(1.16)` to respect the narrower viewport
- Dashboard and source-tray insets were increased so the enlarged UI remains fully readable and clear of the copy.
- The report card was pulled inward to keep its controls and border visible.
- The report entrance no longer fades through partial opacity; it retains slide-and-scale motion while maintaining valid contrast at every animation frame.

Validation:

- `npm run check`: passed
- `/alternative` Playwright subset: 11 passed, 1 expected desktop skip
- Axe: zero violations on desktop and mobile
- Reduced-motion behavior: passed
- Production scale verified as `matrix(1.2, 0, 0, 1.2, 10, -6)` at 1440px
- Production route: HTTP 200 with no document overflow

Deployment:

- ID: `dpl_DnYmexD7QCK148PnwhCYHnD9KRp5`
- Unique URL: `https://glidetaxes-landing-ot4zgv5ef-jatinsawlani-gmailcoms-projects.vercel.app`
- Stable URL: `https://glidetaxes-landing.vercel.app/alternative`

## Product scale revision

The left-side typography and the hero's layout height were preserved while the desktop product composition was enlarged inside its existing layout box.

- Added a dedicated `alternative-hero-visual` wrapper class.
- Increased the scene's usable maximum width from 820px to 840px.
- Applied layout-neutral transforms only at desktop breakpoints:
  - 1024-1279px: `translate3d(10px, -4px, 0) scale(1.05)`
  - 1280px and wider: `translate3d(16px, -5px, 0) scale(1.06)`
- Kept mobile sizing unchanged.
- Positioned the expanded dashboard close to the viewport edge without covering the supporting paragraph or creating document overflow.

Validation:

- `npm run check`: passed
- `/alternative` Playwright subset: 11 passed, 1 expected desktop skip
- Desktop and mobile Axe checks: zero violations
- 1440x900 and 1024x768 visual QA passed
- Production computed transform: `matrix(1.06, 0, 0, 1.06, 16, -5)`
- Production route: HTTP 200 with no horizontal overflow

Deployment:

- ID: `dpl_5qgRKP89dZ4362rUynC4SgZZypD7`
- Unique URL: `https://glidetaxes-landing-o3o7fyelp-jatinsawlani-gmailcoms-projects.vercel.app`
- Stable URL: `https://glidetaxes-landing.vercel.app/alternative`
