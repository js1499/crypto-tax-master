---
tags: [hero, guarantee, copy, animation, loop, responsive, visual-polish]
category: design
related: [pricing-guarantee-and-restored-headings, hero-label-control-cleanup, light-hero-palette]
---

# Plain hero and site polish - 2026-09-27

## Summary
Polished `/alternative` with a plain light hero, prominent shared guarantee treatment, one hero CTA, looping workflow, and consistent spacing and colors below the hero.

## Key Changes
- Solid hero background `#f4f7fb`, with the grid and glow layers removed. Desktop hero remains 760px tall.
- Headline is `Crypto taxes, made simple.` The accuracy promise now appears in a separate mint guarantee panel, shared through `MoneyBackGuarantee.tsx` with pricing. Hero includes the all-paid-plans qualifier.
- Primary `Get started free` link and tracking remain unchanged; secondary hero CTA removed.
- Exact user-supplied supporting copy: `Spend up to 95% less time on crypto taxes and feel great about getting them done. Connect your accounts, review your summary, and download your reports.` User was explicitly told the 95% claim needs supporting evidence; no study or proof was fabricated.
- Native Web Animations timeline preserves the nine-second story, holds the completed report for three additional seconds, then crossfades into fresh account rows over 400ms. Total loop 12,400ms. First playback delayed one second after load. Offscreen/hidden-tab pause and reduced-motion static report at 8,250ms retained.
- Step descriptions enlarged to 36px desktop, 24px at390px, and22px at320px. Steps retain intrinsic header height so the longest label can wrap safely.
- Removed integrations eyebrow `All your accounts`. Preserved restored headings, routes, product concepts, pricing data, and analytics.
- Body sections use64px mobile/80px desktop vertical spacing, consistent1200px containers and16px/24px gutters. Cards use navy/slate labels, blue/mint accents, softer shadows, and subtle hover-only lifts that respect reduced motion.
- Tablet integrations use tidy logo rows below1280px, avoiding the desktop orbit overlapping the title.
- Exact-second visual remains shallowly overlapping:24px mobile/32px desktop.

## Verification
- `npm.cmd run check`: lint, TypeScript, and production build passed.
- `npm.cmd audit --omit=dev`: zero vulnerabilities.
- Playwright:35 passed in full run plus2 palette cases rerun after updating the expected supporting-copy color to `#536176`;37 passed total,5 intentional skips.
- Covered all three workflow stages, real loop restart,3s hold,400ms crossfade, one-second startup, offscreen pause, reduced-motion static state, desktop/mobile Axe, CTA destinations, guarantees, and responsive widths320/390/768/1024/1440.
- Native hidden-tab behavior was tested through its visibility handler because headless Chromium does not expose real tab backgrounding reliably. Shared animation tracks freeze and resume without drift.
- Manual screenshots reviewed for hero, methodology, integrations, pricing, FAQ, trial and finalCTA. No horizontal overflow or clipped chart labels at tested widths.

## Development Note
Restart `next dev` after global CSS edits if computed styles remain stale. Avoid concurrent production builds and the Playwright dev-server suite because they share `.next` output.
