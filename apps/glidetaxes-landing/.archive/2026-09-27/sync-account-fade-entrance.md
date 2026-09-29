---
tags: [alternative, hero, animation, sync, motion]
category: design
related: [account-calculation-hero-redesign, workflow-font-and-hero-cta-scale]
---

# Sync Account Fade Entrance - 2026-09-27

## Summary
Changed the `/alternative` sync-stage account entrance from vertical movement to a staggered opacity-only reveal.

## Key Changes
- Removed the 7px vertical offset from account-row entrance motion.
- Added a 400ms fade for each row with a 240ms stagger.
- Preserved row geometry, sync-status timing, pause controls, and all subsequent calculation stages.

## Validation
- `npm run check` passed.
- Six targeted desktop/mobile Playwright checks passed for sync sequencing, delayed playback, and Axe accessibility.
- The previous transient contrast issue did not recur with the shorter completed fade sequence.
