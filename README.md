# Job Hunter

A free, self-hosted job radar. Describe your profile and target companies in one config file; Job Hunter pulls openings straight from their applicant-tracking-system (ATS) feeds, scores each one against your profile with transparent keyword rules, and shows you the matches.

Good roles often appear on company careers pages (Greenhouse, Lever, Ashby, Workday…) before LinkedIn, or never reach it. Checking 50 careers pages by hand doesn't happen. This does it for you.

> **Status: runs locally.** CLI with Greenhouse, Lever and Ashby connectors, scoring, run history, and a web dashboard. Daily GitHub Actions run and Telegram alerts are next. See [Roadmap](#roadmap).

## Getting started

Requires Node 22+ and [pnpm](https://pnpm.io).

```bash
pnpm install
pnpm dev                # opens http://127.0.0.1:5173
```

The dashboard walks you through setup the first time (about 3 minutes; you can skip it and come back from any page):

1. **Resume**: paste your resume, or, if you keep several versions for different roles, copy the provided prompt into your own Claude or ChatGPT, attach them all, and paste the answer back. You get one master resume plus suggested roles, places and topics. It's saved to `profile/resume.md` (gitignored, never sent anywhere). Optional.
2. **Roles**: pick your job family; its titles appear as chips to select or deselect. Switching family resets titles and exclusions to that family's defaults (with Undo). Add titles from any of the 33 families with search.
3. **Locations**: search any country, city or region in the world. A country is one selection (its short names and main cities included); remove it in one click, or expand it to drop single cities. Choose whether remote roles count, and where.
4. **Topics**: pick topic packs (Crypto, Fintech, AI…) or take the suggestions from your resume.
5. **Review**: read it back in plain words, choose what counts as a strong match, and save.

Then add companies in the **Companies** tab: paste careers page links, each is checked live (✓ working, ✗ wrong link, or "coming soon" for ATSs not supported yet), and **Save & scan**.

Setup writes `jobhunter.config.local.yaml` (gitignored, commented, safe to edit by hand). After that, the Radar shows a checklist of anything still missing, explains a scan with no matches (and what to change), and flags companies whose links broke. Change anything later in **Settings**.

Prefer the terminal? Copy `jobhunter.config.yaml` to `jobhunter.config.local.yaml`, edit it, then `pnpm jobhunter validate` and `pnpm jobhunter run`.

## Dashboard

- **Radar**: new matches since your last visit, then everything else, best score first. Filter by score, company, posting date, workplace, source; search.
- **Job drawer**: score breakdown (why it matched), description, salary, notes, status, copy the JD for CV tailoring.
- **Pipeline**: saved → applied → interviewing → offer → rejected. Drag cards between columns.
- **Companies**: per-company health, run history, broken-link and "zero jobs for 3 runs" flags.
- **Settings**: edit roles, locations, topics, companies and the strong-match threshold; export / import your tracking data.

Statuses and notes live in your browser (export them for backup). **Scan now** in the header scans on your machine. Keyboard: `j`/`k` move, `Enter` open, `s` save, `a` applied, `x` not interested, `/` search, `1`–`4` sections, `?` help.

## Command line

`run` prints every job that passes your title and location gates, best first, with the reason for its score:

```
★  74  Head of Product, Exchange
        Acme · Abu Dhabi; Dubai · hybrid · posted 2026-10-02
        title 30 · loc 20 · kw 14 (crypto, tokenization, exchange) · fresh 10
        https://jobs.lever.co/acme/...
```

Useful flags: `--only <company>` to test one company, `--all` to also see gated-out jobs, `--dry-run` to save nothing, `--json out/run.json` for the raw result.

Each run merges into `data/`: jobs keep their first-seen date, and a job missing from two successful runs of its company is marked closed. A company whose feed fails never closes its jobs.

### Adding companies

Paste careers URLs into `detect` and copy the lines into `companies:`:

```bash
pnpm jobhunter detect https://jobs.lever.co/somecompany https://job-boards.greenhouse.io/other
```

| ATS | Careers URL looks like | Status |
| --- | --- | --- |
| Greenhouse | `job-boards.greenhouse.io/{slug}` | ✅ |
| Lever | `jobs.lever.co/{slug}` (EU: `jobs.eu.lever.co`) | ✅ |
| Ashby | `jobs.ashbyhq.com/{slug}` | ✅ |
| Workday | `{tenant}.wd{N}.myworkdayjobs.com/{site}` | phase 1 |
| SmartRecruiters | `careers.smartrecruiters.com/{slug}` | ✅ |
| Workable | `apply.workable.com/{slug}` | phase 1 |
| Recruitee, Personio, BambooHR, Breezy | | phase 3 |

## Company directory and suggestions

### How a company reaches you

```
your profile ─┬─ roles + places ──► gates: which open jobs fit you
              ├─ industries ──────► industry fit (biggest boost; shown first)
              └─ topics ──────────► extra ranking
                                      │
directory (~21,000 companies, tagged by industry) ──► Suggested for you
                                      │
   Hiring for you now · Worth watching · In your industries, not scannable yet
```

- **Hiring for you now**: open roles that pass your title and location filters, companies in your industries first.
- **Worth watching**: no matching opening today, but in your industry, on your shortlist, hiring your role elsewhere, or with a team where you want to work.
- **In your industries, not scannable yet**: companies whose hiring system we can't read yet (e.g. eToro on Comeet, CMC Markets on Workday). Watch them now; they start working when support arrives.
- **Browse all** pages through the whole directory; **Add by link** checks any careers link and shows what it finds before you add it.

Everything is scored on your computer, from shared public data. Your profile never leaves it.

### How the directory is built (no AI, `scripts/catalog/`)

1. **Merge** public, permissively licensed lists of company job boards (CC BY 4.0, MIT, Apache-2.0), our own Common Crawl query, and the **industry seed list**. Share-alike and non-commercial lists only cross-check, never add companies.
2. **Resolve** the seed list (`seeds/industries.json`, must-have companies per industry, editable): read each company's website the way a person would (homepage → careers link → the board it embeds) to find its hiring system. Polite: one request at a time per site, robots.txt honoured.
3. **Check** every board live with the cheapest call each hiring system offers (live / dormant / dead).
4. **Index** each live company's open job titles and locations (no descriptions).
5. **Tag** companies by industry from three sources: the source lists' own labels, the seed list, and their job titles (e.g. many "Forex" or "MT5" roles means a brokerage).
6. **Publish** to `data/catalog/`, and write **`out/coverage.md`**: per industry, how many must-have companies we can track, and which hiring systems to support next.

Refresh it (about monthly) with:

```bash
pnpm catalog:refresh
```

A company missing? Add it with **Add by link** (remembered locally), or add it to `scripts/catalog/seeds/industries.json` and run the refresh.

Source attribution: see `scripts/curate/sources/NOTICE.md` and the source list in `scripts/catalog/merge.ts`.

## How scoring works

No AI, fully explainable. Every job is scored 0–100:

1. **Gates.** The title must contain a `titles.include` term and no `titles.exclude` term. The location must match `locations.include`, or `locations.remote_ok` without also matching `locations.remote_exclude`. Fail either and the job scores 0 and is hidden by default.
2. **Title, up to 30.** 20 for a title match, +10 if it also has a `seniority_boost` term.
3. **Location, up to 20.** 20 for an included place, 15 for an accepted remote region.
4. **Keywords, up to 40.** Sum of the weights of matched `keywords` in title + description.
5. **Freshness, up to 10.** 10 if posted in the last 3 days, 6 within 7 days, 2 after that.

Terms match whole words, case-insensitively: `ai` matches "AI-native" but not "maintain"; `product manager` matches "Product-Manager".

## Privacy

Your config lists the companies you're targeting. If you run Job Hunter from GitHub, **create your copy as a private repository** (use "Use this template" → Private, not Fork; forks of public repos must stay public).

## Fair use

Job Hunter only reads public job postings that companies publish for their own careers pages. It makes one request per company per run, spaces requests to the same host, identifies itself with a User-Agent, backs off on rate limits, links to the original posting and never touches apply endpoints or candidate data. Keep it that way: don't point it at hundreds of companies or run it more than a couple of times a day.

## Development

```bash
pnpm check        # typecheck + tests
pnpm test:watch
```

```
packages/core   connectors, normalise, score, run, history (shared Job types)
packages/cli    jobhunter run | detect | validate | setup (JSON API used by the dashboard)
apps/web        React + Vite + Tailwind dashboard (static; reads data/). In dev, a local API
                lets it save your config and run scans; the static build has no server.
```

Connector tests use saved feed responses in `packages/core/test/fixtures`, so tests never hit live sites.

## Roadmap

| Phase | Scope |
| --- | --- |
| 0. Core ✅ | Schema, config validation, Greenhouse / Lever / Ashby, scoring, CLI, tests |
| 1. Daily radar | Workday, SmartRecruiters, Workable; `data` branch; daily GitHub Actions run; Telegram digest (new/closed history ✅) |
| 2. Dashboard | ✅ local dashboard (radar, job detail, pipeline, company health). Cloudflare Pages deploy to come |
| 3. Open-source launch | Recruitee, Personio, BambooHR, Breezy; setup guide; contributor docs |
| 4. Later | Company discovery, GitHub status sync, optional AI re-rank (your own key) |

## License

[MIT](LICENSE)
