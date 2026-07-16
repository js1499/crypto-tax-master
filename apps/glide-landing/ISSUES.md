# ISSUES — verify + review loop log

## Pass 1 (report clean · my eye pass: 3)
- [x] Mobile nav CTA overflowed the right edge / "Sign in" wrapped → tightened ≤480px nav.
- [x] "Glide reconciles everything" (banned universal) → "your history".
- [x] Hero key phrase "actually correct" split across lines → nbsp-glued.

## Pass 2 (report clean) → review workflow (CRO + honesty + robustness → 20 findings → 15 confirmed, 5 refuted)
CRO:
- [x] HIGH The funnel's #1 objection — "is it safe to connect?" — was unaddressed anywhere.
  Verifier confirmed against src/lib/exchange-clients.ts that keys are read-only (no
  trade/withdraw endpoints) and wallet sync is public-address-only → security FAQ added first,
  hero microcopy "Read-only access", Step 1 states keys can never trade or move funds.
- [x] Hero proof card showed the two per-SOL prices as tax-summary line items (scannable delta
  $0.62) → replaced with one "Pricing error caught — one 100 SOL trade: $62.00" row.
- [x] Mobile pricing showed $99 Active above the $0 Trial (order:-1 never reset at ≤560px) and
  two orange CTAs split the primary action → order reset; Choose Active demoted to ghost.
- [x] Headline orphaned "— down" on its own line → nowrap-bound "down to the block."
Honesty (verified against product code + repo audit docs):
- [x] HIGH "prices every trade at its exact on-chain block timestamp" — false for exchange/CSV
  trades → scoped to on-chain trades (meta, hero, Step 2).
- [x] HIGH "1099-B reconciliation" — no implementing code exists → removed (feature card + FAQ).
- [x] HIGH RSUs/ESPP (schema-only) and §1256 (partial/manual) → removed; securities claims now
  stocks/ETFs/options/wash-sales only.
- [x] "import everything" / "computes everything" universals → scoped.
- [x] "No $0-basis surprises" absolute (contradicted by documented EVM inbound-transfer gap) →
  "Cost basis that travels" + "your connected wallets"; spam filter softened to "by default".
- [x] NFT support claimed (legs unpriced per audit doc) → removed from hero tick + feature.
- [x] "catches the income other tools miss" (meta) → "snapshot tools commonly miss";
  "compounds across every trade you've ever made" → "can compound across your trades".
- [x] "Every on-chain line verified" → "traces to its tx hash".
Robustness:
- [x] 5-col pricing grid overflowed at 1021–1199px (nowrap buttons set min-content 1032px) →
  minmax(0,1fr) columns + wrapping buttons.
- [x] Primary CTA white-on-#EA580C failed AA (3.56:1) → resting CTA now #C2410C (5.18:1).
- [x] scroll-behavior:smooth not gated on reduced-motion → wrapped in no-preference media query.
(5 refuted findings discarded — logged in the workflow output.)

## Pass 3 (after fixes) — report clean, eye pass clean.
## Pass 4 — report clean. Two consecutive clean passes achieved.

## Pass 5-6 (copy + prod-structure rework) — both clean.
## Trio review (legal + visual B/C → 6 findings → 5 confirmed, 1 refuted)
- [x] Legal: "error" framing quantified method superiority as fact ("Pricing error caught",
  "error at 100 trades/yr") and contradicted the page's own "difference" wording → "difference"
  in all three variants.
- [x] HIGH (all 3 variants): `.nav__links a { color: var(--muted) }` out-specified `.btn--cta`'s
  text color — the sticky-nav CTA rendered near-invisible (1.1:1 on B, 1.48:1 on A, 2.29:1 on C)
  → explicit `.nav__links a.btn--cta` override per theme.
- [x] Hero ghost button vertically misaligned against the CTA+microcopy wrapper →
  `align-items: flex-start`.
- [x] C: compare-card offset shadow was bg-soft-on-white (invisible) → lime.
## Pass 7-8 (all three pages) — clean twice consecutively. Variants regenerated from the fixed
base via build-variant.mjs so copy stays byte-identical.
