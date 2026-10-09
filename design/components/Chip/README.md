A chip is a filter you can turn on and off. Chips exist only where they do something.

## Use
- `<button class="rj-chip" aria-pressed="true|false">Label <span class="rj-chip__count">12</span></button>` inside a `role="group"` with an `aria-label`.
- On: inverted (`chip-on-bg` fill, `chip-on-fg` label). Off: `chip-bg` with a `chip-border` frame and `chip-fg` label.

## Rules
- Never use a chip for static metadata (company, location, date). Those are plain text.
- Counts use tabular figures and update without moving the label.
