import type { McpServer } from "@modelcontextprotocol/server";
import { eq } from "drizzle-orm";
import { after } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { mcpTokens } from "@/db/schema";
import { crewBoard, globalBoard, userStats } from "./cached";
import { hashToken } from "./cli";
import { crewByCode, crewMemberIds, isMember, sharesCrew, userByLogin, userCrews } from "./crews";
import { countStep } from "./funnel";
import { PERCENTILE_FROM, rankBy, standing, userDailyLines, userRepos, type BoardViewer } from "./stats";
import { parseMetric, parseWindow, windowLabel, windowRange, type Metric, type Window } from "./window";

/**
 * The read-only MCP tools. The token's owner is the viewer: every tool calls the helper the matching
 * page calls, with the same `isOwner`/`viewer`/`includePrivate` the page would pass for that reader,
 * so an assistant can never see more than the owner could open on the site. No GitHub calls.
 */

export const MCP_TOKEN_PREFIX = "gsm_";

/** The owner of a raw token, or null. A hit stamps `last_used_at` after the response. */
export async function mcpTokenOwner(rawToken: string): Promise<{ id: number; userId: number } | null> {
  const [row] = await db.select({ id: mcpTokens.id, userId: mcpTokens.userId }).from(mcpTokens).where(eq(mcpTokens.tokenHash, hashToken(rawToken))).limit(1);
  if (!row) return null;
  after(() => db.update(mcpTokens).set({ lastUsedAt: new Date() }).where(eq(mcpTokens.id, row.id)));
  return row;
}

const windowArgs = {
  window: z.enum(["week", "month", "year"]).optional().describe("week = Monday to today, month = the 1st to today, year = the last 365 days. Default week."),
  from: z.string().optional().describe("Start of a custom range, YYYY-MM-DD. Needs `to`; overrides `window`."),
  to: z.string().optional().describe("End of a custom range, YYYY-MM-DD, inclusive."),
};
const metricArg = { metric: z.enum(["lines", "commits"]).optional().describe("What to rank or report by. lines = added + deleted. Default lines.") };

type WindowArgs = { window?: string; from?: string; to?: string };

function windowOf(args: WindowArgs): Window {
  return parseWindow({ w: args.window, from: args.from, to: args.to });
}

function describeWindow(window: Window) {
  return { label: windowLabel(window), ...windowRange(window) };
}

