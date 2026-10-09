A toast confirms an action that just happened and offers undo.

## Use
- `rj-toast` with `role="status"`, the past-tense verb plus the object ("Saved Head of Product, Exchange", "Scanned 214 companies. 9 new for you."), and an optional quiet Undo button.
- Inverted colors: `toast-bg` fill, `toast-fg` text; the Undo button's focus ring also uses `toast-fg` so it stays visible on the dark fill. Enters from 8px below over `duration-base`; leaves with `data-state="closing"` over `duration-quick`.

## Rules
- Stays 5 seconds, longer while hovered or focused. One at a time.
- Never for errors that need action; those stay inline next to what failed.
