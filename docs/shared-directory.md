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
                                                   public lists + contributions + seed list
                                                   → check → index → tag → publish → release
```

## Pieces

| Piece | Where | What it does |
|---|---|---|
| Outbox and sharing | `packages/core/src/directory.ts`, CLI `setup check` | Boards found by Add by link (and not in the directory) are queued in `data/catalog/outbox.json` and sent to the inbox. Kept until sent. Off with `directory.share_additions: false`. |
| Directory download | `packages/core/src/directory.ts`, `jobhunter directory update` | Reads `manifest.json`, downloads newer files, checks SHA-256, swaps them in. The dev server runs it weekly in the background (`directory.auto_update`). |
| Contribution inbox | `services/contribute` | Cloudflare Worker. `POST /v1/contributions` (public, rate-limited, shape-checked); `GET /v1/pending` and `POST /v1/ack` for the workflow (token). |
| Contributions workflow | `.github/workflows/directory-contributions.yml` | Every 3 hours: accept, publish incrementally, commit `contributions.json`, acknowledge. |
| Weekly rebuild | `.github/workflows/directory-rebuild.yml` | Full rebuild and a dated release; saves its working state as the `state` release so the next run skips recently checked boards. |
| Public directory repo | `Tanmay-Mhatre/job-hunter-directory` | Releases (the files apps download), `contributions.json`, `coverage.md`, attribution. |

Overrides: `JOBHUNTER_DIRECTORY_URL` (download base) and `JOBHUNTER_CONTRIBUTE_URL` (inbox) point an install at your own copies.

## What is shared, and what isn't

Shared: hiring system, board slug (plus Workday shard/site, EU region), company name.
Never shared: profile, resume, searches, statuses, which jobs you open, IP addresses (the inbox stores none).

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
   - `DATA_REPO_TOKEN`: a fine-grained token with *Contents: read and write* on the directory repo only
6. **Point apps at the inbox**: set `DEFAULT_CONTRIBUTE_URL` in `packages/core/src/directory.ts` to the Worker URL.

## Cost

Free tiers cover it: Cloudflare Workers + KV (well under the daily limits), GitHub Releases for the
files (about 7 MB per release), and GitHub Actions minutes for a private repo (roughly 10 hours a
month: a 1–2 hour weekly rebuild plus short contribution runs).
