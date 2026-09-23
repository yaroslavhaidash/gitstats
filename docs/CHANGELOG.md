# Changelog

What shipped, newest first, one line per change. `/changelog` renders this file, so keep the shape exactly:
`## YYYY-MM-DD` for a day, then `- **Title** — sentence.` for each entry.

## 2026-09-19

- **SEO and share cards** — per-page titles and canonical URLs, a generated Open Graph card, `robots.txt`, `sitemap.xml`, structured data on the landing page, and this changelog.
- **Navigation no longer dies mid-load** — error boundaries on every dashboard route and a retry when a sleeping database refuses the first connection.
- **Charts, second pass** — the leaderboard stacks added and deleted lines into one DIFF column, the race span follows the selected window, and the window and metric now carry across pages.
- **Crew race, repo pulse and momentum arrows** — three more ways to read a week: who pulled ahead when, which repos were awake, and who is speeding up.
- **Member timelines on the crew board** — one line per crewmate over 26 weeks, with their login written at the end of their own line.
- **Lines per day and repo mix** — a daily trend with a trailing mean on the personal page, plus the repos that made up the window.
- **gitstats.org** — the site moved to its own domain; `www` redirects to the apex.
- **Safer admin actions** — every destructive action is typed to confirm, written to an admin log, and a deleted account is recoverable for 30 days.
- **Admin page** — totals, the last snapshot runs, members and crews, for the site owner only.
- **Snapshots that scale** — the nightly job budgets its time, chains itself when there is more to do, and skips repos GitHub says have not moved.
- **Plain trust copy and a privacy page** — what is stored, who can see it, and how to take it back, on one page.
- **Settings tell you when they are unsaved** — the save button wakes up on the first change and guards every way off the page.
- **Open by default, with live counters** — new accounts start visible on the boards, and the footer counts the people and crews already here.
- **Thirteen fixes from the QA pass** — export completeness, delta caps, stale nav after a rename, phone layout of the visibility matrix, and more.
- **CLI 0.3.1** — `resume` no longer uninstalls the CLI, and `status` says when the background sync is paused.
- **Calendars and streaks obey your visibility settings** — the heatmap, the year calendar, the streak and the weekday profile now follow the same rules as the numbers.
- **Guided QA pass** — every route walked at desktop and phone width, signed in and signed out, written up as 17 findings.
- **Personal page, round three** — tooltips follow the pointer, day numbers sit centred, and the charts got their spacing back.

## 2026-09-18

- **The CLI updates itself** — `sync` checks once a day for a newer version, and your linked machines show which version they run.
- **Pending work, avatars and the npm command** — unmerged branch work counts only from pushed branches, a missing avatar no longer breaks a board, and setup uses the published package.
- **Health endpoint and failure alerts** — `/api/health` reports the last snapshot, and two failed runs in a row send one alert.
- **Sync warnings on the board** — an amber line when a token stopped working or a linked machine has been quiet for three days.
- **Rate limiting** — the CLI endpoints carry a small token bucket so a runaway loop cannot hammer them.
- **Unmerged branch work** — commits that live only on a branch are counted and shown separately, never folded into a board.
- **Streak rules you choose** — count every day, or weekdays only.
- **Personal page polish** — lines per week is fixed 52-week context again, with clearer captions.
- **Hide one repo's name** — a per-repo switch that hides a name from everyone, whatever your other settings say.
- **Visibility as a matrix** — one grid: who may open your page, whose numbers include private repos, and who sees repo names — crewmates in one column, everyone else in the other.
- **Per-repo pages and crew overlaps** — one page per repo with commits per member per week, and a panel for the repos a crew shares.
- **Export and delete your account** — every number the server holds as JSON, and a delete that takes you off every board.
- **Crew admin** — rename a crew, roll its invite code, remove a member, leave a crew.
- **Coherent time windows** — week means this week, month means this month, and the lines-per-day widget agrees with the tiles above it.
- **Command palette** — `/` opens it: crews, boards, windows, settings, docs.
- **Phone layout** — the nav collapses into one menu and the leaderboard becomes cards.
- **Empty states** — a board with nothing in it says why, and what will fill it.
- **Loading skeletons** — every dashboard route paints its own shape while the data arrives.
- **Cached boards** — page reads are cached and invalidated on write, so a board opens instantly.
- **Month blocks, language share and weekday profile** — three charts on the personal page.
- **Custom date ranges and deltas** — pick any window, and each tile says how it compares with the period before.
- **Faster boards** — indexes for every board query and the streak computed in one SQL pass.
- **Lines per day from the CLI** — linked machines send commits and lines per day, so private repos land on the calendar and in the daily charts.
