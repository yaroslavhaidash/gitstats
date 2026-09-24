import { cacheLife, cacheTag } from "next/cache";
import { crewTag, GLOBAL_TAG, STATS_TAG, userTag } from "./cache";
import { crewMemberIds, userCrews } from "./crews";
import {
  boardRows,
  rankBy,
  hiddenRepoNames,
  standing,
  languageLines,
  lastDays,
  repoById,
  memberDailyTotals,
  memberWeeklyTotals,
  repoMemberTotals,
  repoWeeklyTotals,
  repoScope,
  repoSharers,
  repoWeeksByMember,
  SHARE_HEATMAP_DAYS,
  siteCounts,
  userDailyCounts,
  userDailyLines,
  rangeTotals,
  repoOverlaps,
  NO_TOTALS,
  userRepos,
  weekdayAverages,
  weeklyTotals,
  goalWeeks,
  userRecords,
  widerCommits,
  type BoardRow,
  type BoardViewer,
  type DailyLineRow,
  type LanguageRow,
  type MemberDayRow,
  type MemberWeekRow,
  type OverlapRow,
  type PeriodTotal,
  type Records,
  type RepoInfo,
  type RepoMemberRow,
  type RepoRow,
  type RankedRow,
  type RepoWeekTotals,
  type RepoWeekRow,
  type SiteCounts,
  type Standing,
  type WeekRow,
} from "./stats";
import { chartWeeks, daysAgo, periodBounds, raceWeeks, shiftDate, windowRange, yearChart, type Metric, type Preset, type Range, type Window } from "./window";

/**
 * Every Postgres read behind a board or a user page goes through this file. The session lookup
 * stays in the page: only what the viewer is allowed to see (`includePrivate`, `isOwner`) crosses
 * the boundary, as arguments, so it is part of the cache key instead of being read inside.
 */

const YEAR_DAYS = 364;
/** Span of the repo-mix area and the repo pulse: half a year of weekly buckets. */
const MIX_WEEKS = 26;

/** A board plus each member's commits in the period before it, which the momentum arrow compares against. */
async function ranked(userIds: number[] | null, window: Window, viewer: BoardViewer): Promise<RankedRow[]> {
  const [rows, before] = await Promise.all([boardRows(userIds, window, viewer), rangeTotals(userIds, periodBounds(window).previous, viewer)]);
  return rows.map((r) => {
    const was = before.get(r.userId) ?? NO_TOTALS;
    return { ...r, prevCommits: was.commits, prevLines: was.additions + was.deletions };
  });
}

export async function globalBoard(window: Window): Promise<RankedRow[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(STATS_TAG, GLOBAL_TAG);
  return ranked(null, window, "global");
}

/** The dashboard footer's live counts; invalidated with everything else on the `stats` tag. */
export async function footerCounts(): Promise<SiteCounts> {
  "use cache";
  cacheLife("hours");
  cacheTag(STATS_TAG, GLOBAL_TAG);
  return siteCounts();
}

export async function crewBoard(crewId: number, window: Window): Promise<RankedRow[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(STATS_TAG, crewTag(crewId));
  return ranked(await crewMemberIds(crewId), window, "crew");
}

export type ShareStats = {
  row: BoardRow;
  standing: Standing | null;
  /** Top three repos by lines over the window, minus the ones the owner hides per repo. */
  topRepos: { nameWithOwner: string; lines: number }[];
  /** The best week or month ever for the card's metric, when the window is a week or a month: the record card's headline. */
  record: { kind: "week" | "month"; best: PeriodTotal } | null;
};

const SHARE_REPOS = 3;

/**
 * Everything a share card prints. The owner minted the link, so the numbers are their own view of
 * themselves — that is the "anyone with the link" column `/privacy` describes, and rotating
 * `share_nonce` is how it is taken back. Repo names still honour the per-repo hides, which is the
 * one switch that means "not this one, ever".
 */
export async function shareStats(userId: number, window: Window, metric: Metric): Promise<ShareStats> {
  "use cache";
  cacheLife("hours");
  cacheTag(STATS_TAG, GLOBAL_TAG, userTag(userId));
  const kind = window.kind === "preset" && (window.value === "week" || window.value === "month") ? window.value : null;
  const [[row], board, repoRows, hidden, records] = await Promise.all([
    boardRows([userId], window, "own", new Date(), SHARE_HEATMAP_DAYS),
    ranked(null, window, "global"),
    userRepos(userId, window, true),
    hiddenRepoNames(userId),
    kind ? userRecords(userId, "own") : null,
  ]);
  const best = kind && records ? records[kind][metric] : null;
  const hide = new Set(hidden);
  const topRepos = repoRows
    .filter((r) => !hide.has(r.nodeId))
    .map((r) => ({ nameWithOwner: r.nameWithOwner, lines: r.additions + r.deletions }))
    .sort((a, b) => b.lines - a.lines)
    .slice(0, SHARE_REPOS);
  return { row, standing: standing(board, metric, userId), topRepos, record: kind && best ? { kind, best } : null };
}

