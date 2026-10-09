The job drawer shows one job in full without leaving the feed.

## Use
- `rj-scrim` behind `rj-drawer` (`role="dialog"`, `aria-modal="true"`, `aria-labelledby` the title). Inside: `rj-drawer__head` (source and close, title, meta), `rj-drawer__body` (Score breakdown, description in `body` at most `prose-max`), `rj-drawer__foot` (actions).
- L3 surface: `drawer-bg`, `border-default` on the left edge, `shadow-l3`, over `scrim`. Width `drawer-width` (560px); full width under 720px.

## Rules
- Opens with a 24px slide and fade over `duration-base` / `ease-enter`; closes over `duration-quick` / `ease-exit`. Fades only under reduced motion.
- Focus moves to the drawer on open, is trapped inside, and returns to the row on close. `Esc` and the close button both close it.
- The feed behind is `inert` while the drawer is open, and its row stays marked with `aria-current`.
- On phones (under 720px) the drawer is full width, opens over `duration-slow`, and its footer stacks: the primary action full width, the rest in two 44px columns.
- Closing: set `data-state="closing"` on the drawer and scrim, wait for `animationend`, then remove them.
- Primary action is the real next step: "Apply on Lever", which opens the posting on the company's own site.
