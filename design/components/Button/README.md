A button starts an action and its label says exactly what happens.

## Use
- Classes: `rj-btn` plus one of `rj-btn--primary`, `rj-btn--quiet`, `rj-btn--danger` (none = secondary). Add `rj-btn--sm` for row-level actions and `rj-btn--icon` for icon-only buttons.
- The consumer provides a verb-first label in sentence case ("Scan now", "Check this company", "Remove company"), an optional 16px Lucide icon before it, and an optional `rj-kbd` shortcut after it.
- Icon-only buttons need `aria-label` and a `title` that names the shortcut, e.g. `title="Save (S)"`.

## Rules
- One primary button per screen. Primary uses `button-primary-bg` with `button-primary-fg` (dark ink, never white).
- Destructive actions are outlined in `button-danger-fg` with no fill, and always open a confirmation that names the thing being removed.
- Never "OK", "Submit", "Proceed" or "Click here".
- Height `control-md` (36px), `control-sm` (28px) for row actions, `control-lg` (44px) minimum on touch screens.
- Press feedback is `scale(0.98)` over `duration-instant`; no bounce, no shadow.
