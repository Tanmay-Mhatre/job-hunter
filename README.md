# Job Hunter

A free, self-hosted job radar. Describe what you're looking for in one config file; Job Hunter finds matching openings across ~21,000 companies' applicant-tracking-system (ATS) feeds, scores each one against your profile with transparent keyword rules, and shows you the matches, with the companies you'd most like to join always on top.

Good roles often appear on company careers pages (Greenhouse, Lever, Ashby, Workday…) before LinkedIn, or never reach it. Checking 50 careers pages by hand doesn't happen. This does it for you.

> **Status: runs locally.** CLI with connectors for 19 hiring systems (Greenhouse, Lever, Ashby, Workday, SmartRecruiters and 14 more), scoring, run history, and a web dashboard. Daily GitHub Actions run and Telegram alerts are next. See [Roadmap](#roadmap).

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

Saving runs your first scan: no company list needed. It finds every job in the company directory that fits your roles and places, checks the best companies live and scores each job. Then, optionally, pick the companies you'd love to work at in the **Companies** tab (search the directory, or paste a careers link): they're checked every scan and their jobs always come first.

Setup writes `jobhunter.config.local.yaml` (gitignored, commented, safe to edit by hand). After that, the Radar shows a checklist of anything still missing, explains a scan with no matches (and what to change), and flags companies whose links broke. Change anything later in **Settings**.

Prefer the terminal? Copy `jobhunter.config.yaml` to `jobhunter.config.local.yaml`, edit it, then `pnpm jobhunter validate` and `pnpm jobhunter run`.

## Dashboard

- **Radar**: every job for you, best score first, with **your companies' jobs always on top** (★). Views: All, My companies, New, Strong matches, Saved, Applied. Filter by score, company, industry, posting date, workplace, source; search. Jobs from the directory that haven't been checked live yet show an estimated score (`~56`) and link to the careers page; **Check this company now** fetches it in a second or two.
- **Job drawer**: score breakdown (why it matched), description, salary, notes, status, copy the JD for CV tailoring.
- **Pipeline**: saved → applied → interviewing → offer → rejected. Drag cards between columns.
- **Companies**: your companies with what each has for you now, scan health and broken links; companies with nothing for you in 10+ scans over a week are flagged for removal. Add more by searching the directory (companies hiring for you first) or by link. Hidden companies, with Show again.
- **Settings**: edit roles, locations, topics, the strong-match threshold and how many other companies each scan checks live; export / import your tracking data.

Statuses and notes live in your browser (export them for backup). **Scan now** in the header scans on your machine. Keyboard: `j`/`k` move, `Enter` open, `s` save, `a` applied, `x` not interested, `/` search, `1`–`4` sections, `?` help.

## Command line

`run` prints every job that passes your title and location gates, best first, with the reason for its score:

```
★  74  Head of Product, Exchange
        Acme · Abu Dhabi; Dubai · hybrid · posted 2026-10-02
        title 30 · loc 20 · kw 14 (crypto, tokenization, exchange) · fresh 10
        https://jobs.lever.co/acme/...
```

Useful flags: `--only <company>` to test one of your companies, `--check <ats:slug>` to check one directory company, `--all` to also see gated-out jobs, `--dry-run` to save nothing, `--json out/run.json` for the raw result.

Each run merges into `data/`: jobs keep their first-seen date, and a job missing from two successful runs of its company is marked closed. A company whose feed fails never closes its jobs.

### Adding companies

Paste careers URLs into `detect` and copy the lines into `companies:`:

```bash
pnpm jobhunter detect https://jobs.lever.co/somecompany https://job-boards.greenhouse.io/other
```

| ATS | Careers URL looks like | Read from |
| --- | --- | --- |
| Greenhouse | `job-boards.greenhouse.io/{slug}` | public API |
| Lever | `jobs.lever.co/{slug}` (EU: `jobs.eu.lever.co`) | public API |
| Ashby | `jobs.ashbyhq.com/{slug}` | public API |
| SmartRecruiters | `careers.smartrecruiters.com/{slug}` | public API |
| Workday | `{tenant}.wd{N}.myworkdayjobs.com/{site}` | careers-site API (20 per page, capped at 2,000 jobs) |
| Workable | `apply.workable.com/{slug}` | widget feed |
| Recruitee | `{slug}.recruitee.com` | careers-site API |
| Personio | `{slug}.jobs.personio.com` (or `.de`) | XML feed |
| BambooHR | `{slug}.bamboohr.com/careers` | careers-page JSON |
| Breezy HR | `{slug}.breezy.hr` | careers-page JSON |
| Teamtailor | `{slug}.teamtailor.com/jobs` | RSS feed |
| Pinpoint | `{slug}.pinpointhq.com` | careers-site JSON |
| Rippling | `ats.rippling.com/{slug}/jobs` | board API |
| HiBob | `{slug}.careers.hibob.com` | careers-page API |
| Freshteam | `{slug}.freshteam.com/jobs` | widget feed |
| Comeet | `www.comeet.com/jobs/{company}/{uid}` | data embedded in the hosted page |
| Oracle Recruiting | `{pod}.fa.{dc}.oraclecloud.com/hcmUI/CandidateExperience/en/sites/{site}` | candidate-experience API |
| SAP SuccessFactors | `career{N}.successfactors.com/career?company={id}` (or `.eu`) | XML listing feed |
| Taleo | `{host}.taleo.net/careersection/{section}/jobsearch.ftl` | career-section search API |
| iCIMS | `careers-{slug}.icims.com/jobs` | portal search pages |
| Jobvite | `jobs.jobvite.com/{slug}` | careers search pages |
| JazzHR | `{slug}.applytojob.com/apply` | careers page |
| Zoho Recruit | `{slug}.zohorecruit.com/jobs/{page}` | data embedded in the careers page |

iCIMS, Jobvite and JazzHR have no keyless feed, so their connectors read the public careers pages. If a company changes its page template, that connector may need an update.

## How jobs reach you

```
directory index (weekly: every open job's title, place and age at ~14,000 companies)
        │  your roles + places (on your computer, no requests)
        ▼
eligible jobs ──► best 30 companies you haven't added ──► checked live ─┐
        │                                                               │
        └──► the rest: "estimated" (no description yet)                 │
                                                                        ▼
your companies ───────────────► checked live every scan ──────► full score, apply link
```

- **Your companies** (config `companies:`): checked every scan, their jobs listed first on the Radar. Optional.
- **Checked companies**: each scan also checks up to `discovery.check_per_scan` (default 30) companies you haven't added, best matches first, each at most once a week. Only their matching jobs are kept, for 30 days after each check. Set it to `0` to contact only your companies.
- **Estimated jobs** (`data/discover.json`): the rest of the directory's jobs for you. Scored on title, place and date only (no topic points without a description), linked to the careers page, never "new", and hidden after 30 days unless you ask.
- **Hidden companies** (config `companies_muted:`, or Hide on a job): never shown, never checked.
- Industries never filter on their own: a company's industries come from public lists and the seed list (`tags`); industries its job titles merely hire for (`title_tags`, e.g. "hires AI roles") are kept apart.

Everything is matched and scored on your computer, from shared public data. Your profile never leaves it. `pnpm jobhunter companies suggest` still ranks whole companies for you in the terminal.

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
4. **Keywords, up to 40.** The share of your keyword weight found in title + description: 40 × matched weight ÷ min(total weight, 12). Matching about three core topics fills the bar, so a short keyword list isn't penalised.
5. **Freshness, up to 10.** 10 if posted in the last 3 days, 6 within 7 days, 2 after that.

With no `keywords` at all, title + location + freshness (out of 60) are scaled to 0–100, so a strong match means the right title, in one of your places, posted recently.

Sandbox, training and test boards (e.g. "Lever Implementation Training Environment") are left out of the directory, never suggested, and skipped when scanning your industries or all companies. Suggestions also ignore postings older than about six months.

Terms match whole words, case-insensitively: `ai` matches "AI-native" but not "maintain"; `product manager` matches "Product-Manager".

## Privacy

Your config lists the companies you're targeting. If you run Job Hunter from GitHub, **create your copy as a private repository** (use "Use this template" → Private, not Fork; forks of public repos must stay public).

## Fair use

Job Hunter only reads public job postings that companies publish for their own careers pages. It makes one request per company per run (your companies, plus up to 30 others it checks for you, each at most once a week), spaces requests to the same host, identifies itself with a User-Agent, backs off on rate limits, links to the original posting and never touches apply endpoints or candidate data. Keep it that way: keep your own list to the companies you really want (the Companies tab flags ones that never have anything for you), and don't run it more than a couple of times a day.

## Development

```bash
pnpm check        # typecheck + tests
pnpm test:watch
pnpm hooks:install  # once per clone: no direct pushes to main, and pnpm check before every push
```

Changes go through pull requests. Label a PR `automerge` and the Automerge workflow merges it once CI's `check` passes on its latest commit (a free stand-in for branch protection, which private repos on GitHub Free don't get). It never merges a red or running PR, but doesn't stop a manual merge.

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
| 1. Daily radar | Workday, SmartRecruiters, Workable ✅; `data` branch; daily GitHub Actions run; Telegram digest (new/closed history ✅) |
| 2. Dashboard | ✅ local dashboard (radar, job detail, pipeline, company health). Cloudflare Pages deploy to come |
| 3. Open-source launch | Recruitee, Personio, BambooHR, Breezy and 11 more hiring systems ✅; setup guide; contributor docs |
| 4. Later | Company discovery, GitHub status sync, optional AI re-rank (your own key) |

## License

[MIT](LICENSE)
