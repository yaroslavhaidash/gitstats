# Architecture

Next.js 16 (App Router, Turbopack) · TypeScript · Tailwind v4 · Drizzle ORM + Neon Postgres (`@neondatabase/serverless`, HTTP driver) · Auth.js v5 (GitHub provider, JWT sessions, no adapter) · Vercel (Fluid Compute, one cron).

## Data flow

```
GitHub (public)                    your computers (private + public)
   │ nightly 03:00 UTC                    │ daily background sync
   │ server zero-scope PAT                │ npx gitstats-cli (numbers only)
   ▼                                      ▼
/api/cron/snapshot  ──► Neon ◄──  /api/ingest (bearer = per-machine token)
                          │
                          ▼  reads only; never calls GitHub
                     dashboard pages
```

1. **Sign-in** (`auth.ts`): GitHub OAuth with `read:user user:email`. The `jwt` callback upserts `users` from the profile (`login`, `node_id`, numeric `id`, avatar, name) and puts `uid`/`login` in the JWT. The access token is never copied anywhere. New users get an immediate per-user snapshot via `after()`.
2. **Nightly snapshot** (`lib/snapshot.ts`, `vercel.json` cron → `app/api/cron/snapshot`, `CRON_SECRET` bearer): for every user, one GraphQL `contributionsCollection` (server `GITHUB_TOKEN`) → `daily_contributions` + public repo list; optional read-only fine-grained PATs in `user_tokens` add private repos via REST `/user/repos`. Then REST `stats/contributors` per repo (202 → retry passes with backoff) → `weekly_stats` rows with `source = github`. Skips `(user, repo)` pairs the CLI owns. Folds `local:<hmac>` repos into GitHub ids once GitHub discovers them.
   - **Budget and chaining.** One invocation gets 240s of the route's 300s. Users are queued oldest `users.last_snapshot_at` first (nulls first), and every user the run reaches is stamped — errors included, so a user GitHub keeps rejecting cannot hold the queue. The first 40% of the budget is discovery (one GraphQL call each), the rest is `stats/contributors`; without the split a long queue would leave no time to write any stats. Whatever is left over comes back as `usersPending`, and the route calls its own URL again through `after()` with the `CRON_SECRET` bearer, `?chain=<id>&run=<n>`, up to 20 invocations. The `chain_id` on every `snapshot_runs` row ties them together, and a chain's queue is everyone whose `last_snapshot_at` predates the chain's first run, so each user is visited once per night.
   - **Skipping unchanged repos.** `repos.pushed_at` comes from GraphQL and REST; `repos.stats_fetched_for` records the `pushed_at` the last successful stats fetch covered. Equal means nothing was pushed, so the REST call is not made. A targeted run (`onlyUserIds`: first sign-in, a new token) never skips — it exists because a user is new to those rows, which is exactly what an unchanged answer would be missing.
   - **Quota guard.** Every response's `x-ratelimit-remaining` is read; below 300 the run stops issuing GitHub calls, records a `quota` error, and the route does not chain. Tomorrow's chain resumes.
   - Per-user snapshots (`auth.ts` on first sign-in, `addToken` in `lib/actions.ts`, `/admin`'s snapshot-now) run through the same function with a 60s budget and no chain.
   - **A first sign-in is discovery only** (`discoveryOnly`): one GraphQL call for the calendar and the public repo list, and no `stats/contributors` at all, so a launch spike of sign-ins costs one call each instead of one per repo. The new member is still at `last_snapshot_at = null`, so tonight's chain reaches them first and writes the lines. Measured on a throwaway user with 7 active public repos: 14 calls before, 1 after. Everything else (the nightly chain, `/admin`, a new token) keeps the full path.
   - `snapshot_runs.kind` is `nightly` \| `signin` \| `admin` (`admin` = a person pressed a button), and `snapshot_runs.quota_remaining` is the `x-ratelimit-remaining` of the run's last GitHub call. `/api/health` and `/admin` read the sign-in rate and the remaining quota off those two columns.
3. **CLI sync** (`gitstats-cli`, `lib/cli.ts`, `app/api/ingest`): per repo `git fetch origin <default>` then `git log <origin/HEAD> --no-merges --fixed-strings --author=<emails> --numstat`, bucketed by Sunday-00:00-UTC week and by UTC day. Payload per repo: `remoteHash` (HMAC-SHA256 with the user's server-issued `hash_salt` over the normalised remote), optional `name` (only after `gitstats names on`), `language`, `weeks[]`, `days[]`. Server recomputes the HMAC over known `github.com/owner/name` to match public repos without a name; unknown repos become `local:<hmac>` labelled `private-<hash8>`. Recount semantics: the user's rows for that repo in the window are replaced (`source = local`).
4. **Pairing** (`app/api/cli/device`, `/poll`, `/link`, `confirmDevice` action): device-code flow, 10-min TTL, single use, token returned once, only its sha256 stored in `cli_tokens`.
5. **Pages** read Postgres via `lib/stats.ts` and `lib/crews.ts`. Windows: week = Monday→today, month = 1st→today, year = last 365 days, or a custom `?from=&to=` range (`lib/window.ts`); weekly buckets count when their Sunday falls in `[from − 6 days, to]`.
6. **Metric** (`?m=`, `lines` by default, `commits` the alternative) decides what the comparison surfaces count *and* how the boards are ordered (`rankBy`), so the table and the charts under it never disagree. Lines means additions + deletions. The personal, crew and global pages all carry the switch; `viewQuery` keeps the window and the metric together in one query string.
7. **The view follows the reader.** Window and metric live only in the URL, so every link that lands on a board or a profile carries them: `withView` for the nav crews, the global board, the leaderboard's member links and the palette; `withMetric` where the link sets the window itself (the palette's presets, the 1/2/3 keys) and a preset should replace a custom range but keep the metric. The nav sits in a layout, which is never handed `searchParams`, so `ViewLink` reads them on the client.

## Tables (`db/schema.ts`)

| Table | Key | Purpose |
|---|---|---|
| `users` | `id` | GitHub identity + the visibility matrix: `profile_visibility` (crew\|everyone), `repo_names`/`repo_names_global` (all\|public_only\|none), `share_private`/`share_private_global` (crewmates column, then everyone), plus `hash_salt`, `github_id`, `last_snapshot_at` (the snapshot queue's order), `share_nonce` (mixed into every share-card signature; rotating it is the revoke), `last_streak_milestone` (the highest of 7/30/100/365 whose one-time banner the member has seen), `weekly_goal`/`weekly_goal_metric` (the owner's own target; read only by their own page and settings), `last_record_week`/`last_record_month`/`last_record_streak` (the Monday, month and run start of the last "new record" banner shown), `is_demo` (the seeded `/demo` crew) |
| `repos` | `github_node_id` (or `local:<hmac>`) | name, `is_private`, `is_fork`, language, stars, `stats_pending`, `pushed_at`, `stats_fetched_for` |
| `weekly_stats` | `(user_id, repo_node_id, week_start)` | additions/deletions/commits, `source` github\|local |
| `daily_contributions` | `(user_id, date)` | GitHub public calendar counts |
| `daily_local` | `(user_id, repo_node_id, date)` | CLI commits (and lines) per day; only private repos' rows feed the calendar |
| `snapshot_runs` | `id` | per invocation: counts, `users_pending`, `chain_id`, `kind` (nightly\|signin\|admin), `quota_remaining`, `errors` jsonb |
| `crews`, `crew_members` | | invite-code crews; `created_by` is the admin |
| `user_tokens` | `id` | optional read-only fine-grained PATs, AES-256-GCM (`lib/crypto.ts`, `TOKEN_ENCRYPTION_KEY`), `last_error` |
| `cli_tokens` | `id` | linked machines: sha256 of token, machine name, last sync time/repos/error |
| `mcp_tokens` | `id` | personal MCP tokens: sha256 of token, label, created/last used; created and revoked on settings |
| `kudos` | `(giver_id, receiver_id, week_start)` | one kudos per giver per member per Monday week; the key is the rule. `lib/kudos.ts`: `giveKudos` re-checks that the giver can open the page (`canViewProfile`), 60/hour per giver; everyone who can open the page sees the counts, only the receiver sees who gave. Exported, archived and deleted in both directions (`lib/account.ts`) |
| `repo_name_overrides` | `(user_id, repo_node_id)` | per-repo exception to the repo-names row; only ever hides more than the matrix |
| `device_codes` | `code` | pairing in flight; purged on expiry |
| `admin_log` | `id` | every mutation made from `/admin`: `who`, `action`, `target`, `at` |
| `deleted_users_archive` | `id` | one deleted member as jsonb (`lib/account.ts`), restorable for 30 days, purged at the end of every snapshot run |

Repos are keyed by GitHub node id so renames/deletions never orphan rows. Precedence between sources is per `(user, repo)`, never global.

## Routes

| Route | Auth | What |
|---|---|---|
| `/` | – | landing; redirects to `/dashboard` when signed in |
| `/demo`, `/demo/u/[login]` | – | the seeded demo crew's board and member pages, read-only, in their own public shell (`app/demo/layout.tsx`); the same components the dashboard uses, with the crew column of the matrix as the viewer |
| `/docs` | – | CLI manual, what is sent, FAQ |
| `/privacy` | – | what is stored, who sees it, export/delete |
| `/changelog` | – | `docs/CHANGELOG.md` rendered, newest day first (`lib/changelog.ts`) |
| `/robots.txt`, `/sitemap.xml` | – | `app/robots.ts`, `app/sitemap.ts`; public pages only, everything session-gated disallowed |
| `/opengraph-image`, `/twitter-image` | – | the site's unfurl image, generated at build from `lib/og.tsx`. Static for every route except `/s/<token>`: a *guessable* URL must never carry someone's numbers |
| `/s/<token>`, `/s/<token>/opengraph-image` | signature | one member's share card, no sign-in. The token is `base64url(userId~window~metric~flags).hmac`, signed with `SHARE_SECRET` over that text plus the member's `users.share_nonce` (`lib/share.ts`); a bad signature is a 404 and "new link" rotates the nonce, which 404s every card minted before it. Flags `s` (streak headline), `r` (best week or month ever) and `w` (weekly recap: the window is last Monday to Sunday, a fifth field carries the crew id, the rank line is that crew board's place for the same range, and the names switch shows or hides the crew name; `recapStats` in `lib/cached.ts`) are variants; `shareCard()` in `lib/share.ts` builds what the page and the OG image print. `noindex` |
| `/gh/<login>`, `/gh/<login>/opengraph-image`, `/gh?login=` | none | any GitHub user's public year (calendar, commits per week, streak, top language, top repos) from one cached GraphQL call; the landing's handle box submits to `/gh`, which redirects. See the invariant below |
| `/vs/<a>/<b>`, `/vs/<a>/<b>/opengraph-image`, `/vs/<a>`, `/vs?a=&b=` | none | two handles side by side (`lib/vs.ts`), window week/month/year, year by default. A member whose profile is open to everyone shows the global column of the matrix (lines, commits, streak, top language, calendar, via `publicMemberStats`); anyone else, a crew-only member included, shows the `/gh` numbers, and a pair compares on lines only when both sides have them. `/vs/<a>` asks for the second handle; the "compare with me" boxes (`CompareForm` on `/gh/<login>` and on a member page) submit to `/vs`, which counts `vs_create` and redirects; a rendered pair counts `vs_view`. `noindex`; the OG image reads Postgres and `handle_cache` only |
| `/join/[code]` | – | invite page; sign-in-then-join |
| `/link?code=` | session | confirm a device code |
| `/dashboard` | session | step 1: create/join a crew (redirects to first crew if any) |
| `/dashboard/setup` | session | step 2: link a computer; linked machines + status |
| `/dashboard/c/[code]` | member | crew board (`Leaderboard`), race (span from `raceWeeks`: 4/12/26 weeks by window), member timelines, overlaps; `?manage=1` is the creator's admin panel (rename, new code, remove member); any member can leave |
| `/dashboard/global` | session | everyone, aggregates; profiles open per visibility. Above the board, `StandingBlock` prints the reader's place for the chosen metric — "top N%" from 10 members up, the bare place below that — the number behind it and how many places they moved since the previous period. Under 50 members the flat table is the default; above it the board is the top 5 plus the reader's neighbourhood (5 either side, merged into one block when they touch), with `?all=1` for the flat table |
| `/dashboard/u/[login]` | owner / allowed | tiles, the owner's weekly goal ring (`GoalRing`, owner only) and one-time record banners, "Your week" Monday to Wednesday for the owner (`RecapPanel`: last week's recap and the crew select that opens the recap share card), records (`RecordsPanel`: best Monday-to-Sunday week and calendar month by lines and by commits, longest streak ever, from `userRecords`, gated like the tiles), `WeeklyBars`, `YearCalendar`, day calendar, lines-per-day trend, language share, weekday profile, repo mix + share, repos table (names masked per settings) |
| `/dashboard/r/[nodeId]` | own rows, or a crewmate who shows the name | one repo: commits per week stacked per member, member table, GitHub link when public |
| `/dashboard/settings` | session | linked machines, profile visibility, tokens, MCP tokens, data export + account deletion |
| `/admin` | GitHub account id in `ADMIN_GITHUB_IDS` | totals, last 10 snapshot runs, every member and machine, every crew, the delete archive and the admin log; 404 for everyone else. Deleting a member or revoking a machine needs the exact name typed into a modal, re-checked server-side |
| `/api/cron/snapshot` | `CRON_SECRET` | nightly job (`maxDuration 300`, 240s budget); chains itself via `?chain=&run=` until no users are pending |
| `/api/ingest` | machine token | CLI upload |
| `/api/mcp` | MCP token | read-only remote MCP (Streamable HTTP, stateless, `mcp-handler`); tools in `lib/mcp.ts`; 60 requests/min per token; each tool call counts `mcp_call` in `funnel_daily` |
| `/api/export` | session | JSON of everything the server holds about the caller, minus secrets (`lib/account.ts`) |
| `/api/cli/device`, `/device/poll`, `/unlink` | – / token | pairing, revoke |
| `/api/auth/[...nextauth]` | – | Auth.js |
| `/api/health` | – | `{ok, lastSnapshot: {id, finishedAt, errors}, chain: {runs, usersDone, usersPending}, signins: {lastHour, last24h}, quotaRemaining, db}`; 503 when Postgres does not answer. No secrets, no error text |

## File map

- `auth.ts` sign-in; `types/auth.d.ts` session typing.
- `db/schema.ts`, `db/index.ts` (lazy Neon client so `next build` needs no DB), `drizzle/` migrations.
- `lib/account.ts` export, account deletion, the 30-day delete archive and its restore/purge · `lib/admin.ts` `ADMIN_GITHUB_IDS` gate, the `/admin` overview query and the admin log · `lib/github.ts` GraphQL/REST client with rate-limit headers · `lib/snapshot.ts` nightly job · `lib/cli.ts` pairing + ingest + HMAC matching · `lib/stats.ts` all board/user queries · `lib/crews.ts` membership · `lib/actions.ts` server actions (crews, tokens, profile, device) · `lib/window.ts` time windows · `lib/share.ts` share-card tokens · `lib/mcp.ts` MCP tools and token lookup · `lib/crypto.ts` AES-GCM · `lib/format.ts` numbers/dates · `lib/env.ts`.
- `components/`: `Leaderboard` (table from `sm:`, cards below; `rankOffset` lets the global board draw slices of a longer board and `highlightUserId` marks the reader's row), `StandingBlock` (the reader's percentile, place and movement), `SharePanel` (the owner's share switches; the page mints a token for all eight positions so a toggle needs no round trip), `RepoList` (same two modes), `StatTile`, `WeeklyBars` (mirrored weekly bars), `YearCalendar` (two half-year rows), `MonthBlocks`, `MemberBars` (stacked weekly commits per member), `Overlaps`, `LanguageShare`, `WeekdayProfile`, `Heatmap` (84-day strips), `CellTip` (hover label), `WindowTabs`, `MetricTabs`, `RangePicker` (one button, popover), `ViewLink` (carries the window and metric across pages, and tags the destination with `?src=` — `c:<code>` or `global` — so a profile or repo page knows which board to offer back), `Hotkeys` (1/2/3, g, h, / palette), `Palette`, `Skeleton` (used by the `loading.tsx` files), `EmptyNote` (`inset` when it stands in for a chart inside a card), `CopyText`, `Confirm` (two-click destructive actions), `CrewManage`, `VisibilityMatrix`, `SetupCommand`, `CrewForms`, `Brackets`, `Glitch`, `Logo`, `Section` (per-card Suspense + error boundary), `NavMenu` (the one `<details>` dropdown the nav uses), `CrewSwitcher` (the crews as links or as `[CREWS ▾]`), `BackLink` ("← <board>", Escape too).
- Charts added in Phase 8: `DailyLines` (mirrored per-day bars), `RepoMix` (normalised stacked columns), `RepoShare` (donut), `MemberLines` (multi-line up to six members, sparkline rows above that), `MemberDaily` (stacked per-day bars), `CrewRace` (one frame per day), `Momentum` (board arrow). Shared helpers: `dayTicks` (how dense an axis may be at a given width), `useChartWidth` (draws at one viewBox unit per CSS pixel, so axis text keeps its size on a phone).
- `app/icon.png` and `app/apple-icon.png` are the `gs` mark from `Logo` — same `#ff3333` on `#e0e2e5` with `#050505` JetBrains Mono Bold. Next serves them through its metadata file convention; there is no `favicon.ico`.
- SEO lives in three places: `lib/site.ts` (origin, name, the shared description, and `openGraphFor` — a page's `openGraph` replaces the layout's instead of merging, so each one restates the shared fields), the root layout's title template `%s · gitstats`, and a `metadata` export with a canonical URL on each public page. The landing also carries a `SoftwareApplication` JSON-LD block.
- `assets/*.ttf` are JetBrains Mono and Space Grotesk (SIL OFL 1.1), read by `lib/og.tsx`; satori cannot use the woff2 files `next/font` downloads.
- `scripts/snapshot.ts` runs the job locally. `scripts/seed-demo.ts` writes the `/demo` crew by hand through `seedDemo()` in `lib/seed.ts`, which the cron route also runs once per night before the snapshot, so the demo always ends today (idempotent; every figure hashed from `login:repo:date`, so re-running is a no-op on the same day). Throwaway verification scripts go in `scripts/_*.ts` and are deleted.
- `public/demo-board.png` is a real 1280-wide capture of `/demo`; the landing hero renders it and `lib/og.tsx` composes the 1200-wide copy in `assets/demo-board-og.png` under the wordmark for the share card.

## When something fails

A page opens five or more Postgres reads at once and `loading.tsx` means the shell is flushed before
any of them answer. Two things follow, and both are load-bearing:

- **The HTTP driver retries** (`db/index.ts`, via `neonConfig.fetchFunction`): three retries at
  200ms, 600ms and 1500ms, for a thrown `fetch` and for a 429 or 5xx response alike — a refused
  connection and a 503 are the same event seen from either side of the gateway, and a compute waking
  from auto-suspend produces both. A 4xx is returned untouched, because repeating the caller's own
  mistake only spends the wait. Reads are idempotent and the writes on this path are upserts and
  recounts, so a repeated statement changes nothing. One `[db-retry] status=… code=… attempts=…
  outcome=…` line is logged per request that had to retry, never per attempt.
- **Every render has a boundary above it.** `components/Section.tsx` wraps one card's reads in a
  `Suspense` with a client error boundary outside it, so a rejection arriving after the shell has
  flushed replaces that card with "that didn't load · try again" and leaves the nav, the header and
  the numbers above it alone; the boards and the user page use it, one section per independent cached
  read. Above that, `app/dashboard/error.tsx` keeps the nav and footer and offers a retry;
  `app/error.tsx` catches the dashboard layout's own reads, which a segment boundary cannot;
  `app/global-error.tsx` is the last resort for the root layout and renders its own `<html>`. Without
  them a throw after the shell had been flushed cut the response off mid-stream, and the browser
  showed its own error page — dead, with no way back but a manual reload. Each boundary shows
  `error.digest`, which is the id to search production logs by.

## Invariants to keep
- Pages never call GitHub. Snapshot and ingest are the only writers of stats.
- **A period total is a sum of days.** `periodBounds` in `lib/window.ts` gives the current and previous day ranges (week = Monday to today against last Monday to the same weekday; month = the 1st to today against the same days last month; year rolling). `rangeTotals` in `lib/stats.ts` sums `placedDays` over a range: counted `daily_local` days, plus GitHub-only weeks placed onto their elapsed days, so a range that cuts a week gets only its part. Boards, momentum, the page tiles and deltas, the badge and MCP all read these two; none sums weekly buckets.
- **`/gh/<login>` is the one exception, on purpose.** It exists for people who are not members yet, so there is no snapshot to read. `lib/handle.ts` makes one GraphQL `contributionsCollection` call per handle, stores it in `handle_cache` for 24h, and serves every later view from Postgres. Uncached fetches are capped at 30/hour per IP and 300/hour overall (`handle`/`handleGlobal` in `lib/ratelimit.ts`) and refused while the server token is under `QUOTA_FLOOR`; past any of these a stale cached page still serves and a new handle gets "busy". `/vs/<a>/<b>` resolves each non-member side through the same `getHandle`, so a pair is two handle views against the same cache and limits. It writes no `users` row and nothing a board reads. The OG image reads the cache only. Handles are `noindex` until a signed-in member has opened one (`handle_cache.member_viewed`); a member's own handle redirects a signed-in visitor to `/dashboard/u/<login>`.
- **`users.is_demo` is the one flag that means "not the site".** The seeded demo crew lives in the real tables so `/demo` can run the real components over it, and is kept out of everywhere the site counts itself: the global board (`scope(null)` in `lib/stats.ts`), the footer counts (`siteCounts`), `/admin` (members, repos, weekly rows and the crew, in `lib/admin.ts`) and the nightly queue (`lib/snapshot.ts`). Anything new that means "everyone" has to say so too.
- Public repos come from GitHub; private repos come from the CLI (or a user's own read-only PAT). A repo present in both paths is counted once per user via `weekly_stats.source`.
- **A share card is the one place a link outranks the matrix, and the owner writes it.** `/s/<token>` shows the member's own view of themselves, because they pressed the button and saw the card first; the only thing it holds back is a repo whose name they hid per repo. Nothing is stored — the signed address *is* the permission — and `share_nonce` is how it is taken back. Documented on `/privacy` as the "anyone with the link" column.
- Non-owners see private repos only as numbers (and names only if the owner allows). Which column of the matrix applies is decided by the page and passed in: crew boards and crewmates get the crew column, the global board and strangers the `_global` one (`BoardViewer` in `lib/stats.ts`). A repo page opens only for someone who has their own rows for it or shares a crew with someone who shows its name (`repoScope` in `lib/stats.ts`). `nameVisible` is the single place a repo name is unmasked: the matrix column, minus any `repo_name_overrides` row.
- **Two sources know about days, and neither knows everything.** A linked computer counts every day of every repo it can see, exactly. A repo GitHub knows about but that is not cloned on any linked machine has no per-day figures at all — `stats/contributors` answers by the week — so `userDailyLines` (personal page) and `memberDailyTotals` (crew page) lay that week over its own days in proportion to the member's contribution calendar — one `weekShares()` helper does the arithmetic for both — and return the placed amount separately in `spread*` / `spreadLines` so a chart can hatch it rather than pass it off as counted. Without this the day charts silently lost every repo that is not on a machine and disagreed with the weekly chart beside them. Per-day **commits** come from GitHub's calendar as well, so they are counted for everyone and are never placed.
- Every read of `daily_local` goes through `sharedRepo(viewer)` — the calendars, the streak and the weekday profile are gated exactly like the numbers beside them, because the shape of a private work week is as private as its totals. `BoardViewer` has a third value, `own`, for the member reading their own page, where nothing is held back. Single-user reads (`userDailyLines`, `weeklyTotals`, `userRepos`, `languageLines`) take the `includePrivate` boolean the page derives from the same matrix column.
- **The MCP token's owner is the viewer.** Every tool in `lib/mcp.ts` calls the helper its page calls, with the `isOwner`/`viewer`/`includePrivate` that page would derive for the owner (`member_summary` repeats the `/dashboard/u/<login>` gate and refuses a crew-only page to a non-crewmate; `crew_board` needs membership), so an assistant never sees more than the owner could open on the site. No GitHub calls.
- Weeks start Sunday 00:00 UTC everywhere; days are UTC dates.
- Every write path that a friend's machine can hit (`/api/ingest`, device endpoints) validates shape strictly (`parseIngestRepos`) and only ever writes the caller's own rows, behind the soft in-memory rate limits in `lib/ratelimit.ts`.
