# Private repo activity in gitstats — full context

Written 2026-09-18 so another session can pick this up without the chat history.

## What gitstats is
Friends-only dashboard. Everyone signs in with GitHub (Auth.js v5, public scope only: `read:user user:email`). A nightly Vercel cron snapshots activity into Neon Postgres; the UI reads only Postgres. Repo: `yaroslavhaidash/gitstats`, prod `https://gitstats.org`.

Two GitHub calls per user per night:
1. GraphQL `user(login).contributionsCollection(from,to)` → contribution calendar (daily counts) + `commitContributionsByRepository` (public repos committed to, up to 100).
2. REST `GET /repos/{owner}/{repo}/stats/contributors` → per-contributor weekly `{additions, deletions, commits}`, default branch only, 202 while GitHub computes (we retry with backoff).

## The problem
Most of the maintainer's work is in private repos: personal projects under their own account, and their employer's org. Public-only stats show almost nothing (1 public repo, a couple of dozen commits a year) while the calendar shows hundreds of restricted contributions.

## Why it's hard: GitHub has no "stats only" permission
- Contributor stats are derived from commit contents, so GitHub gates `stats/contributors` behind **Contents: read** on the repo. There is no permission that grants numbers without the ability to read source.
- `contributionsCollection` only reveals private repos when queried with the **user's own OAuth token** (classic `repo` scope). Fine-grained PATs and server tokens get `restrictedContributionsCount` (a bare number) and nothing else.
- The contribution calendar can include private activity, but only as anonymised daily counts, and only if the user enabled "include private contributions" on their profile.

## Options evaluated
| Option | Gets | Cost | Verdict |
|---|---|---|---|
| OAuth `repo` scope per user | everything private | read **and write** to all repos the user can reach, incl. employer orgs; stored tokens; tokens expire (needs refresh) | rejected: too much access |
| GitHub App installed per org/user | private stats for installed repos | org admin must install; app JWT + installation tokens | rejected for employer orgs (needs an org admin to get involved) |
| `restrictedContributionsCount` | one number per user per window | nothing | too coarse (mixes commits/PRs/issues/reviews) |
| **Fine-grained PAT, `Contents: Read-only`, pasted by the user** | private repos the token covers, weekly LOC + commits | read-only; user picks repos; user-controlled; one token per *resource owner* (personal account, each org) | **built** |
| **Local CLI (`gitstats-cli`) that recounts `git log` and POSTs numbers** | any repo the user has cloned, incl. employer's, zero GitHub access | one command per computer; daily background sync | **built, the primary path** |

## What was verified empirically (2026-09-18, the maintainer's own tokens)
- Zero-scope classic PAT: GraphQL + REST work for public data (`x-oauth-scopes` empty).
- Fine-grained PAT, resource owner = personal account, All repositories, Contents: Read-only:
  - GraphQL `contributionsCollection`: private repos NOT listed (`restrictedContributionsCount` only), so GraphQL is useless for private discovery.
  - REST `GET /user/repos?visibility=private`: the account's private repos are visible.
  - REST `stats/contributors` on a private repo: 202 then 200 with real weekly rows.
- An employer org **does** appear as a selectable resource owner when it has fine-grained PATs enabled. Whether it requires owner approval is unknown until a token is created. Org owners can see active fine-grained tokens (owner, name, permissions, repos) under org settings → Personal access tokens.

## What is built now
- `user_tokens` table: many tokens per user, `label` (e.g. "personal", "work"), AES-256-GCM encrypted (`lib/crypto.ts`, key `TOKEN_ENCRYPTION_KEY`), `last_error` set when GitHub rejects the token (expired/revoked) without failing the run.
- Settings page `/dashboard/settings`: add/delete tokens; the token must belong to the signed-in login (`GET /user` check).
- Snapshot (`lib/snapshot.ts`): per user, GraphQL with the **server** token (uniform public numbers) ∪ REST `/user/repos` with each of the user's tokens (repos pushed in the last year). `stats/contributors` uses the user's token for private repos, server token otherwise. `repos.is_private` recorded.
- Privacy controls on `users`, as a crewmates × everyone matrix: `profile_visibility` (crew | everyone), then a pair per row — `share_private` / `share_private_global` (bool) and `repo_names` / `repo_names_global` (all | public_only | none). Crew boards and crewmates read the first of each pair; the global board and a profile opened by a stranger read the `_global` one. Private repos are excluded from what that viewer sees when their column says so; repo names are masked the same way. A `repo_name_overrides` row hides one repo's name from everyone regardless of the matrix; it can never reveal a name the matrix keeps back. Owner always sees everything.
- Limits: fine-grained PATs expire (max 1 year), `stats/contributors` lists max 100 contributors and only the default branch, LOC counts lockfiles/generated files.