export type RecapStats = {
  row: BoardRow;
  /** Days of the week with any contribution in the merged calendar. */
  activeDays: number;
  /** Where the member finished on the crew board for that week, by the card's metric; null outside a crew. */
  placement: { rank: number; total: number; crew: string } | null;
};

/**
 * The weekly recap: one Monday-to-Sunday range, the owner's own view like every card, and the crew
 * board's ranking for that same range, so the card's place is the place the board showed.
 */
export async function recapStats(userId: number, range: Range, metric: Metric, crewId: number | null): Promise<RecapStats> {
  "use cache";
  cacheLife("hours");
  cacheTag(STATS_TAG, GLOBAL_TAG, userTag(userId), ...(crewId === null ? [] : [crewTag(crewId)]));
  const window: Window = { kind: "range", ...range };
  const crew = crewId === null ? undefined : (await userCrews(userId)).find((c) => c.id === crewId);
  const [[row], calendar, board] = await Promise.all([
    boardRows([userId], window, "own", new Date(), SHARE_HEATMAP_DAYS),
    userDailyCounts(userId, range.from, "own"),
    crew ? crewBoard(crew.id, window) : null,
  ]);
  const activeDays = [...calendar].filter(([date, n]) => date <= range.to && n > 0).length;
  const order = board ? rankBy(board, metric) : [];
  const at = order.findIndex((r) => r.userId === userId);
  return { row, activeDays, placement: crew && at >= 0 ? { rank: at + 1, total: order.length, crew: crew.name } : null };
}

export type Totals = { commits: number; additions: number; deletions: number; activeRepos: number };

export type UserStats = {
  row: BoardRow;
  before: Totals | undefined;
  weeks: WeekRow[];
  /** Fixed yearly context: 52 buckets ending on this week's Sunday, whatever the window is. */
  chartWeeks: number;
  chartEnd: string;
  repoRows: RepoRow[];
  dailyLines: DailyLineRow[];
  languages: LanguageRow[];
  /** Weekly commits and lines per repo over the last `MIX_WEEKS`, feeding the repo mix and the pulse. */
  repoWeeks: RepoWeekTotals[];
  mixWeeks: number;
  mixEnd: string;
  /** Merged calendar, last 52 weeks, oldest first. */
  year: number[];
  /** Average commits per weekday over the window, Sunday first, from the merged calendar. */
  weekdays: number[];
  /** Average lines touched (added + deleted) per weekday over the same window, Sunday first. */
  weekdayLines: number[];
  span: Range;
  /** Node ids whose name this member hides from everyone. */
  hiddenNames: string[];
  /** Only set when the window is empty: the nearest wider preset that has commits. */
  nearest: { preset: Preset; commits: number } | null;
};

/** The first preset wider than this window that has any commits, for an empty window's fallback link. */
async function nearestWindow(userId: number, window: Window, includePrivate: boolean) {
  if (window.kind === "preset" && window.value === "year") return null;
  const wider = window.kind === "preset" && window.value === "month" ? (["year"] as const) : (["month", "year"] as const);
  const counts = await widerCommits(userId, includePrivate);
  for (const preset of wider) if (counts[preset] > 0) return { preset, commits: counts[preset] };
  return null;
}

export async function userStats(userId: number, window: Window, isOwner: boolean, includePrivate: boolean, viewer: BoardViewer): Promise<UserStats> {
  "use cache";
  cacheLife("hours");
  cacheTag(STATS_TAG, userTag(userId));
  const { current: span, previous } = periodBounds(window);
  const chart = yearChart();
  // The member's own page is never gated by the matrix; everyone else reads their column of it.
  const reader: BoardViewer = isOwner ? "own" : viewer;
  // One merged-calendar fetch feeds both the year strip and the weekday profile's commits mode.
  const calendarFrom = span.from < daysAgo(YEAR_DAYS) ? span.from : daysAgo(YEAR_DAYS);
  const mixFrom = shiftDate(chart.endSunday, -(MIX_WEEKS - 1) * 7);
  const [[row], weeks, repoRows, calendar, before, dailyLines, hiddenNames, repoWeeks] = await Promise.all([
    boardRows([userId], window, reader),
    weeklyTotals(userId, shiftDate(chart.endSunday, -(chart.weeks - 1) * 7), chart.endSunday, includePrivate),
    userRepos(userId, window, includePrivate),
    userDailyCounts(userId, calendarFrom, reader),
    rangeTotals([userId], previous, reader).then((t) => t.get(userId) ?? NO_TOTALS),
    userDailyLines(userId, span.from, span.to, includePrivate),
    hiddenRepoNames(userId),
    repoWeeklyTotals(userId, mixFrom, chart.endSunday, includePrivate),
  ]);
  return {
    row,
    before,
    weeks,
    chartWeeks: chart.weeks,
    chartEnd: chart.endSunday,
    repoRows,
    dailyLines,
    languages: languageLines(repoRows),
    hiddenNames,
    repoWeeks,
    mixWeeks: MIX_WEEKS,
    mixEnd: chart.endSunday,
    year: lastDays(calendar, YEAR_DAYS),
    weekdays: weekdayAverages(calendar, span.from, span.to),
    weekdayLines: weekdayAverages(new Map(dailyLines.map((d) => [d.date, d.additions + d.deletions])), span.from, span.to),
    span,
    nearest: row.commits === 0 ? await nearestWindow(userId, window, isOwner || includePrivate) : null,
  };
}