function json(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

function refuse(text: string) {
  return { content: [{ type: "text" as const, text }], isError: true };
}

const pct = (now: number, was: number) => (was === 0 ? null : Math.round(((now - was) / was) * 100));

/**
 * One member's summary as `reader` sees it: the numbers are exactly the tiles on their page for that
 * reader, and the place is the global board's, which every signed-in member can open.
 */
async function summary(userId: number, window: Window, metric: Metric, isOwner: boolean, includePrivate: boolean, viewer: BoardViewer) {
  const [{ row, before }, board] = await Promise.all([userStats(userId, window, isOwner, includePrivate, viewer), globalBoard(window)]);
  const place = standing(rankBy(board, metric), metric, userId);
  const was = { commits: before?.commits ?? 0, additions: before?.additions ?? 0, deletions: before?.deletions ?? 0, activeRepos: before?.activeRepos ?? 0 };
  return {
    login: row.login,
    window: describeWindow(window),
    commits: row.commits,
    additions: row.additions,
    deletions: row.deletions,
    lines: row.additions + row.deletions,
    activeRepos: row.activeRepos,
    streakDays: row.streak,
    stars: row.stars,
    topLanguage: row.topLanguage,
    globalBoard: place
      ? { metric, rank: place.rank, of: place.total, topPercent: place.total >= PERCENTILE_FROM ? place.percentile : null }
      : null,
    previousPeriod: {
      ...was,
      changePercent: {
        commits: pct(row.commits, was.commits),
        lines: pct(row.additions + row.deletions, was.additions + was.deletions),
        activeRepos: pct(row.activeRepos, was.activeRepos),
      },
    },
  };
}

/** Registers every tool on a server built for one request. `ownerOf` reads the verified token's user. */
export function registerTools(server: McpServer, ownerOf: (clientId: string | undefined) => number | null): void {
  const run = <A>(fn: (userId: number, args: A) => Promise<ReturnType<typeof json> | ReturnType<typeof refuse>>) =>
    async (args: A, ctx: { http?: { authInfo?: { clientId: string } } }) => {
      const userId = ownerOf(ctx.http?.authInfo?.clientId);
      if (userId === null) return refuse("not signed in");
      after(() => countStep("mcp_call"));
      return fn(userId, args);
    };
  const readOnly = { readOnlyHint: true, openWorldHint: false };

  server.registerTool(
    "my_summary",
    {
      title: "My summary",
      description:
        "Your own totals for a window: commits, lines added/deleted, active repos, streak, stars, top language, your place on the global board, and the change against the same stretch of the period before, cut at the same point: Monday to today against last Monday to the same weekday, the 1st to today against the 1st to the same day last month.",
      inputSchema: z.object({ ...windowArgs, ...metricArg }),
      annotations: readOnly,
    },
    run(async (userId, args: WindowArgs & { metric?: string }) => json(await summary(userId, windowOf(args), parseMetric(args.metric), true, true, "own"))),
  );

  server.registerTool(
    "my_daily",
    {
      title: "My days",
      description:
        "Your lines or commits per day. `counted` came from a linked computer that counts days exactly; `spread` is a weekly figure GitHub reported for a repo that is on no linked computer, laid over that week's days. Never treat `spread` as counted.",
      inputSchema: z.object({ ...windowArgs, ...metricArg }),
      annotations: readOnly,
    },
    run(async (userId, args: WindowArgs & { metric?: string }) => {
      const window = windowOf(args);
      const metric = parseMetric(args.metric);
      const span = windowRange(window);
      const rows = await userDailyLines(userId, span.from, span.to, true);
      const days = rows.map((d) =>
        metric === "lines"
          ? {
              date: d.date,
              counted: { additions: d.additions - d.spreadAdditions, deletions: d.deletions - d.spreadDeletions },
              spread: { additions: d.spreadAdditions, deletions: d.spreadDeletions },
            }
          : { date: d.date, counted: { commits: d.commits - d.spreadCommits }, spread: { commits: d.spreadCommits } },
      );
      return json({ window: describeWindow(window), metric, days });
    }),
  );

  server.registerTool(
    "my_repos",
    {
      title: "My repos",
      description:
        "Your per-repo totals for a window, largest first. A repo counted on your computer without its name sent shows as private-<hash>; that is the only name the server has.",
      inputSchema: z.object({ ...windowArgs, ...metricArg }),
      annotations: readOnly,
    },
    run(async (userId, args: WindowArgs & { metric?: string }) => {
      const window = windowOf(args);
      const metric = parseMetric(args.metric);
      const repos = (await userRepos(userId, window, true)).map((r) => ({
        repo: r.nameWithOwner,
        private: r.isPrivate,
        language: r.primaryLanguage,
        commits: r.commits,
        additions: r.additions,
        deletions: r.deletions,
        lines: r.additions + r.deletions,
      }));
      repos.sort((a, b) => (metric === "lines" ? b.lines - a.lines : b.commits - a.commits));
      return json({ window: describeWindow(window), metric, repos });
    }),
  );

  server.registerTool(
    "my_crews",
    {
      title: "My crews",
      description: "The crews you are in, with their invite codes and member counts. Pass a code to crew_board.",
      inputSchema: z.object({}),
      annotations: readOnly,
    },
    run(async (userId) => {
      const crews = await userCrews(userId);
      const sizes = await Promise.all(crews.map((c) => crewMemberIds(c.id)));
      return json({ crews: crews.map((c, i) => ({ name: c.name, code: c.code, members: sizes[i].length })) });
    }),
  );

  server.registerTool(
    "crew_board",
    {
      title: "Crew board",
      description: "The ranking for one of your crews over a window, as the crew board shows it to members.",
      inputSchema: z.object({ code: z.string().describe("The crew's invite code, from my_crews."), ...windowArgs, ...metricArg }),
      annotations: readOnly,
    },
    run(async (userId, args: WindowArgs & { metric?: string; code: string }) => {
      const crew = await crewByCode(args.code.toUpperCase());
      if (!crew || !(await isMember(crew.id, userId))) return refuse("no crew of yours has that code");
      const window = windowOf(args);
      const metric = parseMetric(args.metric);
      const rows = rankBy(await crewBoard(crew.id, window), metric);
      return json({
        crew: crew.name,
        window: describeWindow(window),
        metric,
        board: rows.map((r, i) => ({
          rank: i + 1,
          login: r.login,
          name: r.name,
          commits: r.commits,
          additions: r.additions,
          deletions: r.deletions,
          lines: r.additions + r.deletions,
          activeRepos: r.activeRepos,
          streakDays: r.streak,
          stars: r.stars,
          topLanguage: r.topLanguage,
        })),
      });
    }),
  );

  server.registerTool(
    "member_summary",
    {
      title: "Member summary",
      description: "Another member's summary, exactly as their gitstats page shows it to you. Refused when their page is closed to you.",
      inputSchema: z.object({ login: z.string().describe("Their GitHub login."), ...windowArgs, ...metricArg }),
      annotations: readOnly,
    },
    run(async (userId, args: WindowArgs & { metric?: string; login: string }) => {
      const user = await userByLogin(args.login);
      if (!user) return refuse(`no gitstats member called ${args.login}`);
      // The same gate and the same column of the visibility matrix as /dashboard/u/<login>.
      const isOwner = user.id === userId;
      const crewmate = isOwner || (await sharesCrew(userId, user.id));
      if (!crewmate && user.profileVisibility === "crew") return refuse(`${user.githubLogin} only shares their page with crewmates`);
      const includePrivate = isOwner || (crewmate ? user.sharePrivate : user.sharePrivateGlobal);
      return json(await summary(user.id, windowOf(args), parseMetric(args.metric), isOwner, includePrivate, crewmate ? "crew" : "global"));
    }),
  );
}