## The CLI (built 2026-09-18)
Repo: https://github.com/yaroslavhaidash/gitstats-cli (public, ~350 lines TS, `dist/` committed and published to npm as `@yaroslavhaidash/gitstats-cli`, so `npx @yaroslavhaidash/gitstats-cli@latest link` is the whole install).
- `link`: POST `/api/cli/device` → code + poll secret + a verify URL built from **the request's own origin**, never `SITE_URL`, so a code minted against localhost or staging is confirmed there and cannot land on production by accident. Opens `/link?code=…` where the signed-in user confirms (`confirmDevice` action creates a `cli_tokens` row, sha256 of the raw token stored, raw token handed to the CLI on its next poll then deleted). Because that page opens in whatever browser the OS calls default, the CLI says which server it is pairing with *before* it opens anything, prints the paired login on its own line *before* the scan, and `link --user <login>` revokes the pairing outright when the browser confirmed as somebody else. Then scans `--root` (default `~`) for repos, syncs, copies itself to `~/.gitstats/cli`, installs launchd / Task Scheduler (`StartWhenAvailable`) / systemd user timer (`Persistent=true`) under a name keyed to the config directory (`com.gitstats.sync.<hash8>`, `gitstats-sync-<hash8>`), so installs under different `HOME`s never overwrite or remove each other's job; `link` and `resume` retire a pre-0.3.5 unhashed entry found in the same `HOME`.
- `sync`: per repo `git log <origin/HEAD or main> --no-merges --fixed-strings --since=1y --numstat --author=<each email>` (`--fixed-strings` matters: the noreply email's `+` is a regex operator otherwise and silently matches nothing). Worktrees/clones sharing a remote are deduped by remote hash. (emails = global git email, repo-local email, `<id>+<login>@users.noreply.github.com`, plus `gitstats emails add`). Weeks bucketed Sunday 00:00 UTC. Language guessed from changed-file extensions, lockfiles excluded. A second pass counts work sitting on branches the default branch has not taken in yet and sends it as `pending`: `git for-each-ref --format='%(refname) %(committerdate:unix)' refs/remotes/origin` picks the candidate branches, `origin/HEAD` and the default branch are dropped, tips older than 30 days are dropped, and `git log <the rest> --not <defaultRef> …` runs with the same filters. No qualifying ref means no pending. Local-only branches never count. POST `/api/ingest` with Bearer token.
- Server `ingest()`: payload carries `remoteHash = HMAC(per-user salt, normalised remote)`, optional `name` (off by default), language, `weeks: {weekStart, additions, deletions, commits}[]`, `days: {date, additions, deletions, commits}[]` (max 400 days per repo; daily lines land in `daily_local.additions/deletions`) and `pending: {weeks, days}` with the same shapes and bounds. Pending buckets merge into the same rows under `pending_additions/pending_deletions/pending_commits` on both tables; a bucket that only has pending work still gets a row, with zero merged commits. Nothing reads those columns into a total, so unmerged work never affects a board ranking — it only shows as a faint line on the owner's stat tiles and as hatched caps on the lines-per-week chart. Server recomputes the HMAC over every known `github.com/owner/name` to recognise public repos without a name; unknown ones become `local:<hmac>` labelled `private-<hash8>`. The caller's rows for that repo in the window are replaced with `source = local`. Precedence is per `(user, repo)`: the snapshot never overwrites a user's local rows, and a `local:` repo is folded into the GitHub id once GitHub discovers it. See docs/SECURITY-REVIEW-CLI.md for the review that shaped this.
- Settings page lists linked machines with last sync time / repo count / error, and a REVOKE button. `/dashboard/setup` is the onboarding guide; crew boards show a banner until a machine is linked.
- Not covered: commits made on machines that never ran `link`; commits under emails not configured; a merge commit's own lines (`--no-merges`), which is intended. Branch work is counted but kept separate (`pending`), never ranked.
- Caveat on `pending`: "not reachable from the default branch" also covers commits whose branch was squash-merged (the originals never become reachable) and every rebase's discarded copies, so a repo with many open branches still reports a large number. The 30-day remote-only window is what keeps that bounded: on a 1406-branch monorepo the old `--all` pass reported 7774 pending against 546 merged for the same year and author, because every squash-merged worktree branch left behind locally was counted again; scoped to 380 remote branches touched in the last 30 days it reports 1711, of which this week's 375 commits carry 372 distinct subjects. It is the right answer to the question asked; it is not a second estimate of how much work landed.

## Employer orgs
An org-scoped token is optional and not the recommended path. A fine-grained PAT with the org as resource owner, "Only select repositories", Contents: Read-only works if the org policy allows it without approval, and the org owners can see it exists. The path with zero org involvement is the CLI: it counts work repos on the work laptop from the clone and pushes only numbers, so the org never sees anything.
