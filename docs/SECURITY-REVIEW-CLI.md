# Security review — the CLI sync path

Reviewed 2026-09-18 against `gitstats-cli@src/cli.ts`, `app/api/ingest/route.ts`,
`app/api/cli/device/**`, `lib/cli.ts`, `lib/actions.ts:confirmDevice`, `app/link/page.tsx`.
Threat model: a small group of friends, each running the CLI on their own machines; one of them
also commits to an employer's private repos.

---

## F1 — 🔴 Cross-user repo hijack via attacker-controlled `github` field

`lib/cli.ts` → `ingest()`:

```ts
const existing = r.github
  ? await db.select({ id: repos.githubNodeId }).from(repos)
      .where(sql`lower(${repos.nameWithOwner}) = ${r.github.toLowerCase()}`).limit(1)
  : [];
if (existing[0]) {
  nodeId = existing[0].id;
  await db.update(repos).set({ source: "local", lastSeenAt: new Date() })
          .where(eq(repos.githubNodeId, nodeId));
}
```

`r.github` comes straight from the request body. `parseIngestRepos` validates its *shape*
(`^[\w.-]+/[\w.-]+$`) but **never checks that the requesting user has any relationship to that
repo.** Any holder of a CLI token can name any repo in the system.

Consequence, and it is not confined to the attacker's own data: `repos.source` is **global, not
per-user**, and `localRepoIds()` is consumed by the nightly snapshot to decide what to skip. So one
POST flips a repo to `source = "local"` and **the GitHub-sourced snapshot stops writing that repo
for every user on the board, permanently.** The attacker's own weekly rows also land on the
victim's real repo row.

**This also fires without malice.** Two friends who both have a clone of the same public repo race
each other: whoever syncs last owns `source`, and the other's GitHub-path rows stop refreshing.

**Fix:** scope the lookup to repos the requesting user already has rows for, or drop the
`existing[0]` branch entirely and always key local repos as `local:<hash>`, resolving precedence at
read time instead of mutating a shared row.

---

## F2 — 🔴 Repo names ARE transmitted. The "hashed / opt-in" claim is false as built.

`countRepo()` sends, on every sync, unconditionally:

| Field | Value | Opt-in? |
|---|---|---|
| `github` | `"owner/name"` for any `github.com` remote | **no** |
| `name` | last two path segments of the normalised remote URL — so `git@git.example.dk:backend/api.git` → `backend/api` | **no** |
| `remoteHash` | `sha256("remote:" + normalised url)`, **unsalted** | n/a |

Three problems:
1. The product copy says *"no repo names unless you opt in"* and *"remote URL hashed; the display
   name is optional and opt-in."* **Neither is true.** Both a cleartext name and the hash go up
   every run, and the server stores the name in `repos.nameWithOwner`.
2. **An unsalted SHA-256 of a remote URL is not anonymisation.** The URL space is tiny and
   guessable — anyone with DB access reverses it by hashing candidate URLs. It is pseudonymisation
   at best; the page should say that rather than implying otherwise.
3. ⚠️ **Employer consequence.** A private work remote is transmitted and stored as a readable
   string. Any disclosure made to an employer on the basis of *"no names leave the machine"* would
   be inaccurate against this build.

**Fix:** send `github`/`name` only when the user has opted in per repo (default off → server stores
`local:<hash>` with a generic label). Keep the hash for identity, and describe it honestly.

---

## F3 — 🟠 Plaintext CLI token persists at rest in `device_codes`

`confirmDevice()` writes the raw token into `deviceCodes.issuedToken`. The poll endpoint deletes the
row on success — but **only on success**. If the CLI never polls (terminal closed, network drop),
the row survives with a live plaintext token, and nothing purges expired codes: the poll route
returns `410` for an expired row without deleting it.

`cliTokens` correctly stores only `sha256`; this path undoes that for any abandoned link attempt.

**Fix:** delete expired `device_codes` rows on every poll and on every create, plus a sweep in the
nightly cron.

---

## F4 — 🟠 The first sync uploads before the user sees what it found

`link()` scans `$HOME` to depth 5, then calls `sync(c)` immediately, and only *afterwards* prints
the repo list. The user learns which repos were included **after** the data has already been sent.

The scan itself is well behaved — `SKIP_DIRS` is sensible, dotdirs are skipped below the root, and
it only ever runs `git config` and `git log`; **no file contents are ever read.** But a home
directory legitimately contains client work, other people's clones, and things a user would not
choose to report.

**Fix:** print the found repos and require confirmation before the first upload. `--yes` to skip.

---

## F5 — 🟡 Verify `unlink` revokes server-side

