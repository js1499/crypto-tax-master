# ISSUES — verify loop log

## Pass 1 (report: clean · eye pass found 3)
- [x] **Hero loses horizontal padding** — `.hero { padding: … 0 … }` shorthand overrode `.shell`'s
  `padding-inline` (same element, later rule). Text hit the viewport edge on mobile. → switched to
  `padding-block`.
- [x] Hourly "candle" read as a washed slab, not a candle → centered single 44%-wide candle with wicks.
- [x] $31,000 compounding figure was emerald — an error magnitude wearing the "correct" color →
  mid + last figures now rust (escalation), mid card keeps emerald border/badge as "you are here".

## Pass 2 (after fixes) — re-verify
- report clean, eye pass clean (desktop + mobile).

## Pass 3 — confirmation
- report clean. Two consecutive clean passes achieved.
