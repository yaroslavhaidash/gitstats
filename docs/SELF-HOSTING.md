# Running and self-hosting gitstats

The technical detail behind the [README](../README.md): how the data gets in, every environment variable, the full local setup, self-hosting on Vercel, and the known limits. For the code map and invariants, read [ARCHITECTURE.md](ARCHITECTURE.md).

## How it works

- **Auth.js v5 + GitHub OAuth**, public scope only (`read:user user:email`). Sign-in is identity only: the OAuth access token is never stored.
- **Private and work repos via the CLI.** `npx @yaroslavhaidash/gitstats-cli@latest link` pairs a computer (device-code flow on `/link`), scans it for git repos, counts the member's commits with `git log --no-merges --author=<emails>` on the default branch (weeks bucketed Sunday 00:00 UTC), and POSTs `{repo hash, owner/name, language, weekly totals}` to `/api/ingest`. It installs a daily background sync per OS. Recount semantics: every sync replaces the last year for that repo. Precedence: a repo present in both paths switches to `repos.source = local` and the GitHub snapshot stops writing it. Source: https://github.com/yaroslavhaidash/gitstats-cli
- **Optional read-only token (fallback).** A member can paste a **read-only fine-grained PAT** (`Contents: Read-only`, repos of their choice) on `/dashboard/settings`. It is AES-256-GCM encrypted at rest (`TOKEN_ENCRYPTION_KEY`), only ever used by the snapshot job, and must belong to the signed-in account. Private repo names are shown to the owner only; other members see `private repo` plus the numbers.
- **Nightly snapshot** (`vercel.json` cron, 03:00 UTC) walks every signed-in user with one server-side `GITHUB_TOKEN` and writes rows to Neon Postgres via Drizzle.
- **The dashboard reads only Postgres.** No GitHub calls on page load.
- Repos are keyed by GitHub node ID, so renames and deletions never orphan history.

### Data sources

| Table | Source | Granularity |
|---|---|---|
| `daily_contributions` | GraphQL `contributionsCollection.contributionCalendar` | daily |
| `repos` | GraphQL `commitContributionsByRepository` (public) + REST `GET /user/repos` with the member's own token (private) | per repo |
| `weekly_stats` | REST `GET /repos/{owner}/{repo}/stats/contributors` | weekly, default branch |
| `snapshot_runs` | the job itself | per run |

## Environment variables

| Name | Where | Purpose |
|---|---|---|
| `DATABASE_URL`, `DATABASE_URL_UNPOOLED` | Neon (Vercel Marketplace integration) | app queries / drizzle-kit migrations |
| `AUTH_SECRET` | `openssl rand -base64 32` | Auth.js JWT encryption |
| `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET` | GitHub OAuth App | sign-in. Callback URL: `<APP_URL>/api/auth/callback/github` |
| `GITHUB_TOKEN` | classic PAT, **no scopes** | snapshot job (public data only) |
| `CRON_SECRET` | `openssl rand -hex 32` | bearer token Vercel Cron sends to `/api/cron/snapshot` |
| `NEXT_PUBLIC_APP_URL` | e.g. `https://gitstats.org` | invite links |
| `TOKEN_ENCRYPTION_KEY` | `openssl rand -base64 32` | encrypts member-supplied PATs at rest |
| `SHARE_SECRET` | `openssl rand -base64 32` | signs the share-card URLs at `/s/<token>`. Changing it invalidates every card ever minted |
| `ALERT_WEBHOOK_URL` | optional; a Slack or Discord incoming webhook, or any URL that takes JSON | POSTed `{text, runId, errors, first}` when two snapshot runs in a row have errors. Unset means the alert is only a `console.error` line |
| `ADMIN_GITHUB_IDS` | optional; comma-separated numeric GitHub account ids (`curl https://api.github.com/users/<login>` → `id`) | who may open `/admin`. Ids, not logins, because a renamed login can be registered by someone else. Everyone else gets a 404. Unset means nobody |

`vercel env pull .env.local` fetches the Neon variables; the rest are listed in `.env.example`.

## Run it locally (no production data)

Contributors never get the production database. You run your own, empty, and fill it with the fake demo crew.

1. **A database.** Create a free Neon project (or a branch of an existing one) at neon.tech and copy its connection strings. The app talks to Postgres through Neon's HTTP driver (`@neondatabase/serverless`), so a plain local Postgres does not work without a Neon-compatible HTTP proxy in front of it; a Neon branch is the supported path.
2. **A GitHub OAuth App** at github.com/settings/developers with callback `http://localhost:3000/api/auth/callback/github`.
3. **A classic GitHub token with no scopes** for the snapshot job (public data only).
4. **Env:** `cp .env.example .env.local` and fill every non-optional line (`openssl rand` commands are next to each secret). Set `NEXT_PUBLIC_APP_URL=http://localhost:3000`.

