# Shared company directory

The company list (and job index) behind the Radar's jobs and the Companies tab search lives online, is rebuilt weekly,
and grows with every company a user adds by link. Every install downloads it; nothing about the
user is ever uploaded.

```
 Each install                                   Online
 ────────────                                   ──────
 Add by link ── live check ── outbox ──POST──►  Contribution inbox (Cloudflare Worker)
                                                   │ keeps boards only (no user data), 30 days max
                                                   ▼ every 3 h
                                                Contributions workflow (GitHub Actions, private repo)
                                                   pulls the inbox, live-checks each board again,
                                                   appends good ones to contributions.json,
                                                   publishes an updated directory, acknowledges
                                                   ▼
 data/catalog ◄── download (weekly, checksum) ── Public directory repo: job-hunter-directory
   directory.json, index.json, manifest.json       releases/latest: manifest.json,
                                                   directory.json.gz, index.json.gz
                                                   ▲ every Monday
                                                Weekly rebuild workflow
                                                   public lists + our crawls (Common Crawl, Wayback)
                                                   + contributions + seeds (industry list, Wikidata)
                                                   + boards found by trying known companies elsewhere
                                                   → check → index → tag → publish → release
```

## Pieces

| Piece | Where | What it does |
|---|---|---|
| Outbox and sharing | `packages/core/src/directory.ts`, CLI `setup check` | Boards found by Add by link (and not in the directory) are queued in `data/catalog/outbox.json` and sent to the inbox. Kept until sent. Off with `directory.share_additions: false`. |
| Directory download | `packages/core/src/directory.ts`, `jobhunter directory update` | Reads `manifest.json`, downloads newer files, checks SHA-256, swaps them in. The dev server runs it weekly in the background (`directory.auto_update`). |
| Contribution inbox | `services/contribute` | Cloudflare Worker. `POST /v1/contributions` (public, rate-limited, shape-checked, capped at `DAILY_CAP` boards a day for everyone, repeats within 7 days skipped); `GET /v1/pending` and `POST /v1/ack` for the workflow (token). |
| Contributions workflow | `.github/workflows/directory-contributions.yml` | Every 3 hours: accept, publish incrementally, commit `contributions.json`, acknowledge. |
| Weekly rebuild | `.github/workflows/directory-rebuild.yml` | Full rebuild and a dated release; saves its working state as the `state` release so the next run skips recently checked boards. |
| Finding more companies | `scripts/catalog/` | See [Coverage](#coverage) below. |
| Public directory repo | `Tanmay-Mhatre/job-hunter-directory` | Releases (the files apps download), `contributions.json`, `coverage.md`, attribution. |

Overrides: `JOBHUNTER_DIRECTORY_URL` (download base) and `JOBHUNTER_CONTRIBUTE_URL` (inbox) point an install at your own copies. See [self-hosting.md](self-hosting.md).

## Coverage

The goal is to hold at least 90% of the companies on each hiring system the directory tracks
(Greenhouse, Lever, Ashby; at least 80% for SmartRecruiters and Workday). The weekly rebuild grows the list from five directions:

| Step | Script | What it adds | Per run |
|---|---|---|---|
| Common Crawl URL index | `commoncrawl.ts --per-run 3` | Board URLs in the last ~24 crawls, including the boards' API URLs. Incremental: only crawls not read yet. | ≤ 3 crawls |
| Wayback Machine URL index | `wayback.ts --max-minutes 60` | Board URLs the Internet Archive kept (snapshots from the last 3 years). Resumable; a full pass takes a few weeks, then starts again after 30 days. | 60 min |
| Wikidata companies | `seeds-bulk.ts`, `resolve.ts --bulk --limit 1500` | About 18k companies (50+ staff or listed, CC0), resolved from their own websites. Results are reused for 90 days. | 1,500 companies |
| Try known companies elsewhere | `crossprobe.ts --max-minutes 45` | Dead or empty boards (the company usually moved systems), companies whose site had no readable board, and Workday tenants whose site is dead. A board counts only if it is live and its own name matches the company. Attempts are kept for 90 days. | 45 min |
| Add by link | contributions | Boards users add (see above). | – |

`coverage.md` (in the directory repo) opens with the **Universe** table:
- **Sample coverage** is the figure the target is measured on: the share of Wikidata companies' live boards that our URL sources already had.
- **Estimate** is a lower bound from how often the URL sources agree (Chao2).
- A **hold-one-out** table shows how many live boards only one source lists.

Restricted lists (share-alike or no licence) are only counted, never published. yc-oss/api was left out because it has no licence.

## What is shared, and what isn't

Shared (on by default, off with `directory.share_additions: false` or Settings → Sharing): hiring
system, board slug (plus Workday shard/site, EU region), company name, and the app name
(`job-hunter`, optionally `/version`; any other value is dropped).
Never shared: profile, resume, searches, statuses, which jobs you open. The inbox uses the IP
address only for rate limiting and stores none. Full details for users: [PRIVACY.md](../PRIVACY.md).

The published data is CC BY 4.0 (`LICENSE-DATA` in the directory repo); sources and credits are
in its `NOTICE.md`. Third-party job APIs (Remotive, The Muse, Jobicy, RemoteOK, Hacker News) are
never published.

## Denylist

Companies removed on request (takedowns, see `NOTICE.md` in the directory repo; we reply within 7
days) are listed in `denylist.json` at the root of the directory repo:

```json
{
  "companies": [
    { "key": "lever:acme", "reason": "Asked by the company (issue #123)", "added": "2026-10-09" },
    { "domain": "example.com", "reason": "Not a real employer", "added": "2026-10-09" },
    { "name": "Example Holdings", "reason": "Asked by the company", "added": "2026-10-09" }
  ]
}
```

Each entry has `reason` and `added` (`YYYY-MM-DD`) and at least one of:
- `key`: a directory key, `{ats}:{slug}` as in `directory.json` (case-insensitive);
- `domain`: matches a company whose careers page, or the website it was resolved from, is on this
  domain or a subdomain of it;
- `name`: matches the company name exactly, ignoring case and extra spaces.

How it's applied (`scripts/catalog/lib/denylist.ts`, read from `DENYLIST_FILE`):
- `build.ts` leaves matching companies out of `directory.json`, so they're also left out of the
  index and the release built from it;
- `jobs.ts` leaves them out of the job feed;
- `contributions.ts` rejects matching boards, so a user can't add one back by link;
- every workflow reads `denylist.json` from the directory repo; a missing file means nothing is
  removed, and an unreadable one fails the run (never publish without it);
- apps need no change: a removed company disappears with the next download.

## Job feed

Every day, `Jobs · daily feed` (`.github/workflows/jobs-daily.yml`, script `scripts/catalog/jobs.ts`)
reads every live directory board on Greenhouse, Lever, Ashby, SmartRecruiters and Workday once, for
everyone, and publishes slim rows (job id, title, location, workplace, posted date; no descriptions)
as one gzipped shard per hiring system on the `jobs` release of the directory repo.
`jobs-manifest.json` lists the shards with their SHA-256 and `schema` version; it's uploaded last.

- **Cheap to run:** Greenhouse, Lever and Ashby boards that haven't changed answer an empty 304
  (ETags are kept in the feed's own saved state, the `jobs-state.tar.gz` asset of the `state` release).
  A board that fails, or that the 5-hour limit leaves out, keeps yesterday's rows and date.
- **How apps use it** (`packages/core/src/job-feed.ts`): every scan downloads the shards that changed,
  then fetches live only the directory companies whose jobs could pass the user's filters, plus any
  the feed doesn't cover or that are more than 3 days old. Every job shown is still checked live;
  the feed only decides which companies are worth a request. `jobhunter scan --full` skips the feed.
- **Watching it:** the workflow opens an issue when a run fails, or when jobs or companies move more
  than 20% from the day before. It also re-enables itself each run, so GitHub doesn't switch the
  schedule off after 60 quiet days.
- **Format changes:** bump `JOB_FEED_SCHEMA`; older apps ignore a feed they don't understand and
  scan live.

## One-time setup

1. **GitHub permission for workflow files** (once): `gh auth refresh -s workflow`
2. **Public directory repo**: `gh repo create Tanmay-Mhatre/job-hunter-directory --public`, then add the files from `services/directory-repo-template/`.
3. **Seed it** from an existing local build so the first weekly run is quick:
   `pnpm catalog:release --out dist`, then `gh release create directory-YYYY-MM-DD dist/* --latest -R <repo>`;
   and upload `catalog-state.tar.gz` (out/checks.jsonl, out/index-all.jsonl, out/resolved.json) to a prerelease tagged `state`.
4. **Inbox** (Cloudflare account needed): in `services/contribute`
   `npm install`, `npx wrangler login`, `npx wrangler kv namespace create INBOX` (put the id in `wrangler.toml`),
   `npx wrangler secret put INBOX_TOKEN` (a long random string), `npx wrangler deploy`.
5. **Secrets in the private code repo** (`gh secret set NAME`):
   - `INBOX_URL`: the Worker URL from step 4
   - `INBOX_TOKEN`: the same string as step 4
   - `DATA_REPO_TOKEN`: a fine-grained token with *Contents: read and write* on the directory repo only, expiring in 90 days
     (rotation steps: [self-hosting.md](self-hosting.md#tokens))
6. **Point apps at the inbox**: set `DEFAULT_CONTRIBUTE_URL` in `packages/core/src/directory.ts` to the Worker URL.

## Cost

Free tiers cover it: Cloudflare Workers + KV (well under the daily limits), GitHub Releases for the
files (about 7 MB per directory release, roughly 10–20 MB for the job feed), and GitHub Actions, which
is free and unmetered once the code repo is public. While it's private, the 2,000 free minutes a month
cover the directory runs (about 20 hours) but not the daily job feed as well.
