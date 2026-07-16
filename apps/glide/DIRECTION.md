# DIRECTION — Glide marketing site ("The Case File")

**Subject:** Glide — crypto (+ equities) tax software whose wedge is *verifiable accuracy on messy
on-chain reality*. Flagship message = Concept A from LANDING_PAGE_MESSAGING.md: lead with the
outcome/enemy ("other tools get your numbers wrong"), mechanism (block-timestamp pricing) becomes
the proof. Site-type: product launch. Slug: `glide`.

## Composition family — CORRIDOR
A persistent left rail (the **audit index**: case-file header, E-01…E-08 evidence index with
scroll-tracked current item, a ticking block-height readout, CTA) + a scrolling main column where
each section is an **exhibit** in the case. Why: the product's whole claim is "we can show our
work" — a case-file/working-papers structure *is* the claim. Differs from the last built example
(split editorial) and from Glide's own current homepage (centered stack): no prior corridor in the
ledger. Mobile: rail collapses to a slim sticky top strip.

## Color grade — Ledger-paper blueprint (brand-derived, 5 colors)
- `--paper  #F7F8F5` page ground (brand bg family; warm-green paper)
- `--ink    #17201A` text / dark panels (brand ink family)
- `--muted  #5C695F` secondary text · `--line rgba(23,32,26,.16)` hairlines (neutral tints of ink)
- `--emerald #10B981` the brand signal (marks, fills, CONFIRMED) with `--emerald-deep #0A7A55`
  as its legible-on-paper text shade (one brand color, two shades — mirrors the app's accent/dim)
- `--rust   #C2410C` the ERROR color — used ONLY where other tools' wrongness is shown
No gradient surfaces. Red never decorates; it means "wrong number."

## Type personality — Grotesk display + mono data (2 families)
- **Cabinet Grotesk** (Fontshare CDN — the actual brand face) for display + body.
- **DM Mono** (Google) for every number, hash, label, and table figure — numbers are the product.
Body ≥16px, line-height 1.55. Uppercase mono labels at 0.14–0.18em tracking.

## Motion signature
Baseline: Lenis smoothScroll + film grain + IO-based `.reveal` (html.js-gated, degrades visible).
**Dominant move: the hero "price-resolve"** — the hourly estimate `$148.50` is struck through and
the exact block price `$147.88` resolves digit-by-digit like a settling meter, then gets its
CONFIRMED tick. One SplitText line-mask on the H1 supports it. Count-ups on the compounding
figures. No pinned scrub, no parallax, no cursor gimmick. (≤2 reveal patterns: reveal + count-up.)

## Aesthetic seed
**An auditor's working papers crossed with a block explorer.** From Form 8949: hairline-ruled
boxes, numbered lines, stamp-like marks (EXHIBIT A, CONFIRMED), tabular figures. From Etherscan:
mono tx-hashes, green check ticks, block heights. Translate the language — paper, rules, stamps,
mono numerals — never mimic an actual government form.

## Section spine (product launch, expressed as exhibits)
Hero (Concept A headline + price-resolve exhibit) → E-01 Same trade, two prices ($62) →
E-02 Compounding ($6,200/$31,000/$62,000 + footnotes) → E-03 What other tools miss (edge-case
findings, each stamped HANDLED) → E-04 Traceability (report row → tx hash) → E-05 Coverage
(named honest grid: Coinbase/Kraken/Gemini direct, Binance/KuCoin CSV, Solana + 10 EVM chains,
equities on Pro+) → E-06 Connect. Import. Done. (3 steps w/ minutes) → E-07 Pricing (real 5
tiers, annual) → E-08 closing CTA + colophon.

## Honesty rails (from LANDING_PAGE_MESSAGING.md §7/§9)
No Bitcoin-wallet claims · Binance/KuCoin marketed as CSV import only · DFY/CPA tiers omitted
(gated in product) · "audit-ready / show your work," never "audit-proof" · "catches what other
tools miss," never "handles everything" · keep the $62 illustrative footnote.

## Anti-slop checks honored
1. 5 colors, 2 font families, semantic `:root` tokens emitted before any section.
2. No decorative blobs/gradient surfaces — every shape is a rule, a frame, a stamp, or a figure.
3. All motion final-state-by-default, `prefers-reduced-motion` safe, verify.mjs-visible.
