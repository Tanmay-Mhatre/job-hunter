A status shows state with three cues at once: a shape, a color and a word.

## Use
- `rj-status` plus `rj-status--healthy`, `rj-status--dormant` or `rj-status--broken`, containing an `rj-glyph` and an `rj-status__label`.
- Glyph shapes are shared with score badges: `rj-glyph--full` (healthy, strong), `--half` (dormant, fair), `--empty` (weak), `--slash` (broken, dead).
- The label stays `text-primary`; only the glyph carries `success-text`, `warning-text` or `danger-text`.

## Rules
- Never show state by color alone. Green and red have nearly the same lightness, so the shape and word do the work for color-blind readers.
- Five states at most on any one screen.
- Squares, not dots: the live dot is the only round shape in the system.
