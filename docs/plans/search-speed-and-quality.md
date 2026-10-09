# Faster, better job search for many users (plan v2)

Status: **proposed 2026-10-09, not started**. v1 was reviewed by two independent reviewers (engineering; open source, legal and operations). Both returned "approve with changes", and v2 includes those changes. Claims marked *(verified)* were checked against the code or live endpoints on 2026-10-09.

## Problem
Make company and job search better and faster for the user, with zero running cost. The app will be open-sourced, so the design must work for many users, not just one.

## Where the time and quality go today
- **Speed.**
  - Inside each hiring-system lane, companies are fetched one at a time, with a 1 s gap per host, a 30 s timeout and 3 retries (`http.ts:48-51`).
  - Nothing is cached: there are no ETags.
  - Greenhouse is fetched with `content=true`.
  - Scanning "All companies" takes about 2 h. The time-left estimate is a fixed 1.1 s per company (`scope.ts:433`).
- **Quality.**
  - Titles must contain a role word literally (`score.ts:80`). There are no synonyms, plurals or abbreviations.
  - The resume isn't used for ranking.
  - Company search is a substring match (`CompanyFinder.tsx`).
  - The directory is searchable only for 5 hiring systems.
- **Shared index.**
  - The index already exists *(verified)*: `scripts/catalog/index.ts`, about 17k boards, 6.7 MB gzipped, weekly.
  - Its rows are `[title, location, workplace, ageDays, count]`, with no job id or URL, capped at 300 rows per board. Workday isn't indexed.
  - The Radar deliberately ignores it (`scan.ts:182`).
- **Setup.** Installing Node and pnpm is the real wait for non-developers, longer than any scan.

## Decisions (confirmed with the user on 2026-10-09; these change earlier decisions)
| # | Decision | Changes |
|---|---|---|
| 1 | **The shared index feeds the Radar, on the condition that it never makes the jobs shown less accurate.** The index only *finds* candidate jobs. **Every index job that matches the user's filters is checked live before it is shown**, and anything closed or changed is dropped. So the Radar shows the same verified jobs as a live scan, from more companies, much sooner. Index jobs never count as a successful fetch and never close live-tracked jobs. The user's own companies are always fetched live. | `scheduled-scans.md` decisions 1, 2 and 5 |
| 2 | **One central daily poller for everyone** (public boards only), instead of each user's own GitHub repo polling. The user's profile and resume never leave their machine; filtering is local. | `scheduled-scans.md` decision 6 (phase 2) |
| 3 | **`job-hunter` is made public**, so its Actions are free and unmetered, and the poller runs there. The repo is private today *(verified)*, and private repos get only 2,000 minutes a month. Pre-check on 2026-10-09: no secrets found in history, and commits use the noreply email. Done on branch `config-local-only`: the personal config is no longer tracked. Personal config now lives only in `jobhunter.config.local.yaml` (and `jobhunter.config.yaml`), both gitignored, and the repo ships a generic `jobhunter.config.example.yaml`. Older commits still contain the previous profile; rewrite history before flipping only if that matters. | — |
| 4 | **The shared release holds only first-party ATS data plus CC BY sources.** Remote-board APIs (Remotive, The Muse, Jobicy, RemoteOK) and HN are fetched on the user's machine, with attribution, and never redistributed. | — |
| 5 | **Sharing added boards stays on by default** (`cli/src/index.ts:748`). Only the board URL is sent. Settings and `PRIVACY.md` explain it clearly, and users can turn it off. | — |

## Phase 0: bugs (do first)
1. **Workday and Taleo history is dropped on every scan** *(verified)*.
   - `keyOfJob` (`diff.ts:18`) returns `workday:{slug}|{site}`, but `companyKey` returns `workday:{slug}`, so `mergeHistory` skips them at `diff.ts:48`.
   - Result: jobs never close, history is lost, and every job looks "new" again after an outage.
   - **Fix:** one shared `jobCompanyKey()` used by the connectors (`workday.ts:63`, `taleo.ts:87`) and by `diff.ts`, instead of parsing ids. Run a one-time repair of stored history. Add a contract test (ids ↔ company key) for every connector.
   - The same mismatch breaks the industry lookup in `store.ts:135`.
   - Also: Workday ids embed the title slug. Use the req id (`_R12345`) when present, so a title edit doesn't create a "new" job.
2. **The contributions workflow wipes saved state** *(verified)*.
   - `directory-contributions.yml:97-98` uploads only 3–4 files with `--clobber`, deleting the rebuild's `resolved-bulk.json`, `probe*.json` and wayback files.
   - **Fix:** one shared script that builds the state tarball, used by both workflows.
   - Also guard the rebuild's `if: always()` save, so a failed run can't overwrite good state.

## Phase 1: faster local scans (needed by both the poller and the fallback)
- **ETag caching per board.** Store each board's ETag and send `If-None-Match`; a `304` reuses the stored jobs. *(Verified)* to work on Greenhouse, Lever, Ashby and SmartRecruiters. Add ETags to the catalog state tarball for the poller.
- **Greenhouse `content=false`.** Stripe goes from 891 KB to 34 KB *(verified)*. Fetch `/jobs/{id}` only for new or changed jobs that pass the title and location gates.
- **Parallel companies inside a lane when their hosts differ** (Workday tenants, Recruitee, BambooHR…). `HttpClient.slot()` already keeps shared hosts polite. Lanes are at `run.ts:115-120`.
- **Delay per hiring system** instead of a global 1 s. Start at 250 ms for Greenhouse and Ashby (the catalog already uses 250 ms), and keep 1 s for Lever and SmartRecruiters until measured.
- **429 and failure handling.** Honour `Retry-After`, back off the whole host after a 429, use a 10 s list timeout with 1 retry, and skip a host after repeated failures (circuit breaker).
- **Measured ETA** from live throughput. Do this after the concurrency changes.
- **Measure before tuning further:** run for a week and log the 304 hit rate, 429s and time per ATS.

