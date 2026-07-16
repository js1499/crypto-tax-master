# ISSUES — verify + review loop log

## Pass 1 (report clean · my eye pass: 2)
- [x] Agate tables: `.num` cells had `padding-right: 0` mid-table, jamming columns
  ("$6,200Casual traders", "GAINCITATION") → zero-padding only on `:last-child`.
- [x] `padding: X 0 Y` shorthands on `.wrap`-sharing elements (`.section`, `.front`, `.late`,
  `.colophon__in`) zeroed the mobile gutters (same bug class as site 1) → `padding-block`.
  Saved to memory as a durable guardrail.

## Pass 2 (report clean) → multi-agent review (4 finders → 30 findings → adversarial verify → 20 confirmed, 10 refuted)
Visual:
- [x] HIGH Rate-card baselines: in-flow "Most subscribed" flag pushed the Active column down
  33px → flag absolutely positioned, th top-padding reserved in all five columns.
- [x] Featured column was a floating unruled tint crowding PRO → --wash tint + claret side
  rules + breathing padding (print furniture per direction).
- [x] "— Corrected." verdicts wrapped mid-stamp → nowrap.
- [x] Citation exhibit looked like an ordinary table row → `agate-table--xl` (1.5rem figures,
  2px rules).
- [x] Duplicate "CORRECTIONS & CLARIFICATIONS" kicker + box header → kicker now "The DeFi Desk".
- [x] Claret ordinals (press steps, correction numbers) violated the no-claret-numerals rule → ink.
Mobile:
- [x] HIGH 631px canvas at 390px viewport: the equities specimen table's intrinsic width blew
  out the grid (grid items default `min-width: auto`) → `min-width: 0` on all split-grid children.
- [x] Section nav: 9.6px crammed links, and Sign in/Equities/Rate card hidden on mobile →
  scrollable one-row nav, 11px, nothing hidden, real padding.
Honesty:
- [x] HIGH "The desk pulls everything" contradicted the CSV/not-listed grid below → "pulls what
  syncs — and takes the rest by CSV".
- [x] "Submissions in any format" / "absorbs … the edge cases" universals → enumerated ("API
  key, wallet address, or CSV") and "flags what it can't classify instead of guessing".
- [x] "Glide categorizes every transaction type" (falsifiable vs the categorizer's 'other'
  fallback) → "maps them to real categories instead".
- [x] "the IRS fair-market-value method" implied an IRS-branded method (×2) → "at fair market
  value, as the IRS requires".
Robustness/a11y:
- [x] Chart SVG text labels scaled to ~5.4px on mobile → moved into HTML agate labels; viewBox
  cropped.
- [x] Muted-ink alphas failed AA (0.55–0.65 on wash/paper at agate sizes) → raised to 0.72–0.75.
- [x] ~15 agate styles below the direction's own 11px floor → bumped to 0.6875rem (11px).
- [x] Verdict sequencing keyed off any ancestor `.reveal` (outer box pre-fired it) → scoped to
  `.correction.is-in`.
- [x] Heading skip (h2→h4) in colophon → h3; captions (sr-only) on citation + rate card tables;
  `scope="col"` on all header cells.
(10 findings refuted by adversarial verify — logged in the workflow output, not actioned.)

## Pass 3 (after fixes) — report clean, eye pass clean.
## Pass 4 — report clean. Two consecutive clean passes achieved.
