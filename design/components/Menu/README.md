A menu lists the actions for one thing, with their shortcuts.

## Use
- `rj-menu` (`role="menu"`) with `rj-menu__item` buttons (`role="menuitem"`), each an icon, a verb-first label and an optional `rj-kbd`. `rj-menu__sep` groups; `rj-menu__item--danger` goes last.
- L2 surface: `bg-overlay`, `border-default`, `shadow-l2`, `radius-md`.

## Rules
- Opens on click, `Enter` or `Space` and focuses the first item. Roving tabindex: the focused item is `0`, the rest `-1`; arrow keys, `Home` and `End` move real focus. `Esc` closes and returns focus to the trigger.
- Closing: set `data-state="closing"` and remove on `animationend`.
- Enters with a 4px fade-slide over `duration-base`; exits over `duration-quick`.