```bash
npm ci
npm run db:migrate                                        # applies drizzle/*.sql to your DATABASE_URL
npx tsx --env-file=.env.local scripts/seed-demo.ts        # the fake demo crew, shown at /demo
npm run dev                                               # http://localhost:3000
```

Sign in with GitHub to get your own row; `npm run snapshot` then fetches your public activity into your database. The demo crew (`users.is_demo`) is kept off the global board and every site-wide count, so `/demo` is the quickest way to see every chart with data in it.

Before a PR: `npx tsc --noEmit && npx eslint . && npx next build` (CI runs the same with dummy env).

## Self-hosting

The same steps, deployed. It is built for Vercel (`vercel.json` holds the nightly cron at 03:00 UTC and the `www` redirect) with Neon from the Vercel Marketplace, which fills `DATABASE_URL*` for you; set the other variables from `.env.example` in the project settings. Things that are specific to gitstats.org and worth changing on a fork:

- `lib/site.ts` `SITE_URL` is the canonical origin used in metadata, the sitemap, badge Markdown and share links.
- `vercel.json` redirects `www.gitstats.org`; change or drop it.
- The CLI (`@yaroslavhaidash/gitstats-cli`) talks to `https://gitstats.org` unless it is given another server; see its README.
- Cron needs `CRON_SECRET`; without it `/api/cron/snapshot` refuses every call.

## Trigger the snapshot by hand

Against the deployed app (same path Vercel Cron uses):

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://gitstats.org/api/cron/snapshot
```

Locally, writing to whatever `DATABASE_URL` is in `.env.local`:

```bash
npm run snapshot
```

Both print a summary: users/repos processed, repos still pending, errors, and the remaining REST + GraphQL quota.

## Schema changes

```bash
npm run db:generate   # writes drizzle/NNNN_*.sql from db/schema.ts
npm run db:migrate
```

## Known limitations

- **Weekly LOC granularity.** GitHub's only lines-of-code endpoint returns weekly buckets (weeks start Sunday UTC). There is no daily LOC and none is faked; windows attribute a week to where it starts.
- **Public repos by default.** The OAuth `repo` scope is never requested. Private work only appears for members who connect a read-only fine-grained PAT, and only for the repos that token covers. Fine-grained PATs never expose private repos through GraphQL, so private discovery uses REST `/user/repos` (repos pushed within the last year). Org repos need a token whose resource owner is the org, which the org must allow.
- **Lines include everything committed.** Lockfiles, generated code and vendored assets count, so a `package-lock.json` bump can add 10k lines. GitHub does not separate them.
- **Default branch only.** Contributor stats cover commits on the default branch. Commits on unmerged branches don't count until merged.
- **202 warm-up.** GitHub returns `202` while computing contributor stats. The job hits every repo once, then retries the pending ones with 2s → 30s backoff (6 attempts). Anything still pending is marked `repos.stats_pending` and picked up next night.
- **Top 100 contributors.** The stats endpoint lists at most 100 contributors per repo.
- **Windows are UTC; week and month are calendar-aligned.** Week = Monday 00:00 UTC of the current week up to today, month = the 1st of the current month up to today, year = the last 365 days (rolling). A custom `?from=&to=` range is taken literally. Comparison deltas measure against the previous calendar week or month, cut at the same point in it, or the previous 365 days. A weekly LOC bucket counts when its Sunday start falls in `[from − 6 days, to]`, because GitHub weeks start on Sunday and ours on Monday.
- **Stars** are summed over every tracked repo the person has committed to, regardless of the window.
- **Cron duration.** One invocation spends at most 240s of its 300s budget, then hands the users it did not reach to a chained call of the same route (up to 20 per night, tied together by a chain id). Users are taken oldest-snapshot-first, so nobody starves; `/api/health` reports the last chain as `{runs, usersDone, usersPending}`.
- **Unchanged repos are not re-read.** `stats/contributors` is skipped for a repo whose GitHub `pushed_at` matches the one the last successful fetch covered, so a quiet night costs almost no REST calls. A per-user snapshot (first sign-in, a newly connected token) always asks, because the cached answer would be missing exactly that user's rows.
- **Quota guard.** When GitHub reports fewer than 300 calls left the run stops issuing requests and records a `quota` error; the chain ends there and resumes the next night.

## Boards

- **Crew boards** (`/dashboard/c/<code>`) show members plus per-user pages with repo names.
- **Global board** (`/dashboard/global`) shows everyone who ever signed in, aggregates only, no repo names.
- Invite: `/join/<code>`.
- Keys: `1`/`2`/`3` switch week/month/year, `g` global, `h` first crew.
