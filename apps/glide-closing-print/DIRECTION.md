# DIRECTION — Glide site 3: "CLOSING PRINT"

**Unanimous winner of a 5-direction / 3-judge panel** (3/3 judges; totals 34 / 35 / 34.5 —
runners-up: Swiss poster 31–33, drafting-paper 30.5–32.5, riso print 30–32, Mediterranean
monument 29–32). Brief: a candidate HOME landing page, light theme mandatory, entirely unlike
the emerald-paper production page + variants, the emerald corridor (v1), and the dark
graphite-amber tower (v2).

## The idea
**Glide as a financial broadsheet.** A financial paper is the one cultural object whose whole
identity is "overwhelming market chaos, reconciled into priced, dated, cited columns by
deadline" — which is exactly Concept B ("built for the mess", the hero frame) plus Concept C
("typeset in minutes", the closing beat). Accuracy proof runs as a mid-page data feature.
Edge cases become a **Corrections & Clarifications column** — dry wit doing the selling.

## Composition family — SPLIT EDITORIAL (earned, not default)
A ruled, columned broadsheet front page: masthead between double rules, 7/5 hero split with a
vertical column rule, agate side panels, multi-column body sections. Ledger check: differs from
corridor (v1), vertical tower (v2), and prod's centered SaaS column.

## Color grade — "Pink Paper & Claret" (5 colors, light)
- `--paper #FAEBDC` salmon paper ground, everywhere
- `--ink   #1F1B16` all text and every data figure
- `--claret #8E2244` brand accent: CTAs, kickers, section rules, flags, tx-hash citations
- `--wash  #F2DEC9` tinted panels behind agate tables / boxed columns
- `--rule  #D8C2AD` hairline column rules, table borders, double masthead rules
**Iron rule: P&L data is NEVER colored.** Figures print in ink with ▲/▼ agate glyphs, like a
print stock page — sidesteps the green ban and the red-means-loss trap. Claret never touches a
numeral (hashes/citations are fine).

## Type — Newsreader + Libre Franklin (2 families)
- **Newsreader** (Google, variable opsz): Display cut for masthead/headlines 500–600; Text cut
  400 (+italic) for standfirsts and body prose.
- **Libre Franklin** (400/600/800): the newspaper agate — tables, kickers, bylines, buttons,
  footnotes, `tabular-nums` throughout; tx hashes in 600 letterspaced small caps. Agate ≥11px.

## Motion — split-headline hero, "typesetting" variant
Hero headline lines slide up out of overflow-hidden rows (type being set); masthead double rules
scaleX-draw; the hero column rule draws top-to-bottom. Baseline: Lenis + 3% multiply grain +
IO reveals where **table rows stagger like a wire feed** (30ms/row). Grafted sequencing rule:
content prints first, claret rules and each correction's "Corrected." verdict land **last**.
Counters tumble inside tabular-num spans (no layout shift). Degrade: html.js-gated reveals +
gsap.from over authored final states; reduced-motion/no-JS get the composed front page.

## Aesthetic seed
The FT print edition — Lex column and Companies & Markets agate pages. Translated: salmon
ground, hairline column rules, agate tables, claret kickers, headline/standfirst hierarchy,
▲▼ data glyphs, corrections-column wit. Not copied: no lookalike logotype, shifted hexes,
different faces, no FT layout reproduced. Kitsch cap: no fake news stories, no "EXTRA!"; the
joke stays deadpan. Failure patterns named, competitors never.

## Spine (broadsheet, top to bottom)
1. **Masthead + front page**: double rules; dateline "Tax Year 2025 · U.S., U.K. & Germany
   editions" · GLIDE · "From $0"; agate section nav. 7/5 hero: kicker, split headline
   **"Your on-chain chaos, fit to file."**, standfirst, claret CTA; right = MARKETS agate panel
   (hourly $148.50 struck · block $147.88 · Δ $62.00, asterisked illustrative).
2. **Corrections & Clarifications**: wash-framed box, drop-cap lede, six numbered corrections
   (spam airdrops, staking income, bridged basis, liquid-leg, unmapped types, per-wallet 2025),
   each ending in a claret "— Corrected." that prints after the item.
3. **The price was wrong**: 5/7 split — FMV-at-block-timestamp prose left; right SVG chart of
   180 one-second ink ticks vs one flat hourly bar; below, ruled compounding table
   $6,200/$31,000/$62,000 (▲ glyphs in ink, illustrative footnote).
4. **Listings** (coverage): wash panel, three agate listing groups — DIRECT SYNC
   Coinbase/Kraken/Gemini · BY CSV Binance/KuCoin/custom mapper · CHAINS Solana + 10 EVM —
   plus a visibly struck-through row "Bitcoin wallets — no direct sync" and the dry footnote
   "We would rather tell you than fail you." Real HTML tables in overflow-x wrappers (hard rule).
5. **How the edition gets made**: three ruled columns "Filed. Edited. Printed." with deadline
   stamps (12:02 / 12:03 / ~12:14) carrying the minutes claim; forms list under "Printed".
6. **Citation band** (grafted): "Every line carries its citation." — one oversized ruled agate
   ledger row (date · asset · proceeds · basis · gain · tx hash in claret small caps); subline:
   exchange/CSV lines trace to their source records.
7. **The equities desk**: split band — prose left (stocks, options, wash sales, 1099-B, RSUs,
   §1256 — Pro and above, stated plainly), specimen mixed 8949 rows right (one stock, one crypto).
8. **The rate card**: five ruled columns under a double rule; giant tabular tx allowances
   (300/1,000/10,000/100,000); Active claret-ruled "MOST SUBSCRIBED"; Trial column carries the
   activation promise; "Billed annually" in the table footer. Stacked ruled rows on mobile.
9. **Late edition + colophon**: "Go to press." + claret CTA; colophon in 3 agate columns with
   printer's chrome (registration crosshair, salmon/claret ink swatches), disclaimers, and
   "Glide is tax software, not tax advice."

## Honesty rails (unchanged)
Hash claims scoped to on-chain lines · Binance/KuCoin CSV-only · no BTC wallet sync (struck
listing + footnote) · no DFY/CPA · illustrative footnotes on $ proofs · "audit-ready" never
"audit-proof" · every quip a checkable fact.

## Anti-slop checks honored
1. 5 colors, 2 families, semantic tokens first. 2. Every device is newspaper furniture carrying
real product information (rules, agate, glyphs, corrections) — no decoration without data.
3. Motion gsap.from/IO-only over authored final states; reduced-motion and no-JS complete.
