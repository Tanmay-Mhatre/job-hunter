# Implementing the RawJobs design system

This folder is the source of truth for how RawJobs looks and behaves. Read `README.md` (the brand book) first, then this file.

> **In this repo** the kit is split in two. What the app ships lives in `apps/web/src/design/`: `tokens.json` (the source of truth), the generated `tokens.css` and `utilities.css`, `fonts/` and `logos/`. The references stay here in `/design`: this file, `README.md`, `components/` (previews, usage notes, `bundle.css`) and `screenshots/`. `pnpm design:build` regenerates the CSS from `tokens.json`; `pnpm check` fails if it is out of date.

## What is here

| Path | What |
|---|---|
| `README.md` | Brand book: principles, voice, color, elevation, type, motion, interaction, logo. |
| `tokens.json` | Every token, 3 tiers (primitive, semantic, component), 4 themes. Source of truth. |
| `tokens.css` | `tokens.json` compiled to CSS custom properties, plus `@font-face`. Regenerate, never hand-edit. |
| `components/bundle.css` | Reference CSS for every component (`rj-` classes). |
| `components/<Name>/README.md` | Usage rules per component. |
| `components/<Name>/preview.html` | Reference markup per component (structure, ARIA, states). |
| `fonts/` | Geist and Geist Mono woff2 files (SIL OFL, see `OFL.txt`). |
| `logos/` | Outlined wordmark (ink, paper) and app mark SVGs. |
| `screenshots/` | How every component should look: `<theme>-<Name>.png` at 960px, `-390` at phone width. |

## Rules that are not negotiable

1. **Tokens only.** No hex, rgb or hsl literals in app code. Components use component tokens (`button-primary-bg`, `feed-row-hover`...), layouts use semantic tokens (`bg-canvas`, `text-secondary`...). Never reference primitives (`sand-*`, `orange-*`, `green-*`, `amber-*`, `red-*`) outside tokens.
2. **Four themes.** Set `data-theme` on `<html>` from `prefers-color-scheme` and `prefers-contrast` (snippet in README.md), with a user override in Settings (System, Light, Dark; "Increase contrast" toggle). Persist the override in localStorage.
3. **Never color alone.** Score bands and company health always show glyph + color + word/number.
4. **Type:** Geist 400/500/600 only, nothing under 12px, tabular figures for numbers, Geist Mono only for machine data (ATS names, slugs, CLI).
5. **Motion:** 100/150/200/300ms only, `transform`/`opacity` for movement, every animation respects `prefers-reduced-motion`.
6. **Keyboard:** visible `:focus-visible` ring everywhere, overlays trap and restore focus, shortcuts as listed in README.md.
7. **Copy:** follow the Voice section and the "One word per meaning" table. Verb-first buttons, sentence case, no em dashes, no emoji.

## Plan (one PR per phase, `pnpm check` green before each)

### Phase 1: Foundation
- Copy this folder to `apps/web/src/design/` (keep `tokens.json` as the source of truth).
- Add a script `pnpm design:build` that compiles `tokens.json` to `tokens.css` (same output as the included file) and fails if a type style name collides with a `text-*` color token or any token name is duplicated. Add it to `pnpm check`.
- Import `tokens.css` and the fonts globally. Remove any Google Fonts link if present.
- Map Tailwind to **semantic tokens only** in `tailwind.config` (colors: canvas, raised, overlay, hover, active, ink, muted, line, hairline, control, accent, accent-text, success/warning/danger text and solid; spacing to `space-*`; radius to `radius-*`; fontSize to the type styles; transitionDuration and timing to motion tokens). Remove Tailwind's default palette so stray `bg-blue-500` style classes fail the build.
- Theme switcher: system detection + Settings override, applied before first paint (inline script in `index.html`) so there is no flash.

### Phase 2: Primitives
Build React components that reproduce `components/<Name>/preview.html` exactly (markup, ARIA, classes or Tailwind equivalents): Button, Kbd, StatusGlyph/Status, ScoreBadge, ScoreBreakdown, SourceTag, Chip, Tabs, Field/SearchField, Toast, Menu. Each gets a test for its accessible name/role and states.

### Phase 3: Screens
- **Radar:** Tabs (All, My companies, New, Strong, Saved, Applied), filter Chips, SearchField with `/`, Feed panel with "My companies" and "Everyone else" sections, rows per `components/Feed`. Density setting (comfortable/compact). Skeleton on first load, per-source progress during "Scan now". EmptyState with real numbers and a concrete suggestion.
- **Job drawer:** per `components/Drawer`: source + close, title, meta, ScoreBreakdown with matched keywords, description, footer actions ("Apply on <ATS>", Save, Copy description). Focus trap, `Esc`, background `inert`, row `aria-current`, full width under 720px.
- **Pipeline:** per `components/Pipeline`: columns Saved, Applied, Interviewing, Offer, Rejected; drag plus `[` / `]` keyboard moves with a live region.
- **Companies and Settings:** reuse the same primitives; company health uses Status (Healthy, Dormant, Broken link).
- Keyboard map: `J`/`K`, `Enter`, `S`, `A`, `X`, `C`, `R`, `/`, `1`-`6`, `?` shortcut sheet, `Esc`.

### Phase 4: Verify
- Visual check every screen in all four themes and at 390px, 768px and 1280px against `screenshots/`. No horizontal page scroll anywhere.
- Run an accessibility pass (axe or similar): zero violations; focus order follows reading order.
- Grep the app for hex/rgb literals, primitive token names, font weights above 600, font sizes under 12px, durations outside 100/150/200/300ms (shimmer excepted). All must be zero.
- Update the root README screenshots and the dashboard section to the new look.

## Definition of done
All four themes work and follow the OS setting; every screen matches the reference screenshots; the lint and grep checks above pass; `pnpm check` is green.