`unlink` removes the schedule and local config. If it does not also call the server, the row in
`cliTokens` stays valid forever and the token in any backup of `~/.gitstats/config.json` still
works. The settings-page REVOKE button mitigates this only if the user knows to use it.

**Fix:** have `unlink` POST a revoke, and fail loudly if it cannot.

---

## F6 — 🟡 No rate limiting anywhere on the CLI surface

`/api/cli/device` is unauthenticated and uncapped (DB fill). `/api/ingest` accepts 500 repos × 60
weeks = 30,000 rows per request with no per-token throttle and `maxDuration = 120`. Friends-scale
this is fine; it is one middleware away from not being a question.

---

## F7 — 🟡 Supply chain: `npx github:…` runs a committed `dist`

Friends execute a prebuilt bundle, as their own user, which then installs a launchd/systemd/Task
Scheduler job. `dist` is committed, so the artifact they run is not verifiable against `src` without
a manual rebuild. For this audience the honest posture is *"you are trusting Yaroslav"* — the setup
page should say that plainly rather than leaning on "numbers only" to carry the trust argument.

---

## F8 — 🟢 Minor

- `git log --author=<e> --fixed-strings` is a **substring** match: `me@a.com` also matches
  `me@a.com.br`. Cosmetic at this scale.
- Worktree dedupe keeps the first clone per `remoteHash`; if two clones sit on different default
  branches, the numbers depend on scan order.

---

## What is genuinely well built — not padding, it's the reason the verdict isn't worse

- **The device flow is correct.** 32-byte random poll secret, 10-minute TTL, single use (row deleted
  on success), confirmation is a Next **server action** behind an authenticated session with an
  explicit button that names the machine. No drive-by CSRF path.
- **`cliTokens` stores only `sha256(token)`** of a 32-byte random secret — a database leak yields
  nothing usable, and there is no brute-force surface.
- **`~/.gitstats/config.json` is written `mode: 0o600`.**
- **`parseIngestRepos` is careful input validation** — regex-checked hash, length caps, bounded
  arrays, no `any`, rejects the whole payload on any bad element.
- **The core privacy claim is true:** no file contents, no diffs, no filenames, no GitHub tokens
  leave the machine. Only counts, plus the identifiers in F2.

---

## Order to fix

1. **F1** — one-line class of change, and it corrupts other people's data.
2. **F2** — before the work machine is ever linked, and before the copy is shown to anyone.
3. **F3, F4** — same sitting.
4. **F5–F7** — before anyone outside the friend group touches it.

---

## Resolution (2026-09-18)

| Finding | Status | What changed |
|---|---|---|
| F1 cross-user hijack via `github` field | **fixed** | `github` field removed from the payload. Precedence is per `(user, repo)`: `weekly_stats.source` (`github` \| `local`); `repos.source` dropped. Ingest only ever writes the caller's own rows. The snapshot skips `(user, repo)` pairs with local rows and writes GitHub rows for everyone else. |
| F2 names transmitted, unsalted hash | **fixed** | `remoteHash = HMAC-SHA256(per-user salt issued at pairing, normalised remote)`. Public repos are recognised server-side by recomputing the HMAC over known `github.com/owner/name`, so no name is needed. `name` is sent only after `gitstats names on`; otherwise the repo is stored as `private-<hash8>`. Copy on landing, setup and settings rewritten; the honest limit (operator holds the key, can confirm a guess, cannot enumerate) is stated. |
| F3 plaintext token in abandoned `device_codes` | **fixed** | expired rows purged on every `/api/cli/device` call; confirmed rows are deleted on pickup. |
| F4 upload before consent | **fixed** | `link` prints every repo and its totals, states what is sent, and asks `[Y/n]` before the first upload (`--yes` skips). Cancelling removes the local link. |
| F5 unlink server-side | **fixed** | `gitstats unlink` calls `DELETE /api/cli/unlink` with its bearer token, then removes the schedule and config. |
| F6 rate limiting | **declined** | friends-only, every write needs a bearer token, and Vercel has no free built-in limiter. Revisit before opening sign-up to strangers. |
| F7 committed `dist` | **partly** | copy now says plainly "you are trusting Yaroslav" with the repo link. `dist` stays committed because `npx github:` needs it; publishing to npm would not change the trust model. |
| F8 substring email match | **fixed** | author email compared exactly after the `--author` prefilter. |
| F8 worktree order | **fixed** | real clones sort before worktrees, so the primary checkout wins. |

Verified against production: HMAC matching maps the maintainer's public repos onto their GitHub node ids without a name in the payload; a private work monorepo is stored as `private-<hash8>` with no name; a public repo uploaded by the CLI before GitHub knew it (`gitstats-cli`) was folded into its GitHub id by the next snapshot. Cron run 11: 18 repos, 0 errors.
