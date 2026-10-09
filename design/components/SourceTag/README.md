The source tag names the hiring system a job was read from and how old the posting is. It is provenance, the heart of "straight from the source".

## Use
- `rj-source` containing the hiring system name, then `rj-source__age` (e.g. `2d`). Prepend `rj-dot` for jobs first seen in the latest scan.
- The name is set in the `source` style: Geist Mono 12px, uppercase, 0.04em tracking, `text-secondary`. The age is Geist with tabular figures.

## Rules
- Plain text, no pill or border: it is metadata, not a control.
- Never use the hiring systems' logos. The name in mono is the brand.
- The new-this-scan dot (`live-dot`, an alias of `accent-mark`) is the only round shape in RawJobs, appears at most once per row, and always has an accessible name ("New this scan").
