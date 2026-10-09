# Self-hosting and maintenance

This page is for two groups: people running a fork with their own data, and the maintainers of the
central directory. For how the directory works, see [shared-directory.md](shared-directory.md).

## Using a fork

A fork works out of the box: it downloads the central directory and shares boards with the
central inbox, like any other install. You only need the steps below if you want your own data.

### Point the app at your own data

Two environment variables, read by the CLI and the dev server (`packages/core/src/directory.ts`):

| Variable | Default | What it is |
|---|---|---|
| `JOBHUNTER_DIRECTORY_URL` | `https://github.com/Tanmay-Mhatre/job-hunter-directory/releases/latest/download` | Where `manifest.json`, `directory.json.gz` and `index.json.gz` are downloaded from. |
| `JOBHUNTER_CONTRIBUTE_URL` | `https://job-hunter-contribute.tanmay-jobhunter.workers.dev` | The contribution inbox that shared boards are sent to. Set it to an empty string to send nothing. |

For example:

```bash
JOBHUNTER_DIRECTORY_URL=https://github.com/you/your-directory/releases/latest/download \
JOBHUNTER_CONTRIBUTE_URL=https://your-inbox.you.workers.dev \
pnpm dev
```

To make it permanent for everyone using your fork, change `DEFAULT_DIRECTORY_URL` and
`DEFAULT_CONTRIBUTE_URL` in `packages/core/src/directory.ts` instead.

### Run your own directory

1. Create a public repo for the data and copy in `services/directory-repo-template/`. Keep
   `LICENSE-DATA` and `NOTICE.md`: the sources' licences require the credits.
2. Deploy your own inbox from `services/contribute` (step 4 of
   [One-time setup](shared-directory.md#one-time-setup)). Use your own KV namespace id in
   `wrangler.toml`.
3. In your fork, set the repository variable `DATA_REPO` to your data repo, and the secrets
   `INBOX_URL`, `INBOX_TOKEN` and `DATA_REPO_TOKEN` (see [Tokens](#tokens)).
4. Enable Actions in your fork. GitHub turns them off in new forks until you do.

### Rules for forks

- **Never run the contributions workflow against the central inbox.** Only the central directory's
  workflow may read and acknowledge it. Acknowledging removes boards, so a second poller would
  quietly take other users' contributions away from the central directory. The central inbox
  token is never shared.
- Keep the third-party job APIs (Remotive, The Muse, Jobicy, RemoteOK, Hacker News) out of any data
  you publish. They are fetched on each user's own computer only.
- Honour `denylist.json`: companies removed on request in the central directory should stay out of
  yours too.
- Keep a contact URL in the User-Agent of anything that polls job boards on a schedule.

## Maintainers and tokens

The project has one maintainer today. A second maintainer should have:
- admin on `job-hunter` and `job-hunter-directory`;
- access to the Cloudflare account that runs the inbox;
- a line in `.github/CODEOWNERS`.

### Tokens

| Secret | Where it lives | What it can do |
|---|---|---|
| `DATA_REPO_TOKEN` | GitHub secret in `job-hunter` | Push to `job-hunter-directory` and publish its releases. |
| `INBOX_TOKEN` | Cloudflare Worker secret **and** GitHub secret in `job-hunter` (same value) | Read and acknowledge waiting contributions. |
| `INBOX_URL` | GitHub secret in `job-hunter` | Not secret, kept with the token for convenience. |

Rotate both every 90 days, when a maintainer leaves, and right away if one may have leaked.

### Rotate `DATA_REPO_TOKEN`

Use a **fine-grained** personal access token, never a classic one.

1. GitHub → Settings → Developer settings → Fine-grained tokens → Generate new token.
   - Resource owner: the account that owns `job-hunter-directory`.
   - Expiration: 90 days.
   - Repository access: **only** `job-hunter-directory`.
   - Permissions: *Contents: Read and write* (pushes and releases). Nothing else.
2. In `job-hunter`: `gh secret set DATA_REPO_TOKEN` and paste the new token.
3. Run **Directory · contributions** by hand (Actions → Run workflow) and check it passes. If the
   inbox is empty it stops early, so also check the next **Directory · weekly rebuild**, or run it by hand.
4. Delete the old token on the same GitHub page.
5. Put the new expiry date in your calendar, a week early. GitHub also emails before a token
   expires. Once it has expired, the weekly rebuild and contribution runs fail.

### Rotate `INBOX_TOKEN`

This is a random string shared by the Worker and the workflow, not a GitHub token.

1. Make a new one: `openssl rand -hex 32`.
2. Right after a contributions run (they start at 17 minutes past every third hour, UTC), set it
   in both places:
   - `cd services/contribute && npx wrangler secret put INBOX_TOKEN`
   - `gh secret set INBOX_TOKEN` in `job-hunter`
3. Run **Directory · contributions** by hand and check the "Check the inbox" step passes.

Until both are updated, the workflow fails with 401 and contributions wait in the inbox (up to 30
days), so nothing is lost.

### If a token leaks

1. Revoke it first (delete the GitHub token, or put a new `INBOX_TOKEN` on the Worker), then
   rotate as above.
2. `DATA_REPO_TOKEN`: check recent commits and releases in `job-hunter-directory` for anything
   you didn't publish, and revert it.
3. `INBOX_TOKEN`: someone could have read or acknowledged waiting boards. Boards are not personal
   data, so the worst case is lost contributions; users' apps don't resend them.
