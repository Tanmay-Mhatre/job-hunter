# RawJobs site

The marketing page at <https://www.rawjobs.workers.dev>. One static HTML page built from the app's own design files, so the site and the dashboard stay in sync:

- tokens, fonts and logos from `apps/web/src/design`
- components (`rj-*` classes) from `design/components/bundle.css`
- page content in `src/index.html`; static files (share image, 404) in `public/`

```bash
pnpm site:build     # writes apps/site/dist
pnpm site:dev       # build, then serve it locally with wrangler
```

`build.mjs` needs only Node, no install. It reads two optional environment variables:

| Variable | Default | What it does |
| --- | --- | --- |
| `SITE_URL` | `https://www.rawjobs.workers.dev` | Canonical URL, share image URL, sitemap, robots.txt. Set it when a custom domain is connected. |
| `CF_ANALYTICS_TOKEN` | unset | Cloudflare Web Analytics site token. Unset means no analytics script at all. |

## Deploy

`.github/workflows/site.yml` builds on every pull request that touches the site, and deploys on every push to `main`. It deploys the `www` Worker, which is static assets only, so requests don't count against the Workers request quota.

One-time setup, in the repo's **Settings → Secrets and variables → Actions**:

- Secrets: `CLOUDFLARE_API_TOKEN` (a token with **Edit Cloudflare Workers** permission) and `CLOUDFLARE_ACCOUNT_ID`.
- Variables, optional: `SITE_URL` and `CF_ANALYTICS_TOKEN`.

To deploy without pushing, run the workflow from the Actions tab with **Run workflow**.

Jobs shown on the page are made-up examples. The scoring demo mirrors `packages/core/src/score.ts`, so update both together.
