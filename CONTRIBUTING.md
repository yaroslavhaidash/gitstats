# Contributing

gitstats is a fun side project, not a business. PRs are welcome; please read this first.

- **Looking for something to do?** [ROADMAP.md](ROADMAP.md) lists the direction; issues labelled `good first issue` are a good start.
- **Reviews are by the owner and replies can be slow.** Every outside PR is reviewed by the owner before it merges. Open an issue first for anything bigger than a small fix, so you don't spend a weekend on something that won't land.
- **Checks must pass.** CI runs these on every PR; run them locally first:
  ```bash
  npx tsc --noEmit && npx eslint . && npx next build
  ```
- **TypeScript: never `any`.** Not in a catch block, not with a comment. Use `unknown` and narrow.
- **Small, surgical PRs.** Every changed line should trace to what the PR says it does. No drive-by refactors or new config nobody asked for.
- **Privacy is the product's promise.** Never request the GitHub `repo` scope, never store OAuth access tokens, and the CLI sends numbers only (repo names only when the user opted in). Read `docs/SECURITY-REVIEW-CLI.md` before touching `lib/cli.ts`, `app/api/cli/*` or `app/api/ingest`.
- **Pages read only Postgres.** No GitHub API calls on page load.
- **Schema changes** go through `db/schema.ts` → `npm run db:generate` → a new file in `drizzle/`. Never add and drop a column in the same migration.
- **No production data.** Develop against your own Neon branch with the demo seed; see "Run it locally" in [docs/SELF-HOSTING.md](docs/SELF-HOSTING.md).

Security issues: don't open a public issue, see [SECURITY.md](SECURITY.md).

By contributing you agree your work is released under the [MIT license](LICENSE).
