The feed is the Radar: one job per row, my companies first, then best score first.

## Use
- `<section class="rj-panel rj-feed">` (an L1 surface: `bg-raised`, `border-default` frame) with an `rj-feed__head` summary line, then per group an `<h3 class="rj-feed__section">` and a `<ul class="rj-feed__list">` of `<li class="rj-row">`.
- Each `rj-row` holds a real link, `rj-row__link`, on the title; its click area stretches over the whole row while the row actions stay separate buttons. Inside the row: Score badge, `rj-row__main` (`rj-row__title`, then `rj-row__meta`: company · places · workplace), and `rj-row__side` (row actions, then the Source tag).
- `aria-current="true"` marks the row whose drawer is open; it gets `feed-row-selected` plus a 2px `feed-row-selected-bar` on the left edge, so selection never relies on fill alone. `data-density="compact"` on the feed tightens rows.

## Rules
- Rows are square, separated by `feed-divider` hairlines. The panel keeps its frame; never put rows straight on the canvas.
- Scan path: score, then title, then meta, left to right. Put the most decisive facts first in the meta line and never repeat words between rows.
- The star (`star`) appears only on my companies; the dot only on jobs first seen this scan. Both use `accent-mark`, which stays above 3:1 on hover and selected rows.
- Row actions (Save, Not interested) appear on hover and focus, are always visible on touch screens and phones, and have shortcuts `S` and `X`.
- Keyboard: `J`/`K` move focus between rows, `Enter` opens the drawer.
- On desktop, title and meta truncate with an ellipsis; on phones the title wraps to two lines. The full text is in the drawer.
