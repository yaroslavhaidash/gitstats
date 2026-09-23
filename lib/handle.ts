import { cache } from "react";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { handleCache, users, type HandleData } from "@/db/schema";
import { readRateLimit, serverToken, type RateLimit } from "./github";
import { rateLimit } from "./ratelimit";
import { QUOTA_FLOOR } from "./snapshot";

/**
 * `/gh/<login>` is the one page that calls GitHub on a visit, because it exists for people who are
 * not members yet and so have no snapshot. One GraphQL call per handle per day, cached in
 * `handle_cache`; everything after that first view reads Postgres like every other page.
 */

const TTL_MS = 24 * 3_600_000;
const WEEKS = 26;
/** Days listed per repo; the weekly chart is short for a repo more active than this. */
const DAYS_PER_REPO = 100;
const TOP_REPOS = 5;

/** GitHub's own rule: 1–39 characters, alphanumerics and single inner hyphens. */
const LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;

export function validLogin(login: string): boolean {
  return LOGIN.test(login);
}

// The snapshot's discovery query plus the per-day commit counts a weekly chart needs, which the
// snapshot has no use for: it reads lines from `stats/contributors` instead.
const HANDLE_QUERY = `
query($login:String!, $from:DateTime!, $to:DateTime!) {
  user(login:$login) {
    login name avatarUrl
    contributionsCollection(from:$from, to:$to) {
      totalCommitContributions
      contributionCalendar { weeks { contributionDays { date contributionCount } } }
      commitContributionsByRepository(maxRepositories:100) {
        repository { nameWithOwner stargazerCount isPrivate primaryLanguage { name } }
        contributions(first:${DAYS_PER_REPO}, orderBy:{field:OCCURRED_AT, direction:DESC}) { totalCount nodes { occurredAt commitCount } }
      }
    }
  }
}`;

type HandleResponse = {
  data?: {
    user: {
      login: string;
      name: string | null;
      avatarUrl: string;
      contributionsCollection: {
        totalCommitContributions: number;
        contributionCalendar: { weeks: { contributionDays: { date: string; contributionCount: number }[] }[] };
        commitContributionsByRepository: {
          repository: { nameWithOwner: string; stargazerCount: number; isPrivate: boolean; primaryLanguage: { name: string } | null };
          contributions: { totalCount: number; nodes: { occurredAt: string; commitCount: number }[] };
        }[];
      };
    } | null;
  };
  errors?: { type?: string; message: string }[];
};

/** The Sunday that opens `date`'s week, the bucket every weekly chart on the site uses. */
function sundayOf(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  return new Date(d.getTime() - d.getUTCDay() * 86_400_000).toISOString().slice(0, 10);
}

/** Consecutive active days ending today, or yesterday while today is still empty. */
function streakOf(days: number[]): number {
  let i = days.length - 1;
  if (i >= 0 && days[i] === 0) i -= 1;
  let n = 0;
  while (i >= 0 && days[i] > 0) {
    n += 1;
    i -= 1;
  }
  return n;
}

function shape(user: NonNullable<NonNullable<HandleResponse["data"]>["user"]>, now: Date): HandleData {
  const c = user.contributionsCollection;
  const today = now.toISOString().slice(0, 10);
  const days = c.contributionCalendar.weeks.flatMap((w) => w.contributionDays).filter((d) => d.date <= today);
  const thisSunday = sundayOf(today);
  const weekStarts = Array.from({ length: WEEKS }, (_, i) =>
    new Date(new Date(`${thisSunday}T00:00:00Z`).getTime() - (WEEKS - 1 - i) * 7 * 86_400_000).toISOString().slice(0, 10),
  );
  const perWeek = new Map(weekStarts.map((w) => [w, 0]));
  const languages = new Map<string, number>();
  const repos: HandleData["repos"] = [];
  let weeksPartial = false;
  for (const { repository: r, contributions } of c.commitContributionsByRepository) {
    if (r.isPrivate) continue;
    // `totalCount` is the repo's commits in the year; the nodes are its newest active days.
    const commits = contributions.totalCount;
    let listed = 0;
    for (const node of contributions.nodes) {
      listed += node.commitCount;
      const week = sundayOf(node.occurredAt.slice(0, 10));
      if (perWeek.has(week)) perWeek.set(week, (perWeek.get(week) ?? 0) + node.commitCount);
    }
    if (listed < commits) weeksPartial = true;
    const language = r.primaryLanguage?.name ?? null;
    if (language) languages.set(language, (languages.get(language) ?? 0) + commits);
    repos.push({ nameWithOwner: r.nameWithOwner, commits, stars: r.stargazerCount, language });
  }
  repos.sort((a, b) => b.commits - a.commits);
  const topLanguage = [...languages].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const counts = days.map((d) => d.contributionCount);
  return {
    login: user.login,
    name: user.name,
    avatarUrl: user.avatarUrl,
    days: counts,
    weeks: weekStarts.map((weekStart) => ({ weekStart, commits: perWeek.get(weekStart) ?? 0 })),
    streak: streakOf(counts),
    topLanguage,
    totalCommits: c.totalCommitContributions,
    weeksPartial,
    repos: repos.slice(0, TOP_REPOS),
  };
}

