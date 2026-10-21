# Vercel usage audit, October 2026

Billing window Sep 20 to Oct 20, Hobby plan, all usage from this project.

| Limit | Used | Share |
|---|---|---|
| Fluid provisioned memory | 850.7 GB-hrs of 360 | 236% |
| Fluid active CPU | 7h 17m of 4h | 182% |

Goal: under about 50% of both, same features, no plan change.

## How it was measured

Hobby keeps little: the metrics API answers only `vercel.request.count` for the last 24 hours with one group-by, every function metric (duration, memory, CPU) needs Observability Plus, and runtime logs reach back about 15 minutes. So the evidence is a 24-hour request breakdown, a 15-minute log sample, a real MCP client run against a local server, and the app's own tables (`visits`, `snapshot_runs`).

## Cost drivers

### 1. MCP `subscriptions/listen` streams held until the 300 s timeout (the cause)

- `/api/mcp` was 934 of the 1,589 requests to function routes in the last 24 h (59%). Every one came from Claude Code clients.
- In the 15-minute log sample, 50 POSTs reached `/api/mcp` and 18 of them ended in `Vercel Runtime Timeout Error: Task timed out after 300 seconds`. Each one was followed by a new POST within a second.
- Pointing a real Claude Code client at a local server showed the sequence: `server/discover`, then `subscriptions/listen` answered as `text/event-stream`, then `tools/list` and `tools/call`. The listen stream stayed open until the client exited.
- Why: `@modelcontextprotocol/server` 2.x sets `tools.listChanged: true` as soon as a tool is registered, and answers `subscriptions/listen` with an SSE stream that only ends when the client disconnects (a 15 s keep-alive keeps it alive). On Vercel the function runs until the 300 s default timeout, the client reconnects at once, and the loop repeats for as long as a Claude session is open. The MCP server is configured at user scope, so every Claude Code session on that machine, subagents included, holds its own stream.
- Cost: provisioned memory bills instance lifetime × 2 GB while any request is in flight. 18 × 300 s every 15 minutes is about 6 streams open at all times, so an instance never idles while Claude is in use. 850 GB-hrs at 2 GB is about 14 instance-hours a day, consistent with the stream pattern over a working day.
- Fix (`app/api/mcp/route.ts`):
  - Advertise `capabilities.tools.listChanged: false`. The tool list is fixed per deploy, so there is nothing to announce. Verified: the client no longer sends `subscriptions/listen`; discover, list and call each finish in under 1.5 s.
  - Refuse `subscriptions/listen` with JSON-RPC `-32601` before auth, for clients that subscribe anyway. Verified: answered in about 5 ms; Claude Code retries with backoff (1 s, 2 s, 4 s…) and its tool calls still work.
  - `maxDuration = 30` on the route as a ceiling. Tool calls take under 2 s.
- Expected saving: nearly all provisioned memory. Without the streams, function time is real work only: about 1.5K invocations a day at under 0.5 s is roughly 12 GB-hrs a month (about 3% of the limit), so under 10% leaves wide margin. Active CPU should fall too, since every reconnect after a timeout re-runs the handler and often lands on a fresh instance. How much CPU belonged to MCP cannot be measured on Hobby, so this one is unverified until a day of post-deploy usage is in.

### 2. Oct 12 to 13 spike

- Not web traffic: the `visits` table has 2 and 7 visitors on those days (2 to 19 per day across the window). No commits or deploys since Sep 28, and the nightly snapshot ran once each night for about 18 s.
- Most likely more Claude Code sessions open at once on those days, each holding a listen stream (driver 1). Per-route data for those dates is not retained on Hobby, so this is inferred, not measured.

## Checked and ruled out

| Suspect | Finding | Action |
|---|---|---|
| Nightly cron | 34 nightly runs in the window, 10 minutes in total (avg 18 s, max 46 s). About 0.3 GB-hrs a month. | None |
| Bots and crawlers | 34 of about 2,300 requests in the last 24 h were crawlers or AI bots. | None |
| Database | `neon-http` driver: one HTTP fetch per query, no pooled sockets kept open. Functions run in `iad1`, Neon is in `us-east-1`. | None |
| Pages rendered per request | Public pages are static or partial prerender with `use cache: remote` reads; badges send `Cache-Control`. Human traffic is a few visitors a day. | None |
| Function memory | `standard` (2 GB, 1 vCPU), the Hobby default. With the streams gone this no longer matters. | None (a project setting change if ever needed) |
| GitHub API on page load | None; pages read Postgres only (snapshot architecture). | None |

## After deploy

Check the usage page after 24 and 48 hours: provisioned memory per day should drop from about 28 GB-hrs to under 1, and `/api/mcp` should show no 300 s timeouts in `vercel logs`.
