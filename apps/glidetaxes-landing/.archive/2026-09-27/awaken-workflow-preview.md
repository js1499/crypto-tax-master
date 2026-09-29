---
tags: [alternative, animation, awaken, preview, accounts, transactions, reports, accessibility]
category: design
related: [account-calculation-hero-redesign, sync-account-fade-entrance]
---

# Awaken-style workflow preview - 2026-09-27

## Summary
Added a separate three-step animation at the very bottom of `/alternative#hero-animation-preview`. Current hero remains unchanged. Not deployed during this turn.

## Reference inspection
- Browser inspected awaken.tax Fast, Accurate Tax Filing animation at desktop and mobile.
- Original is SVG Lottie, 1316x1254 viewBox, rendered 520x496 desktop and 358x341 mobile.
- Six-row white table, 47.5/28.5/24% columns, warm peach/orange/burgundy field.
- Original timing: 181 frames, 30fps, playback speed .75; 444ms row stagger, 889ms logo scale, 444ms fades.
- Backdrop is an embedded WebP. Recreated with locally rendered gradients using sampled colors; no reference asset imported into production.
- Local platform marks, system site font, accessible pill colors, original sample activity.

## Implementation
- `WorkflowAnimationPreview.tsx`: server section at bottom of AlternativeLanding.
- `FilingWorkflowAnimation.tsx` and CSS Module: reusable client scene.
- `useWorkflowPlayback.ts`: synchronized native Web Animations clock with viewport, tab visibility, manual pause, replay, reduced-motion handling, and cleanup.
- 24-second timeline: Add accounts 0-8s, Sync transactions 8-16s, Done! Download reports 16-24s.
- Fixed rows fade in with gentle mark/pill scale; no vertical row travel.
- Final scene draws a checkmark and reveals Form 8949, Schedule D, Income report, and an illustrative download control. It is a demonstration, not an actual file download.
- All tracks wait at time zero until scrolled into view. All animation tracks pause together and preserve their playhead.
- Reduced motion renders completed reports immediately and hides playback controls.
- No dependencies added. Existing hero, copy, CTAs, metadata, and pricing untouched.

## Validation
- `npm.cmd run check` passed.
- `npm.cmd run test:e2e -- --workers=4`: 41 passed, 5 intentional skips.
- New preview tests cover real initial playback, snapshots of all states, manual/offscreen pause, replay, static reduced motion, keyboard controls, description, touch target dimensions, scoped Axe, 320/390/768/1024/1440 overflow.
- Watched and captured the full real-time first cycle, not just seeked states.
- Screenshots under `docs/design-references/glide-filing-preview-*` and `glide-preview-live-*`.
- Component reference/spec: `docs/research/components/workflow-animation-preview.spec.md`.

## Notes
Keep exact style inspiration scoped to this preview. User has not chosen to replace the hero. Native tracks allow a true pause including intermediate fades, avoiding independently running animation clocks.