/** The server token's GraphQL budget as the last handle fetch saw it, so the guard can refuse early. */
let lastQuota: RateLimit | null = null;

function quotaLow(now: number): boolean {
  return lastQuota !== null && lastQuota.remaining < QUOTA_FLOOR && lastQuota.resetAt.getTime() > now;
}

async function fetchHandle(login: string, now: Date): Promise<HandleData | null> {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `Bearer ${serverToken()}`, "Content-Type": "application/json", "User-Agent": "gitstats-handle" },
    body: JSON.stringify({
      query: HANDLE_QUERY,
      variables: { login, from: new Date(now.getTime() - 365 * 86_400_000).toISOString(), to: now.toISOString() },
    }),
  });
  lastQuota = readRateLimit(res) ?? lastQuota;
  if (!res.ok) throw new Error(`GraphQL HTTP ${res.status} for ${login}`);
  const body: HandleResponse = await res.json();
  if (body.errors?.some((e) => e.type === "NOT_FOUND")) return null;
  if (body.errors?.length) throw new Error(`GraphQL ${login}: ${body.errors.map((e) => e.message).join("; ")}`);
  const user = body.data?.user;
  return user ? shape(user, now) : null;
}

export type HandleResult =
  | { status: "ok"; data: HandleData; memberViewed: boolean }
  | { status: "missing" }
  | { status: "busy" };

/**
 * A handle's page data: the cache when it is under a day old, otherwise one GitHub call if this
 * visitor, everyone together and the server token all have room for it. When they do not, a stale
 * cached page still serves; only a handle never seen before gets "busy". Deduped per request, so
 * the page and its metadata spend one fetch between them.
 */
export const getHandle = cache(async (rawLogin: string, ip: string): Promise<HandleResult> => {
  const login = rawLogin.toLowerCase();
  if (!validLogin(login)) return { status: "missing" };
  const [cached] = await db.select().from(handleCache).where(eq(handleCache.login, login)).limit(1);
  const now = new Date();
  const served = (row: typeof cached): HandleResult => (row.data ? { status: "ok", data: row.data, memberViewed: row.memberViewed } : { status: "missing" });
  if (cached && now.getTime() - cached.fetchedAt.getTime() < TTL_MS) {
    console.log(`[handle] cache hit ${login}`);
    return served(cached);
  }
  const allowed = !quotaLow(now.getTime()) && rateLimit("handle", ip).ok && rateLimit("handleGlobal", "all").ok;
  if (!allowed) {
    console.log(`[handle] busy ${login}${cached ? ", serving stale cache" : ""}`);
    return cached ? served(cached) : { status: "busy" };
  }
  let data: HandleData | null;
  try {
    data = await fetchHandle(login, now);
  } catch (error) {
    console.error(`[handle] fetch failed ${login}: ${error instanceof Error ? error.message : String(error)}`);
    return cached ? served(cached) : { status: "busy" };
  }
  console.log(`[handle] fetched ${login}${data ? "" : " (no such user)"}, graphql remaining ${lastQuota?.remaining ?? "?"}`);
  await db
    .insert(handleCache)
    .values({ login, data, fetchedAt: now })
    .onConflictDoUpdate({ target: handleCache.login, set: { data, fetchedAt: now } });
  return data ? { status: "ok", data, memberViewed: cached?.memberViewed ?? false } : { status: "missing" };
});

/** The cached page only, for the OG image: an unfurl must never be what spends a GitHub call. */
export async function cachedHandle(rawLogin: string): Promise<HandleData | null> {
  const [row] = await db.select({ data: handleCache.data }).from(handleCache).where(eq(handleCache.login, rawLogin.toLowerCase())).limit(1);
  return row?.data ?? null;
}

export async function markMemberViewed(login: string): Promise<void> {
  await db.update(handleCache).set({ memberViewed: true }).where(and(eq(handleCache.login, login.toLowerCase()), eq(handleCache.memberViewed, false)));
}

/** The member behind a GitHub login, if there is one; the demo crew has no GitHub account. */
export async function memberLogin(login: string): Promise<string | null> {
  const [row] = await db
    .select({ login: users.githubLogin })
    .from(users)
    .where(and(sql`lower(${users.githubLogin}) = ${login.toLowerCase()}`, eq(users.isDemo, false)))
    .limit(1);
  return row?.login ?? null;
}
