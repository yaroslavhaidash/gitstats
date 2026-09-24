import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { publicMemberStats } from "./cached";
import { cachedHandle, getHandle, validLogin } from "./handle";
import { periodBounds, type Window } from "./window";

/**
 * One side of `/vs/<a>/<b>`. A member whose profile is open to everyone shows what a stranger may
 * see of them on gitstats; everyone else, members with a crew-only profile included, shows exactly
 * what `/gh/<login>` shows: public GitHub numbers and no lines.
 */
export type VsSide = {
  login: string;
  name: string | null;
  avatarUrl: string;
  source: "gitstats" | "github";
  commits: number;
  /** Null for a public-GitHub side: GitHub gives lines per repo only through `stats/contributors`. */
  lines: { additions: number; deletions: number } | null;
  streak: number;
  topLanguage: string | null;
  /** Contributions per day, oldest first, ending today. */
  days: number[];
};

export type VsResult = { status: "ok"; side: VsSide } | { status: "missing"; login: string } | { status: "busy"; login: string };

/** A non-demo member whose profile anyone may open. */
async function openMember(login: string) {
  const [row] = await db
    .select({ id: users.id, login: users.githubLogin, name: users.name, avatarUrl: users.avatarUrl })
    .from(users)
    .where(and(sql`lower(${users.githubLogin}) = ${login.toLowerCase()}`, eq(users.isDemo, false), eq(users.profileVisibility, "everyone")))
    .limit(1);
  return row ?? null;
}

async function memberSide(member: NonNullable<Awaited<ReturnType<typeof openMember>>>, window: Window): Promise<VsSide> {
  const { row, year } = await publicMemberStats(member.id, window);
  return {
    login: member.login,
    name: member.name,
    avatarUrl: member.avatarUrl,
    source: "gitstats",
    commits: row.commits,
    lines: { additions: row.additions, deletions: row.deletions },
    streak: row.streak,
    topLanguage: row.topLanguage,
    days: year,
  };
}

/** Public commits inside the window: the year total GitHub reports, or the listed days for week and month. */
function windowCommits(commitDays: Record<string, number>, totalCommits: number, window: Window): number {
  if (window.kind === "preset" && window.value === "year") return totalCommits;
  const { from, to } = periodBounds(window).current;
  return Object.entries(commitDays).reduce((sum, [day, n]) => (day >= from && day <= to ? sum + n : sum), 0);
}

/** A pair is two of these, so it spends the same `/gh` cache and rate limits as two handle views. */
export async function vsSide(rawLogin: string, window: Window, ip: string): Promise<VsResult> {
  const login = rawLogin.trim();
  if (!validLogin(login)) return { status: "missing", login };
  const member = await openMember(login);
  if (member) return { status: "ok", side: await memberSide(member, window) };
  const handle = await getHandle(login, ip);
  if (handle.status !== "ok") return { status: handle.status, login };
  const { data } = handle;
  return {
    status: "ok",
    side: {
      login: data.login,
      name: data.name,
      avatarUrl: data.avatarUrl,
      source: "github",
      commits: windowCommits(data.commitDays ?? {}, data.totalCommits, window),
      lines: null,
      streak: data.streak,
      topLanguage: data.topLanguage,
      days: data.days,
    },
  };
}

/** The OG image's side: year numbers from Postgres only, never a GitHub call. */
export async function cachedVsSide(login: string): Promise<VsSide | null> {
  const year: Window = { kind: "preset", value: "year" };
  const member = validLogin(login) ? await openMember(login) : null;
  if (member) return memberSide(member, year);
  const data = await cachedHandle(login);
  if (!data) return null;
  return { login: data.login, name: data.name, avatarUrl: data.avatarUrl, source: "github", commits: data.totalCommits, lines: null, streak: data.streak, topLanguage: data.topLanguage, days: data.days };
}
