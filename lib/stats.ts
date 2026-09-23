import { and, between, desc, eq, gte, inArray, isNotNull, sql, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { cliTokens, dailyContributions, dailyLocal, repoNameOverrides, repos, snapshotRuns, users, userTokens, weeklyStats, type RepoNames } from "@/db/schema";
import { daysAgo, shiftDate, sundayOf, weekRange, type Metric, type Range, type Window } from "./window";

export const HEATMAP_DAYS = 84;
/** The share card gives the strip the whole card width, so it carries half a year instead of 12 weeks. */
export const SHARE_HEATMAP_DAYS = 182;

export type BoardRow = {
  userId: number;
  login: string;
  avatarUrl: string;
  name: string | null;
  commits: number;
  additions: number;
  deletions: number;
  activeRepos: number;
  /** Work on unmerged branches, counted by the CLI. Shown on the owner's page, never ranked. */
  pendingCommits: number;
  pendingAdditions: number;
  pendingDeletions: number;
  stars: number;
  streak: number;
  topLanguage: string | null;
  /** Contribution count per day, oldest first, as long as the caller's `heatmapDays`. */
  days: number[];
};

/**
 * Who a board covers. `null` means everyone, which is the one place the seeded demo crew has to be
 * kept out: its members are real rows with invented numbers, and they would otherwise rank on the
 * global board. An explicit list is always deliberate, including the demo pages' own.
 */
function scope(userIds: number[] | null) {
  return userIds === null ? eq(users.isDemo, false) : inArray(users.id, userIds);
}

/** A star count is about repos someone still works on, so it reads a year, not all history. */
const STARS_DAYS = 365;

async function starsByUser(userIds: number[] | null, viewer: BoardViewer): Promise<Map<number, number>> {
  const touched = db
    .selectDistinct({ userId: weeklyStats.userId, repoNodeId: weeklyStats.repoNodeId })
    .from(weeklyStats)
    .where(and(gte(weeklyStats.weekStart, daysAgo(STARS_DAYS)), userIds === null ? undefined : inArray(weeklyStats.userId, userIds)))
    .as("touched");
  const rows = await db
    .select({ userId: touched.userId, stars: sql<number>`coalesce(sum(${repos.stargazerCount}), 0)::int` })
    .from(touched)
    .innerJoin(repos, eq(repos.githubNodeId, touched.repoNodeId))
    .innerJoin(users, and(eq(users.id, touched.userId), sharedRepo(viewer)))
    .groupBy(touched.userId);
  return new Map(rows.map((r) => [r.userId, r.stars]));
}

async function topLanguageByUser(userIds: number[] | null, weeks: Range, viewer: BoardViewer): Promise<Map<number, string>> {
  const rows = await db
    .select({
      userId: weeklyStats.userId,
      language: repos.primaryLanguage,
      commits: sql<number>`sum(${weeklyStats.commits})::int`,
    })
    .from(weeklyStats)
    .innerJoin(repos, eq(repos.githubNodeId, weeklyStats.repoNodeId))
    .innerJoin(users, and(eq(users.id, weeklyStats.userId), sharedRepo(viewer)))
    .where(
      and(
        between(weeklyStats.weekStart, weeks.from, weeks.to),
        sql`${repos.primaryLanguage} is not null`,
        userIds === null ? undefined : inArray(weeklyStats.userId, userIds),
      ),
    )
    .groupBy(weeklyStats.userId, repos.primaryLanguage)
    .orderBy(desc(sql`sum(${weeklyStats.commits})`));
  const top = new Map<number, string>();
  for (const r of rows) if (r.language && !top.has(r.userId)) top.set(r.userId, r.language);
  return top;
}

type DailyRow = { userId: number; date: string; count: number };

/**
 * Calendar = GitHub's public contribution calendar + commits the member's own machine counted in
 * private repos. Public repos are GitHub's job, private ones the CLI's, so nothing is counted twice.
 * The private half is gated by `sharedRepo(viewer)`, so a calendar never shows days this viewer is
 * not allowed to see — the shape of a work week is as private as the numbers beside it.
 */
async function dailyByUser(userIds: number[] | null, since: string, viewer: BoardViewer): Promise<Map<number, Map<string, number>>> {
  const [github, local] = await Promise.all([
    db
      .select({ userId: dailyContributions.userId, date: dailyContributions.date, count: dailyContributions.contributionCount })
      .from(dailyContributions)
      .where(and(gte(dailyContributions.date, since), userIds === null ? undefined : inArray(dailyContributions.userId, userIds))),
    db
      .select({ userId: dailyLocal.userId, date: dailyLocal.date, count: sql<number>`sum(${dailyLocal.commits})::int` })
      .from(dailyLocal)
      .innerJoin(repos, and(eq(repos.githubNodeId, dailyLocal.repoNodeId), eq(repos.isPrivate, true)))
      .innerJoin(users, and(eq(users.id, dailyLocal.userId), sharedRepo(viewer)))
      .where(and(gte(dailyLocal.date, since), userIds === null ? undefined : inArray(dailyLocal.userId, userIds)))
      .groupBy(dailyLocal.userId, dailyLocal.date),
  ]);
  const byUser = new Map<number, Map<string, number>>();
  for (const r of [...github, ...local] as DailyRow[]) {
    const m = byUser.get(r.userId) ?? new Map<string, number>();
    m.set(r.date, (m.get(r.date) ?? 0) + r.count);
    byUser.set(r.userId, m);
  }
  return byUser;
}

/**
 * Consecutive active days ending today or yesterday, per user, in one query.
 * Same merged calendar as `dailyByUser`: GitHub's public days plus the CLI's private-repo days.
 *
 * Each date becomes a position on the user's own timeline: its day number for `all_days`, or the
 * count of weekdays before it for `weekdays`, which drops Saturday and Sunday so Friday and the
 * next Monday sit next to each other. A run is then a stretch where `position + rank` is constant
 * when ranked newest first, and the run is alive when it reaches the last position or the one
 * before it. Saturday and Sunday share a weekday position with the following Monday, so a Friday
 * streak looked at over the weekend is still alive.
 */
const WEEKDAY_EPOCH = sql`date '2000-01-03'`; // a Monday, so week arithmetic starts at 0
/**
 * How far back the streak query reads. A streak is only ever shown as a run ending today or
 * yesterday, so nothing beyond this can change the answer short of a 400-day run, and the floor
 * keeps the scan proportional to the window rather than to all history.
 */
const STREAK_DAYS = 400;

function timelinePosition(date: SQL | PgColumn): SQL {
  return sql`case when u.streak_mode = 'weekdays'
    then ((${date} - ${WEEKDAY_EPOCH}) / 7) * 5 + least((${date} - ${WEEKDAY_EPOCH}) % 7, 5)
    else ${date} - ${WEEKDAY_EPOCH} end`;
}

async function streakByUser(userIds: number[] | null, viewer: BoardViewer): Promise<Map<number, number>> {
  const scoped = userIds === null ? sql`true` : sql`a.user_id in ${userIds}`;
  const today = sql`(now() at time zone 'utc')::date`;
  const rows = await db.execute<{ user_id: number; streak: number }>(sql`
    with active as (
      select ${dailyContributions.userId} as user_id, ${dailyContributions.date} as date
      from ${dailyContributions}
      where ${dailyContributions.contributionCount} > 0
      union
      select ${dailyLocal.userId} as user_id, ${dailyLocal.date} as date
      from ${dailyLocal}
      join ${repos} on ${repos.githubNodeId} = ${dailyLocal.repoNodeId} and ${repos.isPrivate}
      join ${users} on ${users.id} = ${dailyLocal.userId} and ${sharedRepo(viewer)}
      where ${dailyLocal.commits} > 0
    ),
    placed as (
      select a.user_id, ${timelinePosition(sql`a.date`)} as pos, ${timelinePosition(today)} as now_pos
      from active a
      join ${users} u on u.id = a.user_id
      where ${scoped}
        and a.date <= ${today}
        and a.date >= ${today} - ${STREAK_DAYS}::int
        and (u.streak_mode <> 'weekdays' or extract(isodow from a.date) < 6)
    ),
    ranked as (
      select user_id, pos, now_pos, pos + (row_number() over (partition by user_id order by pos desc)) as run
      from placed
    ),
    runs as (
      select user_id, run, count(*)::int as len, max(pos) as last_pos, min(now_pos) as now_pos
      from ranked group by user_id, run
    )
    select distinct on (user_id) user_id, len as streak
    from runs
    where last_pos >= now_pos - 1
    order by user_id, last_pos desc
  `);
  return new Map(rows.rows.map((r) => [Number(r.user_id), Number(r.streak)]));
}

export function lastDays(days: Map<string, number>, n: number, now = new Date()): number[] {
  const out: number[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(days.get(daysAgo(i, now)) ?? 0);
  return out;
}

/** Average contributions per weekday (Sunday first) across an inclusive date range. */
export function weekdayAverages(days: Map<string, number>, from: string, to: string): number[] {
  const sums = Array<number>(7).fill(0);
  const counts = Array<number>(7).fill(0);
  const end = Date.parse(`${to}T00:00:00Z`);
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= end; t += 86_400_000) {
    const d = new Date(t);
    sums[d.getUTCDay()] += days.get(d.toISOString().slice(0, 10)) ?? 0;
    counts[d.getUTCDay()] += 1;
  }
  return sums.map((sum, i) => (counts[i] === 0 ? 0 : sum / counts[i]));
}

/** Which column of the visibility matrix applies: crewmates, everyone else, or the member themselves. */
export type BoardViewer = "crew" | "global" | "own";

/**
 * Rows on boards are always "as seen by others": private repos only count when the member shares
 * them with this kind of viewer. `own` is the member reading their own page, where nothing is held
 * back — the same reason `ownTotals` ignores the matrix.
 */
function sharedRepo(viewer: BoardViewer) {
  if (viewer === "own") return sql`true`;
  return sql`(${repos.isPrivate} = false or ${viewer === "crew" ? users.sharePrivate : users.sharePrivateGlobal})`;
}

export async function boardRows(userIds: number[] | null, window: Window, viewer: BoardViewer, now = new Date(), heatmapDays = HEATMAP_DAYS): Promise<BoardRow[]> {
  const weeks = weekRange(window, now);
  const [totals, stars, languages, daily, streaks] = await Promise.all([
    db
      .select({
        userId: users.id,
        login: users.githubLogin,
        avatarUrl: users.avatarUrl,
        name: users.name,
        commits: sql<number>`coalesce(sum(${weeklyStats.commits}) filter (where ${repos.githubNodeId} is not null), 0)::int`,
        additions: sql<number>`coalesce(sum(${weeklyStats.additions}) filter (where ${repos.githubNodeId} is not null), 0)::int`,
        deletions: sql<number>`coalesce(sum(${weeklyStats.deletions}) filter (where ${repos.githubNodeId} is not null), 0)::int`,
        activeRepos: sql<number>`count(distinct ${weeklyStats.repoNodeId}) filter (where ${weeklyStats.commits} > 0 and ${repos.githubNodeId} is not null)::int`,
        pendingCommits: sql<number>`coalesce(sum(${weeklyStats.pendingCommits}) filter (where ${repos.githubNodeId} is not null), 0)::int`,
        pendingAdditions: sql<number>`coalesce(sum(${weeklyStats.pendingAdditions}) filter (where ${repos.githubNodeId} is not null), 0)::int`,
        pendingDeletions: sql<number>`coalesce(sum(${weeklyStats.pendingDeletions}) filter (where ${repos.githubNodeId} is not null), 0)::int`,
      })
      .from(users)
      .leftJoin(weeklyStats, and(eq(weeklyStats.userId, users.id), between(weeklyStats.weekStart, weeks.from, weeks.to)))
      .leftJoin(repos, and(eq(repos.githubNodeId, weeklyStats.repoNodeId), sharedRepo(viewer)))
      .where(scope(userIds))
      .groupBy(users.id),
    starsByUser(userIds, viewer),
    topLanguageByUser(userIds, weeks, viewer),
    dailyByUser(userIds, daysAgo(heatmapDays), viewer),
    streakByUser(userIds, viewer),
  ]);
  const empty = new Map<string, number>();
  return totals
    .map((t) => {
      const days = daily.get(t.userId) ?? empty;
      return {
        ...t,
        stars: stars.get(t.userId) ?? 0,
        topLanguage: languages.get(t.userId) ?? null,
        streak: streaks.get(t.userId) ?? 0,
        days: lastDays(days, heatmapDays),
      };
    })
    .sort((a, b) => b.commits - a.commits || b.additions - a.additions || a.login.localeCompare(b.login));
}

/** The board's order follows whatever the reader is comparing on, so the table and the charts agree. */
export function rankBy<T extends { commits: number; additions: number; deletions: number; login: string }>(rows: T[], metric: Metric): T[] {
  const value = (r: T) => (metric === "lines" ? r.additions + r.deletions : r.commits);
  return [...rows].sort((a, b) => value(b) - value(a) || b.commits - a.commits || a.login.localeCompare(b.login));
}

export type RankedRow = BoardRow & {
  /** Commits in the period of the same length just before this one; the board's momentum arrow reads it. */
  prevCommits: number;
  /** Lines touched in that same earlier period, so a lines-ranked board can say how many places you moved. */
  prevLines: number;
};

export type PeriodTotals = { commits: number; lines: number };

/**
 * Below this many members a percentile is coarser than the place it describes — "top 34%" for the
 * leader of a board of three — so every surface prints the bare place instead.
 */
export const PERCENTILE_FROM = 10;

export type Standing = {
  /** 1-based place on the board for the chosen metric — the same number the table prints. */
  rank: number;
  total: number;
  /**
   * "top N%". Rounded up, so a board of twelve calls its leader top 9% rather than top 8%: the
   * claim a reader repeats out loud should never flatter them by a rounding.
   */
  percentile: number;
  /** Lines or commits over the window, whichever the board is ranked by. */
  value: number;
  /** Places gained (+) or lost (−) against the same-length period before; null when that period was empty for everyone. */
  movement: number | null;
};

/**
 * Where one member sits on a board that has already been fetched. Pure: it re-ranks the rows the
 * page is drawing, so the percentile and the row number can never disagree, and the same
 * visibility gating (`boardRows(viewer)`) applies to both by construction.
 */
export function standing(rows: RankedRow[], metric: Metric, userId: number): Standing | null {
  const ranked = rankBy(rows, metric);
  const index = ranked.findIndex((r) => r.userId === userId);
  if (index < 0 || ranked.length === 0) return null;
  const me = ranked[index];
  // The previous period ranked the same way: the earlier totals stand in for the current ones.
  const before = rankBy(rows.map((r) => ({ ...r, commits: r.prevCommits, additions: r.prevLines, deletions: 0 })), metric);
  const wasIndex = before.findIndex((r) => r.userId === userId);
  const anyBefore = before.some((r) => r.commits > 0 || r.additions > 0);
  return {
    rank: index + 1,
    total: ranked.length,
    percentile: Math.max(1, Math.ceil(((index + 1) / ranked.length) * 100)),
    value: metric === "lines" ? me.additions + me.deletions : me.commits,
    movement: anyBefore && wasIndex >= 0 ? wasIndex - index : null,
  };
}

/** Commits and lines per member over a window — the cheap half of `boardRows`, for comparing two periods. */
export async function periodTotalsByUser(userIds: number[] | null, window: Window, viewer: BoardViewer, now = new Date()): Promise<Map<number, PeriodTotals>> {
  const weeks = weekRange(window, now);
  const rows = await db
    .select({
      userId: users.id,
      commits: sql<number>`coalesce(sum(${weeklyStats.commits}), 0)::int`,
      lines: sql<number>`coalesce(sum(${weeklyStats.additions} + ${weeklyStats.deletions}), 0)::int`,
    })
    .from(users)
    .leftJoin(weeklyStats, and(eq(weeklyStats.userId, users.id), between(weeklyStats.weekStart, weeks.from, weeks.to)))
    .leftJoin(repos, and(eq(repos.githubNodeId, weeklyStats.repoNodeId), sharedRepo(viewer)))
    .where(and(scope(userIds), isNotNull(repos.githubNodeId)))
    .groupBy(users.id);
  return new Map(rows.map((r) => [r.userId, { commits: r.commits, lines: r.lines }]));
}

export type WeekRow = {
  weekStart: string;
  additions: number;
  deletions: number;
  commits: number;
  pendingAdditions: number;
  pendingDeletions: number;
};

/** Weekly buckets whose Sunday falls in `[from, to]`; the chart decides that span from the window. */
export async function weeklyTotals(userId: number, from: string, to: string, includePrivate: boolean): Promise<WeekRow[]> {
  return db
    .select({
      weekStart: weeklyStats.weekStart,
      additions: sql<number>`sum(${weeklyStats.additions})::int`,
      deletions: sql<number>`sum(${weeklyStats.deletions})::int`,
      commits: sql<number>`sum(${weeklyStats.commits})::int`,
      pendingAdditions: sql<number>`sum(${weeklyStats.pendingAdditions})::int`,
      pendingDeletions: sql<number>`sum(${weeklyStats.pendingDeletions})::int`,
    })
    .from(weeklyStats)
    .innerJoin(repos, eq(repos.githubNodeId, weeklyStats.repoNodeId))
    .where(and(eq(weeklyStats.userId, userId), between(weeklyStats.weekStart, from, to), includePrivate ? undefined : eq(repos.isPrivate, false)))
    .groupBy(weeklyStats.weekStart)
    .orderBy(weeklyStats.weekStart);
}

export type RepoRow = {
  nodeId: string;
  nameWithOwner: string;
  primaryLanguage: string | null;
  stargazerCount: number;
  isFork: boolean;
  isPrivate: boolean;
  statsPending: boolean;
  commits: number;
  additions: number;
  deletions: number;
};

export async function userRepos(userId: number, window: Window, includePrivate: boolean): Promise<RepoRow[]> {
  const weeks = weekRange(window);
  return db
    .select({
      nodeId: repos.githubNodeId,
      nameWithOwner: repos.nameWithOwner,
      primaryLanguage: repos.primaryLanguage,
      stargazerCount: repos.stargazerCount,
      isFork: repos.isFork,
      isPrivate: repos.isPrivate,
      statsPending: repos.statsPending,
      commits: sql<number>`sum(${weeklyStats.commits})::int`,
      additions: sql<number>`sum(${weeklyStats.additions})::int`,
      deletions: sql<number>`sum(${weeklyStats.deletions})::int`,
    })
    .from(weeklyStats)
    .innerJoin(repos, eq(repos.githubNodeId, weeklyStats.repoNodeId))
    .where(and(eq(weeklyStats.userId, userId), between(weeklyStats.weekStart, weeks.from, weeks.to), includePrivate ? undefined : eq(repos.isPrivate, false)))
    .groupBy(repos.githubNodeId)
    .orderBy(desc(sql`sum(${weeklyStats.commits})`));
}

/** The owner's own totals, private repos always included. */
export async function ownTotals(userId: number, window: Window, now = new Date()) {
  const weeks = weekRange(window, now);
  const [row] = await db
    .select({
      commits: sql<number>`coalesce(sum(${weeklyStats.commits}), 0)::int`,
      additions: sql<number>`coalesce(sum(${weeklyStats.additions}), 0)::int`,
      deletions: sql<number>`coalesce(sum(${weeklyStats.deletions}), 0)::int`,
      activeRepos: sql<number>`count(distinct ${weeklyStats.repoNodeId}) filter (where ${weeklyStats.commits} > 0)::int`,
      pendingCommits: sql<number>`coalesce(sum(${weeklyStats.pendingCommits}), 0)::int`,
      pendingAdditions: sql<number>`coalesce(sum(${weeklyStats.pendingAdditions}), 0)::int`,
      pendingDeletions: sql<number>`coalesce(sum(${weeklyStats.pendingDeletions}), 0)::int`,
    })
    .from(weeklyStats)
    .where(and(eq(weeklyStats.userId, userId), between(weeklyStats.weekStart, weeks.from, weeks.to)));
  return row;
}

/** The merged calendar for one user from `since` to today, as a date -> contributions map. */
export async function userDailyCounts(userId: number, since: string, viewer: BoardViewer): Promise<Map<string, number>> {
  const daily = await dailyByUser([userId], since, viewer);
  return daily.get(userId) ?? new Map<string, number>();
}

export type LanguageRow = { language: string | null; lines: number; additions: number; deletions: number };

/** Lines touched (added + deleted) per repo language over the window, biggest first. */
export async function languageLines(userId: number, window: Window, includePrivate: boolean): Promise<LanguageRow[]> {
  const weeks = weekRange(window);
  return db
    .select({
      language: repos.primaryLanguage,
      lines: sql<number>`sum(${weeklyStats.additions} + ${weeklyStats.deletions})::int`,
      additions: sql<number>`sum(${weeklyStats.additions})::int`,
      deletions: sql<number>`sum(${weeklyStats.deletions})::int`,
    })
    .from(weeklyStats)
    .innerJoin(repos, eq(repos.githubNodeId, weeklyStats.repoNodeId))
    .where(
      and(
        eq(weeklyStats.userId, userId),
        between(weeklyStats.weekStart, weeks.from, weeks.to),
        includePrivate ? undefined : eq(repos.isPrivate, false),
      ),
    )
    .groupBy(repos.primaryLanguage)
    .orderBy(desc(sql`sum(${weeklyStats.additions} + ${weeklyStats.deletions})`));
}

export type MemberWeekRow = { weekStart: string; userId: number; commits: number; lines: number };

/** Weekly commits and lines per member over an explicit span, gated exactly like the board row beside it. */
export async function memberWeeklyTotals(userIds: number[], from: string, to: string, viewer: BoardViewer): Promise<MemberWeekRow[]> {
  return db
    .select({
      weekStart: weeklyStats.weekStart,
      userId: weeklyStats.userId,
      commits: sql<number>`sum(${weeklyStats.commits})::int`,
      lines: sql<number>`sum(${weeklyStats.additions} + ${weeklyStats.deletions})::int`,
    })
    .from(weeklyStats)
    .innerJoin(repos, eq(repos.githubNodeId, weeklyStats.repoNodeId))
    .innerJoin(users, and(eq(users.id, weeklyStats.userId), sharedRepo(viewer)))
    .where(and(inArray(weeklyStats.userId, userIds), between(weeklyStats.weekStart, from, to)))
    .groupBy(weeklyStats.weekStart, weeklyStats.userId);
}

export type MemberDayRow = {
  userId: number;
  date: string;
  commits: number;
  /** Everything counted for the day, including whatever had to be placed there from a weekly figure. */
  lines: number;
  /** The part of `lines` that came from a week's total rather than from a machine counting days. */
  spreadLines: number;
};

const DAYS_IN_WEEK = 7;

/**
 * How much of one week's total belongs on each of its days that falls inside the window, in proportion
 * to how busy the member's contribution calendar says that day was — evenly when the calendar is
 * silent. Days with nothing on them get no share at all, so a week never lands on a day that was idle.
 */
function weekShares(weekStart: string, from: string, to: string, shape: Map<string, number>): [string, number][] {
  const dates = Array.from({ length: DAYS_IN_WEEK }, (_, i) => shiftDate(weekStart, i)).filter((d) => d >= from && d <= to);
  if (dates.length === 0) return [];
  const active = dates.reduce((sum, d) => sum + (shape.get(d) ?? 0), 0);
  return dates
    .map((d): [string, number] => [d, active > 0 ? (shape.get(d) ?? 0) / active : 1 / dates.length])
    .filter(([, share]) => share > 0);
}

/**
 * Per member, per day, from the best source each metric has. Commits come from the merged calendar the
 * heatmaps read, so a member without a linked computer is still counted through GitHub's public days.
 *
 * Lines have no per-day source at all outside `daily_local` — GitHub answers by the week — so a repo
 * week no machine counted is placed onto that week's days the same way the personal page does it, in
 * proportion to the member's calendar, and comes back separately in `spreadLines`. Without this a
 * member whose machine was linked in June simply vanished from the day chart before June while the
 * weekly chart beside it showed a full year.
 */
export async function memberDailyTotals(userIds: number[], from: string, to: string, viewer: BoardViewer): Promise<MemberDayRow[]> {
  // A week bucket overlaps the window when it starts up to six days before `from`; the last such
  // bucket runs six days past `to`. Coverage has to be judged over that whole span.
  const weekSpanFrom = shiftDate(from, -(DAYS_IN_WEEK - 1));
  const weekSpanTo = shiftDate(to, DAYS_IN_WEEK - 1);
  const [calendar, local, weekly] = await Promise.all([
    dailyByUser(userIds, from, viewer),
    // Days outside the window are read only so their week counts as covered; they never reach a chart.
    db
      .select({
        userId: dailyLocal.userId,
        repoNodeId: dailyLocal.repoNodeId,
        date: dailyLocal.date,
        lines: sql<number>`sum(${dailyLocal.additions} + ${dailyLocal.deletions})::int`,
      })
      .from(dailyLocal)
      .innerJoin(repos, eq(repos.githubNodeId, dailyLocal.repoNodeId))
      .innerJoin(users, and(eq(users.id, dailyLocal.userId), sharedRepo(viewer)))
      .where(and(inArray(dailyLocal.userId, userIds), between(dailyLocal.date, weekSpanFrom, weekSpanTo)))
      .groupBy(dailyLocal.userId, dailyLocal.repoNodeId, dailyLocal.date),
    db
      .select({
        userId: weeklyStats.userId,
        repoNodeId: weeklyStats.repoNodeId,
        weekStart: weeklyStats.weekStart,
        lines: sql<number>`(${weeklyStats.additions} + ${weeklyStats.deletions})::int`,
      })
      .from(weeklyStats)
      .innerJoin(repos, eq(repos.githubNodeId, weeklyStats.repoNodeId))
      .innerJoin(users, and(eq(users.id, weeklyStats.userId), sharedRepo(viewer)))
      .where(and(inArray(weeklyStats.userId, userIds), between(weeklyStats.weekStart, weekSpanFrom, to))),
  ]);

  const merged = new Map<string, MemberDayRow>();
  const at = (userId: number, date: string) => {
    const key = `${userId}:${date}`;
    const row = merged.get(key) ?? { userId, date, commits: 0, lines: 0, spreadLines: 0 };
    merged.set(key, row);
    return row;
  };
  for (const [userId, days] of calendar) {
    for (const [date, count] of days) if (date >= from && date <= to) at(userId, date).commits += count;
  }

  /** Repo weeks a machine already counted for a member, which must not also be placed from their total. */
  const covered = new Set<string>();
  for (const r of local) {
    covered.add(`${r.userId}:${r.repoNodeId}:${sundayOf(r.date)}`);
    if (r.date >= from && r.date <= to) at(r.userId, r.date).lines += r.lines;
  }
  for (const w of weekly) {
    if (covered.has(`${w.userId}:${w.repoNodeId}:${w.weekStart}`)) continue;
    for (const [date, share] of weekShares(w.weekStart, from, to, calendar.get(w.userId) ?? new Map())) {
      at(w.userId, date).spreadLines += w.lines * share;
    }
  }

  return [...merged.values()].map((r) => ({
    ...r,
    spreadLines: Math.round(r.spreadLines),
    lines: r.lines + Math.round(r.spreadLines),
  }));
}

export type RepoWeekTotals = {
  weekStart: string;
  nodeId: string;
  nameWithOwner: string;
  isPrivate: boolean;
  commits: number;
  additions: number;
  deletions: number;
};

/**
 * One row per (week, repo) over an explicit span — `weekly_stats` is already keyed that way, so no
 * aggregate is needed. Feeds the repo-mix area and the repo pulse, which read the same rows.
 */
export async function repoWeeklyTotals(userId: number, from: string, to: string, includePrivate: boolean): Promise<RepoWeekTotals[]> {
  return db
    .select({
      weekStart: weeklyStats.weekStart,
      nodeId: repos.githubNodeId,
      nameWithOwner: repos.nameWithOwner,
      isPrivate: repos.isPrivate,
      commits: weeklyStats.commits,
      additions: weeklyStats.additions,
      deletions: weeklyStats.deletions,
    })
    .from(weeklyStats)
    .innerJoin(repos, eq(repos.githubNodeId, weeklyStats.repoNodeId))
    .where(and(eq(weeklyStats.userId, userId), between(weeklyStats.weekStart, from, to), includePrivate ? undefined : eq(repos.isPrivate, false)))
    .orderBy(weeklyStats.weekStart);
}

export type DailyLineRow = {
  date: string;
  /** Everything counted for the day, including whatever had to be placed there from a weekly figure. */
  additions: number;
  deletions: number;
  commits: number;
  /** The part of the day above that came from a week's total rather than from a machine counting days. */
  spreadAdditions: number;
  spreadDeletions: number;
  spreadCommits: number;
};

const dailyLineCols = {
  date: dailyLocal.date,
  additions: sql<number>`sum(${dailyLocal.additions})::int`,
  deletions: sql<number>`sum(${dailyLocal.deletions})::int`,
  commits: sql<number>`sum(${dailyLocal.commits})::int`,
};

/**
 * Lines per day across the user's repos, from the two sources that know anything about days.
 *
 * A machine running the CLI counts every day of every repo it can see, and those days are exact. A
 * repo GitHub knows about but that is not on any linked machine has no per-day figures at all —
 * `stats/contributors` answers by the week — so its week is placed onto that week's days instead, in
 * proportion to the member's public contribution calendar, or evenly when the calendar is silent.
 * Those placed amounts come back separately in `spread*`, so a chart can mark them rather than pass
 * them off as counted. Without this the day charts simply lost every repo that is not cloned locally,
 * and disagreed with the weekly chart beside them.
 */
export async function userDailyLines(userId: number, from: string, to: string, includePrivate: boolean): Promise<DailyLineRow[]> {
  const publicOnly = includePrivate ? undefined : eq(repos.isPrivate, false);
  // A week bucket overlaps the window when it starts up to six days before `from`; the last such
  // bucket runs six days past `to`. Coverage has to be judged over that whole span.
  const weekSpanFrom = shiftDate(from, -(DAYS_IN_WEEK - 1));
  const weekSpanTo = shiftDate(to, DAYS_IN_WEEK - 1);
  const [counted, weekly, calendar] = await Promise.all([
    // Every day of every week the weekly query can reach, so a week a machine counted is recognised
    // as covered even when none of its counted days fall inside the window. Days outside it are
    // used for `covered` only and never added to the chart.
    db
      .select({ repoNodeId: dailyLocal.repoNodeId, ...dailyLineCols })
      .from(dailyLocal)
      .innerJoin(repos, eq(repos.githubNodeId, dailyLocal.repoNodeId))
      .where(and(eq(dailyLocal.userId, userId), between(dailyLocal.date, weekSpanFrom, weekSpanTo), publicOnly))
      .groupBy(dailyLocal.repoNodeId, dailyLocal.date),
    // Weeks overlapping the window start up to six days before it.
    db
      .select({
        repoNodeId: weeklyStats.repoNodeId,
        weekStart: weeklyStats.weekStart,
        additions: weeklyStats.additions,
        deletions: weeklyStats.deletions,
        commits: weeklyStats.commits,
      })
      .from(weeklyStats)
      .innerJoin(repos, eq(repos.githubNodeId, weeklyStats.repoNodeId))
      .where(and(eq(weeklyStats.userId, userId), between(weeklyStats.weekStart, weekSpanFrom, to), publicOnly)),
    db
      .select({ date: dailyContributions.date, count: dailyContributions.contributionCount })
      .from(dailyContributions)
      .where(and(eq(dailyContributions.userId, userId), between(dailyContributions.date, weekSpanFrom, to))),
  ]);

  const days = new Map<string, DailyLineRow>();
  const at = (date: string) => {
    const row = days.get(date) ?? { date, additions: 0, deletions: 0, commits: 0, spreadAdditions: 0, spreadDeletions: 0, spreadCommits: 0 };
    days.set(date, row);
    return row;
  };
  /** Weeks a machine already counted for this repo, which must not also be placed from their total. */
  const covered = new Set<string>();
  for (const r of counted) {
    covered.add(`${r.repoNodeId}:${sundayOf(r.date)}`);
    if (r.date < from || r.date > to) continue;
    const day = at(r.date);
    day.additions += r.additions;
    day.deletions += r.deletions;
    day.commits += r.commits;
  }

  const shape = new Map(calendar.map((c) => [c.date, c.count]));
  for (const w of weekly) {
    if (covered.has(`${w.repoNodeId}:${w.weekStart}`)) continue;
    for (const [d, share] of weekShares(w.weekStart, from, to, shape)) {
      const day = at(d);
      day.spreadAdditions += w.additions * share;
      day.spreadDeletions += w.deletions * share;
      day.spreadCommits += w.commits * share;
    }
  }

  return [...days.values()]
    .map((d) => ({
      ...d,
      spreadAdditions: Math.round(d.spreadAdditions),
      spreadDeletions: Math.round(d.spreadDeletions),
      spreadCommits: Math.round(d.spreadCommits),
      additions: d.additions + Math.round(d.spreadAdditions),
      deletions: d.deletions + Math.round(d.spreadDeletions),
      commits: d.commits + Math.round(d.spreadCommits),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function repoDailyLines(userId: number, repoNodeId: string, from: string, to: string): Promise<DailyLineRow[]> {
  const rows = await db
    .select(dailyLineCols)
    .from(dailyLocal)
    .where(and(eq(dailyLocal.userId, userId), eq(dailyLocal.repoNodeId, repoNodeId), between(dailyLocal.date, from, to)))
    .groupBy(dailyLocal.date)
    .orderBy(dailyLocal.date);
  // One repo's own days are only ever the counted kind; nothing is placed from a weekly figure here.
  return rows.map((r) => ({ ...r, spreadAdditions: 0, spreadDeletions: 0, spreadCommits: 0 }));
}

export type SyncWarning = { kind: "token" | "machine"; name: string; last: Date | null };

/** How long a linked machine may stay quiet before its owner is told. It syncs every 6 hours. */
const STALE_DAYS = 3;

/**
 * Whatever is keeping this member's numbers from updating: a GitHub token GitHub stopped accepting,
 * or a linked machine that has gone quiet. Only ever shown to the member themselves.
 */
export async function syncWarnings(userId: number): Promise<SyncWarning[]> {
  const rows = await db.execute<{ kind: "token" | "machine"; name: string; last: string | null }>(sql`
    select 'token' as kind, ${userTokens.label} as name, null::timestamptz as last
    from ${userTokens}
    where ${userTokens.userId} = ${userId} and ${userTokens.lastError} is not null
    union all
    select 'machine', ${cliTokens.machine}, ${cliTokens.lastSyncAt}
    from ${cliTokens}
    where ${cliTokens.userId} = ${userId}
      and coalesce(${cliTokens.lastSyncAt}, ${cliTokens.createdAt}) < now() - interval '${sql.raw(String(STALE_DAYS))} days'
  `);
  return rows.rows.map((r) => ({ kind: r.kind, name: r.name, last: r.last ? new Date(r.last) : null }));
}

/** When this account first appeared, for copy that must not claim a period the member was not here for. */
export async function accountCreatedAt(userId: number): Promise<Date | null> {
  const [row] = await db.select({ at: users.createdAt }).from(users).where(eq(users.id, userId)).limit(1);
  return row?.at ?? null;
}

export type SiteCounts = { members: number; repos: number; lastSnapshotAt: Date | null };

/** The footer line: how many people are on the board, how many repos carry any weekly row, last run. */
export async function siteCounts(): Promise<SiteCounts> {
  const [[member], [tracked], [run]] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(users).where(eq(users.isDemo, false)),
    db
      .select({ n: sql<number>`count(distinct ${weeklyStats.repoNodeId})::int` })
      .from(weeklyStats)
      .innerJoin(users, eq(users.id, weeklyStats.userId))
      .where(eq(users.isDemo, false)),
    db
      .select({ finishedAt: snapshotRuns.finishedAt })
      .from(snapshotRuns)
      .where(isNotNull(snapshotRuns.finishedAt))
      .orderBy(desc(snapshotRuns.id))
      .limit(1),
  ]);
  return { members: member.n, repos: tracked.n, lastSnapshotAt: run?.finishedAt ?? null };
}

export type WiderCommits = { month: number; year: number };

/**
 * Commits in the month and year presets in one query. Only read when the chosen window came back
 * empty, so the page can point at the nearest window that has something in it.
 */
export async function widerCommits(userId: number, includePrivate: boolean, now = new Date()): Promise<WiderCommits> {
  const month = weekRange({ kind: "preset", value: "month" }, now);
  const year = weekRange({ kind: "preset", value: "year" }, now);
  const [row] = await db
    .select({
      month: sql<number>`coalesce(sum(${weeklyStats.commits}) filter (where ${weeklyStats.weekStart} between ${month.from} and ${month.to}), 0)::int`,
      year: sql<number>`coalesce(sum(${weeklyStats.commits}), 0)::int`,
    })
    .from(weeklyStats)
    .innerJoin(repos, eq(repos.githubNodeId, weeklyStats.repoNodeId))
    .where(
      and(
        eq(weeklyStats.userId, userId),
        between(weeklyStats.weekStart, year.from, year.to),
        includePrivate ? undefined : eq(repos.isPrivate, false),
      ),
    );
  return row;
}

export type RepoInfo = {
  nodeId: string;
  nameWithOwner: string;
  primaryLanguage: string | null;
  stargazerCount: number;
  isFork: boolean;
  isPrivate: boolean;
};

export async function repoById(nodeId: string): Promise<RepoInfo | null> {
  const [row] = await db
    .select({
      nodeId: repos.githubNodeId,
      nameWithOwner: repos.nameWithOwner,
      primaryLanguage: repos.primaryLanguage,
      stargazerCount: repos.stargazerCount,
      isFork: repos.isFork,
      isPrivate: repos.isPrivate,
    })
    .from(repos)
    .where(eq(repos.githubNodeId, nodeId))
    .limit(1);
  return row ?? null;
}

export type RepoSharer = { userId: number; repoNames: RepoNames; sharePrivate: boolean; hiddenName: boolean };

/** Everyone in `userIds` who has ever had rows for this repo, with the settings that gate them. */
export async function repoSharers(nodeId: string, userIds: number[]): Promise<RepoSharer[]> {
  if (userIds.length === 0) return [];
  return db
    .selectDistinct({
      userId: users.id,
      repoNames: users.repoNames,
      sharePrivate: users.sharePrivate,
      hiddenName: sql<boolean>`coalesce(${repoNameOverrides.hidden}, false)`,
    })
    .from(weeklyStats)
    .innerJoin(users, eq(users.id, weeklyStats.userId))
    .leftJoin(repoNameOverrides, and(eq(repoNameOverrides.userId, users.id), eq(repoNameOverrides.repoNodeId, nodeId)))
    .where(and(eq(weeklyStats.repoNodeId, nodeId), inArray(weeklyStats.userId, userIds)));
}

/** Whether `owner` lets others read this repo's real name: the matrix, minus any per-repo override. */
export function nameVisible(owner: { repoNames: RepoNames; hiddenName?: boolean }, repo: { isPrivate: boolean }): boolean {
  if (owner.hiddenName) return false;
  return owner.repoNames === "all" || (owner.repoNames === "public_only" && !repo.isPrivate);
}

/** Node ids whose name this user hides from everyone, whatever the matrix says. */
export async function hiddenRepoNames(userId: number): Promise<string[]> {
  const rows = await db
    .select({ repoNodeId: repoNameOverrides.repoNodeId })
    .from(repoNameOverrides)
    .where(and(eq(repoNameOverrides.userId, userId), eq(repoNameOverrides.hidden, true)));
  return rows.map((r) => r.repoNodeId);
}

/**
 * Who a repo page may show this viewer, and whether they may open it at all: their own rows always,
 * plus every crewmate who shares the repo's numbers. Access needs either own rows or one crewmate
 * who also shows the name — a masked repo stays a 404 for everyone else.
 */
export function repoScope(viewerId: number, repo: { isPrivate: boolean }, sharers: RepoSharer[]): { access: boolean; visible: number[] } {
  const mine = sharers.some((s) => s.userId === viewerId);
  const shared = sharers.filter((s) => s.userId !== viewerId && (!repo.isPrivate || s.sharePrivate));
  return {
    access: mine || shared.some((s) => nameVisible(s, repo)),
    visible: [...(mine ? [viewerId] : []), ...shared.map((s) => s.userId)],
  };
}

export type RepoMemberRow = {
  userId: number;
  login: string;
  avatarUrl: string;
  name: string | null;
  commits: number;
  additions: number;
  deletions: number;
};

/** Per-member totals for one repo in the window, biggest first. */
export async function repoMemberTotals(nodeId: string, userIds: number[], window: Window): Promise<RepoMemberRow[]> {
  if (userIds.length === 0) return [];
  const weeks = weekRange(window);
  return db
    .select({
      userId: users.id,
      login: users.githubLogin,
      avatarUrl: users.avatarUrl,
      name: users.name,
      commits: sql<number>`sum(${weeklyStats.commits})::int`,
      additions: sql<number>`sum(${weeklyStats.additions})::int`,
      deletions: sql<number>`sum(${weeklyStats.deletions})::int`,
    })
    .from(weeklyStats)
    .innerJoin(users, eq(users.id, weeklyStats.userId))
    .where(and(eq(weeklyStats.repoNodeId, nodeId), inArray(weeklyStats.userId, userIds), between(weeklyStats.weekStart, weeks.from, weeks.to)))
    .groupBy(users.id)
    .orderBy(desc(sql`sum(${weeklyStats.commits})`));
}

export type RepoWeekRow = { weekStart: string; userId: number; commits: number };

/** Commits per week per member for the stacked bars. */
export async function repoWeeksByMember(nodeId: string, userIds: number[], from: string, to: string): Promise<RepoWeekRow[]> {
  if (userIds.length === 0) return [];
  return db
    .select({ weekStart: weeklyStats.weekStart, userId: weeklyStats.userId, commits: sql<number>`sum(${weeklyStats.commits})::int` })
    .from(weeklyStats)
    .where(and(eq(weeklyStats.repoNodeId, nodeId), inArray(weeklyStats.userId, userIds), between(weeklyStats.weekStart, from, to)))
    .groupBy(weeklyStats.weekStart, weeklyStats.userId)
    .orderBy(weeklyStats.weekStart);
}

export type OverlapRow = {
  nodeId: string;
  nameWithOwner: string;
  isPrivate: boolean;
  commits: number;
  members: { userId: number; login: string; avatarUrl: string; repoNames: RepoNames; hiddenName: boolean }[];
};

/** Repos two or more of these members pushed to in the window, busiest first. */
export async function repoOverlaps(userIds: number[], window: Window, viewer: BoardViewer): Promise<OverlapRow[]> {
  if (userIds.length < 2) return [];
  const weeks = weekRange(window);
  const rows = await db
    .select({
      nodeId: repos.githubNodeId,
      nameWithOwner: repos.nameWithOwner,
      isPrivate: repos.isPrivate,
      userId: users.id,
      login: users.githubLogin,
      avatarUrl: users.avatarUrl,
      repoNames: users.repoNames,
      hiddenName: sql<boolean>`bool_or(coalesce(${repoNameOverrides.hidden}, false))`,
      commits: sql<number>`sum(${weeklyStats.commits})::int`,
    })
    .from(weeklyStats)
    .innerJoin(repos, eq(repos.githubNodeId, weeklyStats.repoNodeId))
    .innerJoin(users, and(eq(users.id, weeklyStats.userId), sharedRepo(viewer)))
    .leftJoin(repoNameOverrides, and(eq(repoNameOverrides.userId, users.id), eq(repoNameOverrides.repoNodeId, weeklyStats.repoNodeId)))
    .where(and(inArray(weeklyStats.userId, userIds), between(weeklyStats.weekStart, weeks.from, weeks.to)))
    .groupBy(repos.githubNodeId, users.id)
    .having(sql`sum(${weeklyStats.commits}) > 0`);
  const byRepo = new Map<string, OverlapRow>();
  for (const r of rows) {
    const entry = byRepo.get(r.nodeId) ?? { nodeId: r.nodeId, nameWithOwner: r.nameWithOwner, isPrivate: r.isPrivate, commits: 0, members: [] };
    entry.commits += r.commits;
    entry.members.push({ userId: r.userId, login: r.login, avatarUrl: r.avatarUrl, repoNames: r.repoNames, hiddenName: r.hiddenName });
    byRepo.set(r.nodeId, entry);
  }
  return [...byRepo.values()].filter((r) => r.members.length > 1).sort((a, b) => b.commits - a.commits);
}