/** All-time bests; the member's own page reads them as `own`, everyone else in their matrix column. */
export async function memberRecords(userId: number, viewer: BoardViewer): Promise<Records> {
  "use cache";
  cacheLife("hours");
  cacheTag(STATS_TAG, userTag(userId));
  return userRecords(userId, viewer);
}

/** The weeks behind the owner's goal ring. Only the owner's page ever asks. */
export async function ownGoalWeeks(userId: number): Promise<PeriodTotal[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(STATS_TAG, userTag(userId));
  return goalWeeks(userId);
}

export type PublicMemberStats = { row: BoardRow; year: number[] };

/**
 * A member as a stranger sees them, for `/vs`: the global column of the matrix, so private repos
 * only count when the member shares them with everyone. The page checks the profile is open first.
 */
export async function publicMemberStats(userId: number, window: Window): Promise<PublicMemberStats> {
  "use cache";
  cacheLife("hours");
  cacheTag(STATS_TAG, userTag(userId));
  const [[row], calendar] = await Promise.all([boardRows([userId], window, "global"), userDailyCounts(userId, daysAgo(YEAR_DAYS), "global")]);
  return { row, year: lastDays(calendar, YEAR_DAYS) };
}

export type RepoStats = {
  repo: RepoInfo;
  members: RepoMemberRow[];
  weeks: RepoWeekRow[];
  chartWeeks: number;
  chartEnd: string;
};

/**
 * One repo as this viewer may see it. `null` when the repo is unknown or nobody who shares it with
 * the viewer shows its name — the page turns that into a 404, so a masked repo stays unguessable.
 */
export async function repoStats(viewerId: number, nodeId: string, scopeIds: number[], window: Window): Promise<RepoStats | null> {
  "use cache";
  cacheLife("hours");
  // Any member of the repo can change this page, and who that is is not known until it is read.
  cacheTag(STATS_TAG, GLOBAL_TAG);
  const repo = await repoById(nodeId);
  if (!repo) return null;
  const { access, visible } = repoScope(viewerId, repo, await repoSharers(nodeId, scopeIds));
  if (!access) return null;
  const chart = chartWeeks(window);
  const [members, weeks] = await Promise.all([
    repoMemberTotals(nodeId, visible, window),
    repoWeeksByMember(nodeId, visible, shiftDate(chart.endSunday, -(chart.weeks - 1) * 7), chart.endSunday),
  ]);
  return { repo, members, weeks, chartWeeks: chart.weeks, chartEnd: chart.endSunday };
}

export type CrewTimelines = {
  /** Weekly totals per member over `weekCount` buckets ending on `weekEnd`, fixed yearly context. */
  weeks: MemberWeekRow[];
  weekCount: number;
  weekEnd: string;
  /**
   * Per-member days covering both the race's span and the window's, so the board reads them once.
   * Each card slices the part it draws out of `raceFrom`..`dayTo`.
   */
  days: MemberDayRow[];
  /** The race's own span, which tracks the window rather than the weekly chart's fixed context. */
  raceWeeks: number;
  raceFrom: string;
  raceTo: string;
  dayFrom: string;
  dayTo: string;
};

/** Both member timelines and the race, on one pass. Private repos follow each member's crew setting. */
export async function crewTimelines(crewId: number, window: Window): Promise<CrewTimelines> {
  "use cache";
  cacheLife("hours");
  cacheTag(STATS_TAG, crewTag(crewId));
  const ids = await crewMemberIds(crewId);
  const chart = yearChart();
  const weekFrom = shiftDate(chart.endSunday, -(MIX_WEEKS - 1) * 7);
  const day = windowRange(window);
  // The race runs day by day over a span that tracks the window; the per-member day chart runs over
  // the window itself. One fetch covers the union of the two, and each card slices out what it draws.
  const race = raceWeeks(window);
  const raceTo = daysAgo(0);
  const raceFrom = shiftDate(raceTo, -(race * 7 - 1));
  const from = raceFrom < day.from ? raceFrom : day.from;
  const to = raceTo > day.to ? raceTo : day.to;
  const [weeks, days] = await Promise.all([
    memberWeeklyTotals(ids, weekFrom, chart.endSunday, "crew"),
    memberDailyTotals(ids, from, to, "crew"),
  ]);
  return {
    weeks,
    weekCount: MIX_WEEKS,
    weekEnd: chart.endSunday,
    days,
    raceWeeks: race,
    raceFrom,
    raceTo,
    dayFrom: day.from,
    dayTo: day.to,
  };
}

export async function crewOverlaps(crewId: number, window: Window): Promise<OverlapRow[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(STATS_TAG, crewTag(crewId));
  return repoOverlaps(await crewMemberIds(crewId), window, "crew");
}
