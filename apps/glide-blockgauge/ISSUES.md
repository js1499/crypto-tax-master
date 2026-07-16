# ISSUES — verify + review loop log

## Pass 1 (report clean · my eye pass: 1)
- [x] Calibration dek inverted the candle claim ("180 hourly candles for 3 minutes" — nonsense;
  carried over from the winning panel proposal). → "one candle per hour vs 180 one-second candles".

## Pass 2 (report clean) → multi-agent review (4 finders → 22 findings → adversarial verify → 14 confirmed)
Visual (desktop/mobile):
- [x] "POPULAR · MOST FILERS" flag wrapped, knocking the Active card off the shared baseline →
  shortened to "MOST FILERS" + nowrap.
- [x] Breaker/footer prose was set in Fragment Mono, breaking the mono=data/grotesk=prose contract
  → Switzer for sentences, mono kept for values/labels/spec lines.
- [x] Trace pulse (.chain::after) overshot its rail onto the chips row (translateY(min(56vh,520px))
  vs a ~414px line) → animates `top: 22px → calc(100% - 28px)`.
- [x] Amber leaked into decoration (section index numerals, delta-cell tint) → numerals to --etch,
  tint removed (temperature law: amber only on evidence/actions).
- [x] Hero H1 rag orphaned "the / block" → nbsp-glued "the block." / "the hash.".
- [x] Mobile eyebrow orphaned "TIME" + duplicated brand → dropped "GLIDE ·", glued "block time".
- [x] SIGN IN tap target ~16px tall → ghost-key style with real padding.
Honesty:
- [x] "Every line points back to a transaction hash" over-claimed for CEX/CSV/equities lines →
  scoped to on-chain lines + "exchange line to its source record" (meta, hero, trace foot; bezel
  reworded to SHOW YOUR WORK).
- [x] "the one price the chain actually recorded" misattributed price to the chain → "FMV at the
  exact moment the chain recorded it".
- [x] Starter "every report export" could read as including Pro-gated securities reports →
  "all crypto report exports".
Robustness:
- [x] #coverage anchor heading hidden under sticky bezel (padding-top:0, no scroll-margin) →
  `scroll-margin-top: 64px` on all anchor targets.
- [x] #566170 text failed WCAG AA (~2.7:1) on 8949 headers + footer fine print → --etch (4.8:1+).
- [x] Scope chips %-positioned against figure incl. caption → chips overlapped caption at 390px →
  wrapped svg+chips in `.scope__view` positioning context.
- [x] 761–1080px pricing grid left a solid hair-colored hole (5 cards / 3 cols gap-trick grid) →
  6-track grid, cards span 2, last row spans 3.
(8 findings refuted by adversarial verify — logged in the workflow output, not actioned.)

## Pass 3 (after fixes) — report clean, eye pass clean.
## Pass 4 — report clean. Two consecutive clean passes achieved.
