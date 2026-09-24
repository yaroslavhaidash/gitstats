# gitstats — instructions for coding agents and contributors

Read this first, then `docs/ARCHITECTURE.md` (how it fits together), and only the docs your task needs. Human contributors: the same rules apply, and `CONTRIBUTING.md` has the PR process.

## What this is
A friends-only dashboard: everyone signs in with GitHub, joins a crew with an invite code, and compares coding activity — commits, lines added/deleted, active repos, streak, stars, top language — per week/month/year. Fun, not a business. Nobody is trying to cheat it: **no anti-gaming, verification, or fraud detection.** Optimise for looking good and loading instantly.

Live: https://gitstats.org · CLI: github.com/yaroslavhaidash/gitstats-cli (public, separate repo).

## Non-negotiable rules
- **TypeScript: never `any`.** Not in a catch block, not with a comment.
- **Surgical changes.** Every changed line traces to the task. Don't improve adjacent code unasked. Remove only orphans your own change creates.
- **Simplicity first.** Minimum code that solves the problem. No speculative abstraction, no config nobody asked for.
- **Evidence before assertion.** Never say done/fixed/passing without showing `npx tsc --noEmit`, `npx eslint .` and `npx next build`; for data changes, show real rows from your own database.
- **Privacy is the product's promise.** Never request the GitHub `repo` scope. Never store OAuth access tokens. The CLI sends numbers only; repo names only when the user opted in. Read `docs/SECURITY-REVIEW-CLI.md` before touching `lib/cli.ts`, `app/api/cli/*`, `app/api/ingest`, or the CLI.
- **Snapshot architecture.** Pages read only Postgres. No GitHub API calls on page load, ever.
- Comments explain what/why for a future maintainer; no notes about review rounds or who asked for what.

## Commands
```bash
npm run dev                 # local, needs .env.local (see README → Run it locally)
npx tsc --noEmit && npx eslint . && npx next build
npm run db:generate && npm run db:migrate                 # schema change; never add+drop a column in one migration
npx tsx --env-file=.env.local scripts/seed-demo.ts        # fake demo crew for /demo
npm run snapshot            # run the nightly GitHub job against your DATABASE_URL
```

## Design system (already in `app/globals.css`)
Void `#050505`, alert red `#ff3333`, silver `#e0e2e5`, dark `#1a1a1a`; JetBrains Mono for UI text, Space Grotesk for headings; brutal 4px red shadow buttons (`btn-brutal`, `btn-ghost`), `panel`, `tag`; fixed SVG grain overlay. The `gs` mark is `app/icon.png` / `app/apple-icon.png`, rendered from the same colours as `components/Logo.tsx`. Charts are inline SVG: additions `#22c55e`, deletions `#ff3333`, commits `#d95926`, categorical hues from `lib/palette.ts` (colour follows the entity, never its rank), red sequential ramp in `components/Heatmap.tsx`, hover labels via `components/CellTip.tsx`. Animations are quiet and respect `prefers-reduced-motion`. Every button has `cursor: pointer`.
- **Charts draw at their real width** (`components/useChartWidth.ts`), one viewBox unit per CSS pixel, so axis text keeps its size on a phone. Axis density comes from `components/dayTicks.ts`, never hand-tuned per chart.
- **Lines is the primary metric** (additions + deletions); commits are the alternative behind `MetricTabs`. Whatever is selected orders the board too, so a table never disagrees with the charts beneath it.
- **Per-day numbers have two sources and neither is complete.** A linked computer counts days exactly; a repo GitHub knows about but that is not cloned anywhere only has weekly figures, which `userDailyLines` lays over that week's days and returns separately in `spread*` so charts can hatch them. Never present a placed figure as a counted one.
- **Copy:** no em dashes in UI text, no italics for emphasis, no cream or light backgrounds.

## Docs index
- `docs/ARCHITECTURE.md` — data flow, tables, routes, file map, invariants.
- `docs/PRIVATE-ACTIVITY.md` — why private repos are counted locally, options evaluated, what the CLI does.
- `docs/SECURITY-REVIEW-CLI.md` — the review that shaped the CLI path and how each finding was resolved.
- `docs/CHANGELOG.md` — what shipped; rendered at `/changelog`.
- `ROADMAP.md` — public direction, no dates.
- `README.md` — env vars, local run, self-hosting, limitations.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