## Phase 2: open-source basics (before announcing)
- `LICENSE` and `NOTICE`/`ATTRIBUTION` in `job-hunter-directory`, plus a `source` field on each record.
- `PRIVACY.md`. State plainly that:
  - the contribution inbox receives board URLs only;
  - Cloudflare sees IP addresses;
  - the app sends no telemetry.
- Explain board sharing (on by default) in Settings, next to the switch that turns it off.
- Takedown / opt-out: a public `denylist.json`, an issue template and a stated response time.
- Inbox abuse limits: a daily total cap, and dedupe against the directory before accepting a board.
- Governance:
  - a second maintainer in `CODEOWNERS`;
  - fine-grained tokens that expire, with a rotation runbook;
  - a self-hosting guide for forks (`JOBHUNTER_DIRECTORY_URL`, `JOBHUNTER_CONTRIBUTE_URL`).
- The poller's User-Agent includes a contact URL. It already identifies itself.

## Phase 3: shared index v2 (the big time saver)
Extend `scripts/catalog/index.ts`; don't build a new job.
- **Row schema v2:** stable job id (URLs rebuilt from per-ATS templates), title, location, workplace, posted/updated date, and source. Remove the 300-row cap. Add a `schema_version` and `generated_at` to the manifest; clients refuse versions they don't understand.
- **Daily**, in the (now public) `job-hunter` repo, publishing to `job-hunter-directory`, with ETags (most boards answer 304). Run it in its own concurrency group so it doesn't block the 3-hourly contributions run.
- **Publishing:**
  - a weekly full file plus **daily deltas**, sharded by ATS;
  - a **fixed tag** with versioned filenames, and the manifest uploaded last;
  - never `--latest` (the directory uses `releases/latest/download`, `directory.ts:11`);
  - clients download only the shards that changed.
- **Size estimate:** about 15–25 MB gzipped for a full file that includes Workday; daily deltas are much smaller.
- **App changes:**
  - Revive `discover.ts` to find candidate jobs from the index.
  - Live-check every matched index job before it's shown (decision 1). Only verified jobs reach the Radar or alerts.
  - Show "data is N days old" when the index is more than 3 days old.
  - Fallback order: yesterday's index, then the live scan.
- **Monitoring:**
  - The workflow opens an issue when it fails, or when board or job counts move more than 20% day over day.
  - It logs the 304 rate and failures by ATS.
  - A keep-alive commit prevents GitHub's 60-day scheduled-workflow shutdown.
  - It fails loudly when close to the 6 h job limit.
- **Expected result:** "All companies" goes from about 2 h to seconds of download and filtering, plus a short live check of matches. Each user's own companies are always fetched live.

## Phase 4: better matching
- **Title expansion before matching:**
  - plurals and stems;
  - abbreviations (PM, Sr, Eng, Mgr);
  - word order ("Manager, Product");
  - alternate titles from the O*NET database, built offline into `catalog/roles` with exact-version attribution (CC BY 4.0).
- **MiniSearch** (MIT) for fuzzy company search in `CompanyFinder`, and BM25 ranking on title plus the resume's top keywords.
- **GeoNames** (CC BY) place aliases: SF, NYC, Bangalore/Bengaluru, DXB, "Remote - US".
- **Keyword points for jobs with no description** come from the title only, so they aren't scored as 0 on topics.

## Phase 5: more coverage
- **Workday in the index.** Measure the block rate from GitHub runners first, and use a "total unchanged → skip" heuristic, since Workday POSTs have no ETag.
- **Seed the directory** from LastRound's ATS directory (about 10k slugs, CC BY 4.0, with attribution). Verify each slug by matching a known job title.
- **Client-side extra sources, with attribution:** HN Who's Hiring (Algolia), Arbeitnow, Remotive (24 h delay, about 2 requests/min), RemoteOK, Jobicy, The Muse. Check the Jobicy and The Muse terms before adding them.
- **Not used:** Feashliaa's dump (CC BY-NC), JSearch (cost), JobSpy/LinkedIn/Indeed scraping (ToS).

## Phase 6: later
- Resume embeddings (transformers.js all-MiniLM-L6-v2, about 23 MB) as an **optional** reranker.
- Easier install for non-developers: a static web app over the shared index (profile in IndexedDB), or a packaged desktop app.

## Risks
| Risk | Mitigation |
|---|---|
| GitHub's terms for Actions ("not a CDN", "related to the software project") | Low-rate daily job, mostly 304s, publishing the project's own data. The live-scan fallback means nothing breaks if it's stopped, and the same script can run on a Cloudflare cron or a volunteer's machine. |
| One maintainer (tokens, Cloudflare, releases) | Second maintainer, expiring tokens, stale-data warning in the app. |
| Release bandwidth at 10k users | Daily deltas, ETag on the manifest, shards. |
| Workday blocks GitHub IPs | Measure first; Workday stays live-only if blocked. |
| Index jobs are up to ~24 h old | Live check before "new" or an alert; the user's own companies are always live. |

## Order and size
| Phase | Size | Depends on |
|---|---|---|
| 0 Bugs | S | — |
| 1 Faster local scans | M | 0 |
| 2 Open-source basics | S | — (in parallel) |
| 3 Index v2 | L | 1, 2, decisions 1–3 |
| 4 Matching | M | — (in parallel after 0) |
| 5 Coverage | M | 3 |
| 6 Later | L | 3, 4 |
