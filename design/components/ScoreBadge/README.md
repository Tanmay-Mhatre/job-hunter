A score badge shows a job's 0 to 100 match, its band and whether the full posting was fetched.

## Use
- `rj-score` plus a band: `rj-score--strong`, `rj-score--fair` or `rj-score--weak`. Add `rj-score--estimated` for directory jobs not fetched yet, and `rj-score--lg` in the drawer.
- Inside: an `rj-glyph` (`--full` strong, `--half` fair, `--empty` weak), then the number. Estimated scores start with `~`.
- Give it `role="img"` and an `aria-label` that says it in words: "Strong match, score 74, estimated".

## Bands
| Band | When | Look |
|---|---|---|
| Strong | score at or above the user's threshold (default 65) | `score-strong-bg` fill, `score-strong-fg` digits, full square |
| Fair | 40 to threshold | `score-fair-bg` fill, `score-fair-fg` digits (always dark), half square |
| Weak | under 40 | `score-weak-border` outline, `score-weak-fg` digits, empty square |
| Estimated | no description yet | dashed outline in the band's text color, no fill, `~` prefix |

## Rules
- Digits use tabular figures so a column of scores lines up.
- A badge is always one click or `Enter` away from its Score breakdown.
