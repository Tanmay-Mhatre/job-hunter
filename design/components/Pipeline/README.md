The pipeline tracks jobs from saved to offer. Columns: Saved, Applied, Interviewing, Offer, Rejected.

## Use
- `rj-board` lays out the columns (each at least 240px) and scrolls sideways inside itself on small screens. Each `<section class="rj-column">` (L1: `bg-raised`, `border-default`) with an `<h3 class="rj-column__head">` (name, count) and a `<ul class="rj-column__list">` of `<li class="rj-card">` items (L2: `bg-overlay`, `border-default`).
- A card shows the title (`body-strong`), company with its Score badge, and the last event in `meta`.

## Rules
- Each card's title is a real link to the job, described by a hidden instruction: "Press [ or ] to move this job to the previous or next stage."
- Drag with the pointer, or focus a card and press `[` / `]` to move it one column. Announce the move in a polite live region ("Moved to Applied").
- While dragging: `data-dragging="true"`, `shadow-l2`, a 1° tilt. No tilt under reduced motion.
- Columns scroll sideways inside the board on phones; the page never does.
