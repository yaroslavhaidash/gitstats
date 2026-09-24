import { and, between, desc, eq, gte, inArray, isNotNull, sql, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { cliTokens, dailyContributions, dailyLocal, repoNameOverrides, repos, snapshotRuns, users, userTokens, weeklyStats, type RepoNames } from "@/db/schema";
import { daysAgo, periodBounds, shiftDate, sundayOf, weekRange, type Metric, type Range, type Window } from "./window";

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
  const [members, totals, stars, daily, streaks] = await Promise.all([
    db.select({ userId: users.id, login: users.githubLogin, avatarUrl: users.avatarUrl, name: users.name }).from(users).where(scope(userIds)),
    rangeTotals(userIds, periodBounds(window, now).current, viewer, now),
    starsByUser(userIds, viewer),
    dailyByUser(userIds, daysAgo(heatmapDays), viewer),
    streakByUser(userIds, viewer),
  ]);
  const empty = new Map<string, number>();
  return members
    .map((t) => {
      const days = daily.get(t.userId) ?? empty;
      return {
        ...t,
        ...(totals.get(t.userId) ?? NO_TOTALS),
        stars: stars.get(t.userId) ?? 0,
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
  /** Commits in the previous period, cut at the same point (`periodBounds`); the board's momentum arrow reads it. */
  prevCommits: number;
  /** Lines touched in that same earlier period, so a lines-ranked board can say how many places you moved. */
  prevLines: number;
};

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

/** Per-repo totals over the window's days, summed like the tiles (`placedDays`), so they add up to them. */
export async function userRepos(userId: number, window: Window, includePrivate: boolean, now = new Date()): Promise<RepoRow[]> {
  const { current } = periodBounds(window, now);
  const { repos: repoTotals } = await placedDays([userId], current.from, current.to, includePrivate ? sql`true` : eq(repos.isPrivate, false), now);
  const totals = repoTotals.get(userId) ?? [];
  if (totals.length === 0) return [];
  const meta = await db
    .select({
      nodeId: repos.githubNodeId,
      nameWithOwner: repos.nameWithOwner,
      primaryLanguage: repos.primaryLanguage,
      stargazerCount: repos.stargazerCount,
      isFork: repos.isFork,
      isPrivate: repos.isPrivate,
      statsPending: repos.statsPending,
    })
    .from(repos)
    .where(inArray(repos.githubNodeId, totals.map((t) => t.nodeId)));
  const byId = new Map(meta.map((m) => [m.nodeId, m]));
  return totals
    .flatMap((t) => {
      const m = byId.get(t.nodeId);
      return m ? [{ ...m, commits: t.commits, additions: t.additions, deletions: t.deletions }] : [];
    })
    .sort((a, b) => b.commits - a.commits || b.additions + b.deletions - (a.additions + a.deletions));
}

/** The merged calendar for one user from `since` to today, as a date -> contributions map. */
export async function userDailyCounts(userId: number, since: string, viewer: BoardViewer): Promise<Map<string, number>> {
  const daily = await dailyByUser([userId], since, viewer);
  return daily.get(userId) ?? new Map<string, number>();
}

export type LanguageRow = { language: string | null; lines: number; additions: number; deletions: number };

/** Lines touched (added + deleted) per repo language, from the window's repo totals, biggest first. */
export function languageLines(repoRows: RepoRow[]): LanguageRow[] {
  const byLanguage = new Map<string | null, LanguageRow>();
  for (const r of repoRows) {
    const t = byLanguage.get(r.primaryLanguage) ?? { language: r.primaryLanguage, lines: 0, additions: 0, deletions: 0 };
    t.additions += r.additions;
    t.deletions += r.deletions;
    t.lines += r.additions + r.deletions;
    byLanguage.set(r.primaryLanguage, t);
  }
  return [...byLanguage.values()].sort((a, b) => b.lines - a.lines);
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
 * silent. The shares are taken over every day of the week up to today, not only the ones inside the
 * window, so a window that cuts a week in two gets its part of the week and never the whole of it.
 * Days with nothing on them get no share at all, so a week never lands on a day that was idle.
 */
function weekShares(weekStart: string, from: string, to: string, today: string, shape: Map<string, number>): [string, number][] {
  const elapsed = Array.from({ length: DAYS_IN_WEEK }, (_, i) => shiftDate(weekStart, i)).filter((d) => d <= today);
  if (elapsed.length === 0) return [];
  const active = elapsed.reduce((sum, d) => sum + (shape.get(d) ?? 0), 0);
  return elapsed
    .filter((d) => d >= from && d <= to)
    .map((d): [string, number] => [d, active > 0 ? (shape.get(d) ?? 0) / active : 1 / elapsed.length])
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
  const today = daysAgo(0);
  // A week bucket overlaps the window when it starts up to six days before `from`; the last such
  // bucket runs six days past `to`. Coverage has to be judged over that whole span.
  const weekSpanFrom = shiftDate(from, -(DAYS_IN_WEEK - 1));
  const weekSpanTo = shiftDate(to, DAYS_IN_WEEK - 1);
  const [calendar, local, weekly] = await Promise.all([
    // From the first week's Sunday, so a week the window cuts in two is shaped by all of its days.
    dailyByUser(userIds, weekSpanFrom, viewer),
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
    for (const [date, share] of weekShares(w.weekStart, from, to, today, calendar.get(w.userId) ?? new Map())) {
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

type Amounts = { commits: number; additions: number; deletions: number; pendingCommits: number; pendingAdditions: number; pendingDeletions: number };

const AMOUNTS = ["commits", "additions", "deletions", "pendingCommits", "pendingAdditions", "pendingDeletions"] as const;

const zero = (): Amounts => ({ commits: 0, additions: 0, deletions: 0, pendingCommits: 0, pendingAdditions: 0, pendingDeletions: 0 });

type UserDay = DailyLineRow & { userId: number; pendingCommits: number; pendingAdditions: number; pendingDeletions: number };

/** One repo's share of a member's period total, from the same days the total is summed from. */
export type RepoTotal = { nodeId: string; language: string | null; commits: number; additions: number; deletions: number };

const REPO_AMOUNTS = ["commits", "additions", "deletions"] as const;
type RepoAmounts = Record<(typeof REPO_AMOUNTS)[number], number>;

/**
 * Split an integer total over parts in proportion to `raw`, largest remainder first, so the parts
 * add up to exactly `total`. That is how a repo's placed share keeps the per-repo list equal to the
 * tile: the tile rounds each day, and the repos have to add up to what it printed.
 */
function apportion(total: number, raw: number[]): number[] {
  const sum = raw.reduce((a, b) => a + b, 0);
  if (sum <= 0 || total <= 0) return raw.map(() => 0);
  const scaled = raw.map((r) => (r * total) / sum);
  const out = scaled.map(Math.floor);
  let left = total - out.reduce((a, b) => a + b, 0);
  for (const i of raw.map((_, i) => i).sort((a, b) => scaled[b] - out[b] - (scaled[a] - out[a]))) {
    if (left <= 0) break;
    out[i] += 1;
    left -= 1;
  }
  return out;
}

/**
 * Per member, per day, across their repos, from the two sources that know anything about days.
 *
 * A machine running the CLI counts every day of every repo it can see, and those days are exact. A
 * repo GitHub knows about but that is not on any linked machine has no per-day figures at all —
 * `stats/contributors` answers by the week — so its week is placed onto that week's days instead, in
 * proportion to the member's public contribution calendar, or evenly when the calendar is silent.
 * Those placed amounts come back separately in `spread*`, so a chart can mark them rather than pass
 * them off as counted. Without this the day charts simply lost every repo that is not cloned locally,
 * and disagreed with the weekly chart beside them.
 *
 * Every period total is a sum of these days, so a week is Monday to today on both sides of a
 * comparison and a total always equals the day chart under it. `gate` decides which repos count.
 */
async function placedDays(
  userIds: number[] | null,
  from: string,
  to: string,
  gate: SQL,
  now: Date,
): Promise<{ days: UserDay[]; activeRepos: Map<number, number>; repos: Map<number, RepoTotal[]> }> {
  const today = daysAgo(0, now);
  // A week bucket overlaps the window when it starts up to six days before `from`; the last such
  // bucket runs six days past `to`. Coverage has to be judged over that whole span.
  const weekSpanFrom = shiftDate(from, -(DAYS_IN_WEEK - 1));
  const weekSpanTo = shiftDate(to, DAYS_IN_WEEK - 1);
  const [counted, weekly, calendar] = await Promise.all([
    // Every day of every week the weekly query can reach, so a week a machine counted is recognised
    // as covered even when none of its counted days fall inside the window. Days outside it are
    // used for `covered` only and never added to a total.
    db
      .select({
        userId: dailyLocal.userId,
        repoNodeId: dailyLocal.repoNodeId,
        language: repos.primaryLanguage,
        date: dailyLocal.date,
        commits: dailyLocal.commits,
        additions: dailyLocal.additions,
        deletions: dailyLocal.deletions,
        pendingCommits: dailyLocal.pendingCommits,
        pendingAdditions: dailyLocal.pendingAdditions,
        pendingDeletions: dailyLocal.pendingDeletions,
      })
      .from(dailyLocal)
      .innerJoin(repos, eq(repos.githubNodeId, dailyLocal.repoNodeId))
      .innerJoin(users, eq(users.id, dailyLocal.userId))
      .where(and(scope(userIds), gate, between(dailyLocal.date, weekSpanFrom, weekSpanTo))),
    // Weeks overlapping the window start up to six days before it.
    db
      .select({
        userId: weeklyStats.userId,
        repoNodeId: weeklyStats.repoNodeId,
        language: repos.primaryLanguage,
        weekStart: weeklyStats.weekStart,
        commits: weeklyStats.commits,
        additions: weeklyStats.additions,
        deletions: weeklyStats.deletions,
        pendingCommits: weeklyStats.pendingCommits,
        pendingAdditions: weeklyStats.pendingAdditions,
        pendingDeletions: weeklyStats.pendingDeletions,
      })
      .from(weeklyStats)
      .innerJoin(repos, eq(repos.githubNodeId, weeklyStats.repoNodeId))
      .innerJoin(users, eq(users.id, weeklyStats.userId))
      .where(and(scope(userIds), gate, between(weeklyStats.weekStart, weekSpanFrom, to))),
    db
      .select({ userId: dailyContributions.userId, date: dailyContributions.date, count: dailyContributions.contributionCount })
      .from(dailyContributions)
      .innerJoin(users, eq(users.id, dailyContributions.userId))
      .where(and(scope(userIds), between(dailyContributions.date, weekSpanFrom, weekSpanTo))),
  ]);

  const days = new Map<string, { userId: number; date: string; counted: Amounts; spread: Amounts }>();
  const at = (userId: number, date: string) => {
    const key = `${userId}:${date}`;
    const day = days.get(key) ?? { userId, date, counted: zero(), spread: zero() };
    days.set(key, day);
    return day;
  };
  const active = new Map<number, Set<string>>();
  const touch = (userId: number, repo: string) => active.set(userId, (active.get(userId) ?? new Set()).add(repo));
  const perRepo = new Map<number, Map<string, { language: string | null; counted: RepoAmounts; spread: RepoAmounts }>>();
  const repoAt = (userId: number, nodeId: string, language: string | null) => {
    const mine = perRepo.get(userId) ?? new Map();
    perRepo.set(userId, mine);
    const repo = mine.get(nodeId) ?? { language, counted: { commits: 0, additions: 0, deletions: 0 }, spread: { commits: 0, additions: 0, deletions: 0 } };
    mine.set(nodeId, repo);
    return repo;
  };

  /** Repo weeks a machine already counted for a member, which must not also be placed from their total. */
  const covered = new Set<string>();
  for (const r of counted) {
    covered.add(`${r.userId}:${r.repoNodeId}:${sundayOf(r.date)}`);
    if (r.date < from || r.date > to) continue;
    const day = at(r.userId, r.date);
    for (const k of AMOUNTS) day.counted[k] += r[k];
    if (r.commits > 0) touch(r.userId, r.repoNodeId);
    if (r.commits + r.additions + r.deletions > 0) {
      const repo = repoAt(r.userId, r.repoNodeId, r.language);
      for (const k of REPO_AMOUNTS) repo.counted[k] += r[k];
    }
  }

  const shapes = new Map<number, Map<string, number>>();
  for (const c of calendar) shapes.set(c.userId, (shapes.get(c.userId) ?? new Map<string, number>()).set(c.date, c.count));
  for (const w of weekly) {
    if (covered.has(`${w.userId}:${w.repoNodeId}:${w.weekStart}`)) continue;
    const shares = weekShares(w.weekStart, from, to, today, shapes.get(w.userId) ?? new Map());
    for (const [d, share] of shares) {
      const day = at(w.userId, d);
      for (const k of AMOUNTS) day.spread[k] += w[k] * share;
    }
    if (w.commits > 0 && shares.length > 0) touch(w.userId, w.repoNodeId);
    const part = shares.reduce((sum, [, share]) => sum + share, 0);
    if (part > 0 && w.commits + w.additions + w.deletions > 0) {
      const repo = repoAt(w.userId, w.repoNodeId, w.language);
      for (const k of REPO_AMOUNTS) repo.spread[k] += w[k] * part;
    }
  }

  const rows = [...days.values()].map(({ userId, date, counted, spread }): UserDay => {
    const placed = { commits: Math.round(spread.commits), additions: Math.round(spread.additions), deletions: Math.round(spread.deletions) };
    return {
      userId,
      date,
      commits: counted.commits + placed.commits,
      additions: counted.additions + placed.additions,
      deletions: counted.deletions + placed.deletions,
      spreadCommits: placed.commits,
      spreadAdditions: placed.additions,
      spreadDeletions: placed.deletions,
      pendingCommits: counted.pendingCommits + Math.round(spread.pendingCommits),
      pendingAdditions: counted.pendingAdditions + Math.round(spread.pendingAdditions),
      pendingDeletions: counted.pendingDeletions + Math.round(spread.pendingDeletions),
    };
  });

  // Each repo gets its counted days plus its part of the placed amounts the day totals printed.
  const placedTotal = new Map<number, RepoAmounts>();
  for (const r of rows) {
    const t = placedTotal.get(r.userId) ?? { commits: 0, additions: 0, deletions: 0 };
    t.commits += r.spreadCommits;
    t.additions += r.spreadAdditions;
    t.deletions += r.spreadDeletions;
    placedTotal.set(r.userId, t);
  }
  const repoTotals = new Map<number, RepoTotal[]>();
  for (const [userId, mine] of perRepo) {
    const entries = [...mine];
    const placed = placedTotal.get(userId) ?? { commits: 0, additions: 0, deletions: 0 };
    const shares = Object.fromEntries(REPO_AMOUNTS.map((k) => [k, apportion(placed[k], entries.map(([, r]) => r.spread[k]))])) as Record<keyof RepoAmounts, number[]>;
    repoTotals.set(
      userId,
      entries
        .map(([nodeId, r], i) => ({
          nodeId,
          language: r.language,
          commits: r.counted.commits + shares.commits[i],
          additions: r.counted.additions + shares.additions[i],
          deletions: r.counted.deletions + shares.deletions[i],
        }))
        .filter((r) => r.commits + r.additions + r.deletions > 0),
    );
  }
  return { days: rows, activeRepos: new Map([...active].map(([userId, set]) => [userId, set.size])), repos: repoTotals };
}

/** Lines per day across one user's repos; see `placedDays` for where each figure comes from. */
export async function userDailyLines(userId: number, from: string, to: string, includePrivate: boolean): Promise<DailyLineRow[]> {
  const { days } = await placedDays([userId], from, to, includePrivate ? sql`true` : eq(repos.isPrivate, false), new Date());
  return days
    .map(({ date, additions, deletions, commits, spreadAdditions, spreadDeletions, spreadCommits }) => ({
      date,
      additions,
      deletions,
      commits,
      spreadAdditions,
      spreadDeletions,
      spreadCommits,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export type RangeTotals = Amounts & { activeRepos: number; topLanguage: string | null };

export const NO_TOTALS: RangeTotals = { ...zero(), activeRepos: 0, topLanguage: null };

/** The language with the most commits over the same repo totals, lines breaking a tie. */
function topLanguage(repoTotals: RepoTotal[]): string | null {
  const byLanguage = new Map<string, { commits: number; lines: number }>();
  for (const r of repoTotals) {
    if (!r.language) continue;
    const t = byLanguage.get(r.language) ?? { commits: 0, lines: 0 };
    t.commits += r.commits;
    t.lines += r.additions + r.deletions;
    byLanguage.set(r.language, t);
  }
  return [...byLanguage].sort(([, a], [, b]) => b.commits - a.commits || b.lines - a.lines)[0]?.[0] ?? null;
}

/**
 * Each member's totals over an inclusive day range, as `viewer` may see them: the sum of the days
 * `placedDays` returns, so a total can never disagree with the day chart. Members with nothing in
 * the range are absent.
 */
export async function rangeTotals(userIds: number[] | null, range: Range, viewer: BoardViewer, now = new Date()): Promise<Map<number, RangeTotals>> {
  const { days, activeRepos, repos: repoTotals } = await placedDays(userIds, range.from, range.to, sharedRepo(viewer), now);
  const totals = new Map<number, RangeTotals>();
  for (const d of days) {
    const t = totals.get(d.userId) ?? { ...NO_TOTALS, activeRepos: activeRepos.get(d.userId) ?? 0, topLanguage: topLanguage(repoTotals.get(d.userId) ?? []) };
    for (const k of AMOUNTS) t[k] += d[k];
    totals.set(d.userId, t);
  }
  return totals;
}

/** One total a record is about: the period's first day and its lines and commits. */
export type PeriodTotal = { start: string; lines: number; commits: number };

export type Records = {
  /** Best Monday-to-Sunday week and best calendar month, each by lines and by commits (the two can differ). */
  week: { lines: PeriodTotal | null; commits: PeriodTotal | null };
  month: { lines: PeriodTotal | null; commits: PeriodTotal | null };
  /** Longest run ever under the member's streak rule, with its first and last day. */
  streak: { days: number; from: string; to: string } | null;
  /** Records set by the period in progress, beating an earlier non-zero best: what the owner's banner announces. */
  fresh: { week: string | null; month: string | null; streak: string | null };
};

/** Monday of `date`'s week, the week every period total on the site uses. */
function mondayOf(date: string): string {
  return shiftDate(date, -((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7));
}

/** Sum days into periods keyed by their first day. */
function bucket(days: UserDay[], key: (date: string) => string): PeriodTotal[] {
  const out = new Map<string, PeriodTotal>();
  for (const d of days) {
    const start = key(d.date);
    const t = out.get(start) ?? { start, lines: 0, commits: 0 };
    t.lines += d.additions + d.deletions;
    t.commits += d.commits;
    out.set(start, t);
  }
  return [...out.values()];
}

/** The biggest period for a metric (earliest wins a tie), and whether the current one set it just now. */
function best(periods: PeriodTotal[], metric: "lines" | "commits", current: string): { top: PeriodTotal | null; fresh: boolean } {
  const top = periods.reduce<PeriodTotal | null>((a, p) => (p[metric] > 0 && (!a || p[metric] > a[metric] || (p[metric] === a[metric] && p.start < a.start)) ? p : a), null);
  const before = Math.max(0, ...periods.filter((p) => p.start !== current).map((p) => p[metric]));
  return { top, fresh: top !== null && top.start === current && before > 0 };
}

/** The two longest runs ever, longest first, and whether the first one is still going. */
async function longestStreaks(userId: number, viewer: BoardViewer): Promise<{ days: number; from: string; to: string; alive: boolean }[]> {
  const today = sql`(now() at time zone 'utc')::date`;
  const rows = await db.execute<{ len: number; from_d: string; to_d: string; alive: boolean }>(sql`
    with active as (
      select ${dailyContributions.date} as date
      from ${dailyContributions}
      where ${dailyContributions.userId} = ${userId} and ${dailyContributions.contributionCount} > 0
      union
      select ${dailyLocal.date} as date
      from ${dailyLocal}
      join ${repos} on ${repos.githubNodeId} = ${dailyLocal.repoNodeId} and ${repos.isPrivate}
      join ${users} on ${users.id} = ${dailyLocal.userId} and ${sharedRepo(viewer)}
      where ${dailyLocal.userId} = ${userId} and ${dailyLocal.commits} > 0
    ),
    placed as (
      select a.date, ${timelinePosition(sql`a.date`)} as pos, ${timelinePosition(today)} as now_pos
      from active a
      join ${users} u on u.id = ${userId}
      where a.date <= ${today} and (u.streak_mode <> 'weekdays' or extract(isodow from a.date) < 6)
    ),
    ranked as (select date, pos, now_pos, pos - row_number() over (order by pos) as run from placed)
    select count(*)::int as len, min(date)::text as from_d, max(date)::text as to_d, max(pos) >= min(now_pos) - 1 as alive
    from ranked group by run
    order by len desc, max(date) desc
    limit 2
  `);
  return rows.rows.map((r) => ({ days: Number(r.len), from: r.from_d, to: r.to_d, alive: Boolean(r.alive) }));
}

/**
 * All-time bests for one member as `viewer` may see them. Weeks and months are sums of the same days
 * every period total uses (`placedDays`), so the best week is the number the WEEK tile showed then.
 */
export async function userRecords(userId: number, viewer: BoardViewer, now = new Date()): Promise<Records> {
  const today = daysAgo(0, now);
  const [first] = await db.select({ week: sql<string | null>`min(${weeklyStats.weekStart})::text` }).from(weeklyStats).where(eq(weeklyStats.userId, userId));
  const [{ days }, runs] = await Promise.all([
    first?.week ? placedDays([userId], first.week, today, sharedRepo(viewer), now) : Promise.resolve({ days: [] as UserDay[] }),
    longestStreaks(userId, viewer),
  ]);
  const weeks = bucket(days, mondayOf);
  const months = bucket(days, (d) => `${d.slice(0, 7)}-01`);
  const [thisWeek, thisMonth] = [mondayOf(today), `${today.slice(0, 7)}-01`];
  const [wl, wc, ml, mc] = [best(weeks, "lines", thisWeek), best(weeks, "commits", thisWeek), best(months, "lines", thisMonth), best(months, "commits", thisMonth)];
  const [longest, runnerUp] = runs;
  return {
    week: { lines: wl.top, commits: wc.top },
    month: { lines: ml.top, commits: mc.top },
    streak: longest ? { days: longest.days, from: longest.from, to: longest.to } : null,
    fresh: {
      week: wl.fresh || wc.fresh ? thisWeek : null,
      month: ml.fresh || mc.fresh ? thisMonth : null,
      streak: longest?.alive && runnerUp && longest.days > runnerUp.days ? longest.from : null,
    },
  };
}

/** The owner's weekly goal: this week so far and the eight whole weeks before it, oldest first. */
export async function goalWeeks(userId: number, now = new Date()): Promise<PeriodTotal[]> {
  const today = daysAgo(0, now);
  const thisWeek = mondayOf(today);
  const starts = Array.from({ length: 9 }, (_, i) => shiftDate(thisWeek, (i - 8) * DAYS_IN_WEEK));
  const { days } = await placedDays([userId], starts[0], today, sql`true`, now);
  const totals = new Map(bucket(days, mondayOf).map((w) => [w.start, w]));
  return starts.map((start) => totals.get(start) ?? { start, lines: 0, commits: 0 });
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

/** Per-member totals for one repo over the window's days, summed like every other period total, biggest first. */
export async function repoMemberTotals(nodeId: string, userIds: number[], window: Window, now = new Date()): Promise<RepoMemberRow[]> {
  if (userIds.length === 0) return [];
  const { current } = periodBounds(window, now);
  const [{ repos: repoTotals }, members] = await Promise.all([
    placedDays(userIds, current.from, current.to, eq(repos.githubNodeId, nodeId), now),
    db.select({ userId: users.id, login: users.githubLogin, avatarUrl: users.avatarUrl, name: users.name }).from(users).where(inArray(users.id, userIds)),
  ]);
  return members
    .flatMap((m) => {
      const t = repoTotals.get(m.userId)?.find((r) => r.nodeId === nodeId);
      return t ? [{ ...m, commits: t.commits, additions: t.additions, deletions: t.deletions }] : [];
    })
    .sort((a, b) => b.commits - a.commits);
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

/** Repos two or more of these members pushed to over the window's days, busiest first. */
export async function repoOverlaps(userIds: number[], window: Window, viewer: BoardViewer, now = new Date()): Promise<OverlapRow[]> {
  if (userIds.length < 2) return [];
  const { current } = periodBounds(window, now);
  const { repos: repoTotals } = await placedDays(userIds, current.from, current.to, sharedRepo(viewer), now);
  const commitsBy = new Map<string, Map<number, number>>();
  for (const [userId, mine] of repoTotals) {
    for (const r of mine) if (r.commits > 0) commitsBy.set(r.nodeId, (commitsBy.get(r.nodeId) ?? new Map()).set(userId, r.commits));
  }
  const shared = [...commitsBy].filter(([, members]) => members.size > 1);
  if (shared.length === 0) return [];
  const nodeIds = shared.map(([nodeId]) => nodeId);
  const memberIds = [...new Set(shared.flatMap(([, members]) => [...members.keys()]))];
  const [repoRows, memberRows, hidden] = await Promise.all([
    db.select({ nodeId: repos.githubNodeId, nameWithOwner: repos.nameWithOwner, isPrivate: repos.isPrivate }).from(repos).where(inArray(repos.githubNodeId, nodeIds)),
    db.select({ userId: users.id, login: users.githubLogin, avatarUrl: users.avatarUrl, repoNames: users.repoNames }).from(users).where(inArray(users.id, memberIds)),
    db
      .select({ userId: repoNameOverrides.userId, nodeId: repoNameOverrides.repoNodeId })
      .from(repoNameOverrides)
      .where(and(inArray(repoNameOverrides.userId, memberIds), inArray(repoNameOverrides.repoNodeId, nodeIds), eq(repoNameOverrides.hidden, true))),
  ]);
  const repoById = new Map(repoRows.map((r) => [r.nodeId, r]));
  const memberById = new Map(memberRows.map((m) => [m.userId, m]));
  const hides = new Set(hidden.map((h) => `${h.userId}:${h.nodeId}`));
  return shared
    .flatMap(([nodeId, members]): OverlapRow[] => {
      const repo = repoById.get(nodeId);
      if (!repo) return [];
      return [
        {
          ...repo,
          commits: [...members.values()].reduce((a, b) => a + b, 0),
          members: [...members.keys()].flatMap((userId) => {
            const m = memberById.get(userId);
            return m ? [{ ...m, hiddenName: hides.has(`${userId}:${nodeId}`) }] : [];
          }),
        },
      ];
    })
    .sort((a, b) => b.commits - a.commits);
}
