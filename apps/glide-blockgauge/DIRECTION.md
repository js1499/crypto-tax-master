# DIRECTION — Glide site 2: "Blockgauge"

**Winner of a 5-direction / 3-judge panel** (2 of 3 judges, highest aggregate 105/103/96.5/83.5/83).
Subject: Glide, crypto (+ equities) tax software; wedge = verifiable accuracy. This site must be
entirely unlike the production homepage AND `apps/glide` v1 (both emerald-on-paper; v1 = corridor
case-file). Concept **D leads** ("audit-ready / prove every number") — v1 already spent Concept A.

## The idea
**The page is a calibrated measuring instrument.** An instrument's entire reason to exist is that
its reading can be trusted — which is Glide's wedge, made visceral before a word is read. Every
proof asset maps to a native instrument idiom: the $62 delta → an oscilloscope trace; compounding
error → gauge needles; edge cases → a breaker switchboard; coverage honesty → an engraved serial
plate; pricing → a detented range selector.

## Composition family — VERTICAL TOWER
Narrow centered column (~880px), big vertical rhythm, oversized type; each section a machined
faceplate module stacked down the tower. Differs from v1 (corridor) per the uniqueness ledger.
Decorative page-edge tick rules only ≥1200px, identical both sides, non-sticky, non-navigational
(else they'd smell like a corridor rail); an engraved CONTENTS register sits in the hero instead
of SaaS nav pills.

## Color grade — "Graphite & Signal Amber" (5 colors, dark-only, committed)
- `--ground #0E1216` cold blue-black matte page
- `--plate  #171C22` raised faceplate surface · `--hair #2A313A` hairline borders
- `--ink    #E9ECEF` cool off-white engraving (headlines, body)
- `--etch   #7E8894` muted gray — tick labels, secondary copy, graticule, AND all wrong/absent
  numbers (strike-throughs, "not covered" lines)
- `--amber  #FFB300` the ONE signal color
**Token contract (temperature law):** amber may touch ONLY verified evidence and actions — a
reading, a delta, an indicator, the CTA. Never decoration, never Glide's own gaps. <5% of surface.
No red anywhere. No gradients as surfaces.

## Type — Switzer + Fragment Mono (2 families)
- **Switzer** (Fontshare 300/400/600/700): 700 tight headlines (-0.02em); 300 letterspaced small
  caps (+0.14em) for engraved panel labels; 400 body 16-17px/1.55.
- **Fragment Mono** (Google, 400): every numeral, readout, hash, tick label, spec line. All data
  wears the mono; all prose wears the grotesk.

## Motion signature — "power-on calibration sweep" (bespoke dominant)
Baseline: Lenis smoothScroll + grain + IO reveal (html.js-gated). Dominant: each instrument
settles to its reading on first viewport entry — needles sweep from rest (-120°) with overshoot,
mono readouts tumble from zeros, the hero trace draws in (stroke-dashoffset), indicator dots blink
once then hold. **Degrade architecture: the authored HTML/CSS is the final settled state; JS uses
`gsap.from(...)` only** — no `.armed` off-state class, so no-JS / blocked CDN / reduced-motion all
render the fully-settled page. Nothing pins, nothing parallaxes.

## Aesthetic seed
Dieter Rams-era Braun test hardware (TG 60, ET 66) × a Tektronix oscilloscope faceplate: matte
graphite, pale engraved small-caps, exactly one colored control, functional ornament only (tick
graduations, corner screws, graticule). The feeling taken: *"this object does not lie."* Editorial
rule (grafted from the newspaper proposal): **every piece of genre furniture must carry real
product information or be cut** — no decorative screws on panels that hold no data.

## Spine (tower, top to bottom)
1. **Bezel masthead** — sticky 56px: wordmark left, mono readout `TY 2025 · FMV @ BLOCK TIME`
   right, tick-graduated bottom edge.
2. **Hero — The Readout**: eyebrow · "Measured at the block. Proven by the hash." · dek (FMV
   method, $148.50 vs $147.88, show-your-work) · amber CTA + ghost CTA · engraved CONTENTS
   register (anchor links) · full-width oscilloscope: 10×8 graticule, stepped amber block-price
   trace vs dotted etch hourly line, leader to `Δ $62.00 / 100 SOL`.
3. **Calibration strip**: three readout cells — HOURLY CANDLE `$148.50` (struck through, etch) ·
   BLOCK 20:41:07 UTC `$147.88` · Δ ON 100 SOL `$62.00` (amber). Line: "180 hourly candles to
   describe 3 minutes of trading — or the one price the chain actually recorded."
4. **Gauge bank — error compounds**: three SVG dials, needles at $6,200 / $31,000 / $62,000
   (100/500/1,000 trades), engraved illustrative footnote.
5. **Switchboard — built for the mess**: 3×2 breaker modules w/ amber indicator dots: spam-airdrop
   guard · staking/rewards as income · bridged assets (basis surfaced, never guessed) ·
   liquid-leg pricing · unmapped types categorized · per-wallet 2025 IRS basis.
6. **Trace panel — "If the IRS asks, you can show them the block."** (grafted headline): the
   four-state chain of custody as stacked faceplate modules on a signal path — RAW LOG → DECODED
   SWAP → PRICED AT BLOCK (candle struck) → FORM 8949 ROW — then output chips: 8949 · Schedule D ·
   Schedule 1 · UK SA108 · DE Anlage SO · TurboTax · FIFO/LIFO/Spec-ID.
7. **Equities ticker band** (grafted): one hairline tape — stocks · options · wash sales · 1099-B
   · RSUs · §1256 — "one report, Pro and above."
8. **Spec plate — coverage, honestly**: serial-plate registers — DIRECT SYNC Coinbase/Kraken/
   Gemini · CSV IMPORT Binance/KuCoin/custom mapper · WALLET SYNC Solana + 10 named EVM chains —
   plus engraved exclusion in etch: "NO BITCOIN WALLET SYNC — we say so because you'd find out."
9. **Range selector — pricing**: detented scale (amber index on ACTIVE · POPULAR) over five flat
   faceplate cards: Trial $0 ("Connect accounts. See your computed numbers. Pay when you want the
   forms.") / Starter $49 · 300 tx / Active $99 · 1,000 tx / Pro $299 · 10,000 tx + securities +
   analytics / Prime $699 · 100,000 tx. Annual.
10. **Power switch — close**: "See your numbers before you pay a dollar." + amber CTA. Footer
    bezel fine print incl. grafted line: **"Audit-ready, not audit-proof — we don't guarantee
    outcomes, we document them."**

## Honesty rails (unchanged)
No BTC-wallet claims · Binance/KuCoin CSV-only · no DFY/CPA · illustrative footnotes kept ·
"catches what other tools miss," never "handles everything."

## Anti-slop checks honored
1. 5 colors, 2 families, semantic tokens first. 2. No decorative blobs; every mark is a tick, a
rule, a screw on a data panel, or a reading. 3. All motion `gsap.from`-only over an authored
final state; reduced-motion & no-JS complete.
