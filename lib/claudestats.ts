import { and, between, eq, gte, inArray, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { claudeDaily, users } from "@/db/schema";
import { CLAUDE_FROM } from "./claude";
import { HEATMAP_DAYS, lastDays, timelinePosition, type Standing } from "./stats";
import { daysAgo, periodBounds, shiftDate, weekStart, type ClaudeMetric, type DaySeriesMode, type Range, type Window } from "./window";

/**
 * claudestats reads. Every day here was counted by a member's own machine from Claude Code's logs,
 * so nothing is placed or estimated: a period total is a plain sum of `claude_daily` rows. There is
 * no visibility matrix either (no repos), so a read takes no viewer; the page decides who may open it.
 */

export type ClaudeTotals = {
  /** input + cache write + cache read + output: every token Claude Code sent to or got from the model. */
  tokens: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  replies: number;
  sessions: number;
  /** Days with at least one reply. */
  activeDays: number;
  /** The model with the most tokens in the range; null when there is none. */
  topModel: string | null;
};

export const NO_CLAUDE: ClaudeTotals = { tokens: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, replies: 0, sessions: 0, activeDays: 0, topModel: null };

/** `null` is everyone, minus the seeded demo crew, as `scope(null)` is on the gitstats side. */
function members(userIds: number[] | null): SQL | undefined {
  return userIds === null ? eq(users.isDemo, false) : inArray(users.id, userIds);
}

// bigint sums come back as numeric, which the driver hands over as a string: cast to float8 so they
// arrive as numbers (exact to 2^53, a few thousand times the biggest measured year).
const sums = {
  input: sql<number>`sum(${claudeDaily.inputTokens})::float8`,
  output: sql<number>`sum(${claudeDaily.outputTokens})::float8`,
  cacheRead: sql<number>`sum(${claudeDaily.cacheReadTokens})::float8`,
  cacheWrite: sql<number>`sum(${claudeDaily.cacheWriteTokens})::float8`,
  replies: sql<number>`sum(${claudeDaily.replies})::float8`,
  sessions: sql<number>`sum(${claudeDaily.sessions})::float8`,
};

type Sums = { input: number; output: number; cacheRead: number; cacheWrite: number; replies: number; sessions: number };

function tokensOf(s: { input: number; output: number; cacheRead: number; cacheWrite: number }): number {
  return s.input + s.output + s.cacheRead + s.cacheWrite;
}

/** Totals per member over an inclusive day range, one grouped sum per (member, model). */
export async function claudeTotals(userIds: number[] | null, range: Range): Promise<Map<number, ClaudeTotals>> {
  const where = and(between(claudeDaily.date, range.from, range.to), members(userIds));
  const [byModel, active] = await Promise.all([
    db
      .select({ userId: claudeDaily.userId, model: claudeDaily.model, ...sums })
      .from(claudeDaily)
      .innerJoin(users, eq(users.id, claudeDaily.userId))
      .where(where)
      .groupBy(claudeDaily.userId, claudeDaily.model),
    db
      .select({ userId: claudeDaily.userId, days: sql<number>`count(distinct ${claudeDaily.date})::int` })
      .from(claudeDaily)
      .innerJoin(users, eq(users.id, claudeDaily.userId))
      .where(and(where, sql`${claudeDaily.replies} > 0`))
      .groupBy(claudeDaily.userId),
  ]);
  const out = new Map<number, ClaudeTotals>();
  const top = new Map<number, { model: string; tokens: number }>();
  for (const r of byModel) {
    const t = out.get(r.userId) ?? { ...NO_CLAUDE };
    for (const key of ["input", "output", "cacheRead", "cacheWrite", "replies", "sessions"] as const) t[key] += r[key];
    t.tokens = tokensOf(t);
    out.set(r.userId, t);
    const tokens = tokensOf(r);
    const best = top.get(r.userId);
    // Ties go to the alphabetically first id, so the answer never depends on row order.
    if (tokens > 0 && (!best || tokens > best.tokens || (tokens === best.tokens && r.model < best.model))) top.set(r.userId, { model: r.model, tokens });
  }
  for (const r of active) {
    const t = out.get(r.userId);
    if (t) t.activeDays = r.days;
  }
  for (const [userId, t] of out) t.topModel = top.get(userId)?.model ?? null;
  return out;
}

/** How far back the streak query reads: a streak is only shown as a run ending today or yesterday. */
const STREAK_DAYS = 400;

/**
 * Consecutive days with at least one reply, ending today or yesterday, under each member's
 * `streak_mode`. Same gaps-and-islands shape as the gitstats streak, over `claude_daily` instead of
 * the contribution calendar.
 */
export async function claudeStreaks(userIds: number[] | null): Promise<Map<number, number>> {
  const scoped = userIds === null ? sql`not u.is_demo` : sql`a.user_id in ${userIds}`;
  const today = sql`(now() at time zone 'utc')::date`;
  const rows = await db.execute<{ user_id: number; streak: number }>(sql`
    with active as (
      select distinct ${claudeDaily.userId} as user_id, ${claudeDaily.date} as date
      from ${claudeDaily}
      where ${claudeDaily.replies} > 0 and ${claudeDaily.date} >= ${today} - ${STREAK_DAYS}::int and ${claudeDaily.date} <= ${today}
    ),
    placed as (
      select a.user_id, ${timelinePosition(sql`a.date`)} as pos, ${timelinePosition(today)} as now_pos
      from active a
      join ${users} u on u.id = a.user_id
      where ${scoped} and (u.streak_mode <> 'weekdays' or extract(isodow from a.date) < 6)
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

/** Replies per day per member since `since`, the activity count behind the strip and the calendar. */
export async function claudeReplyDays(userIds: number[] | null, since: string): Promise<Map<number, Map<string, number>>> {
  const rows = await db
    .select({ userId: claudeDaily.userId, date: claudeDaily.date, replies: sql<number>`sum(${claudeDaily.replies})::int` })
    .from(claudeDaily)
    .innerJoin(users, eq(users.id, claudeDaily.userId))
    .where(and(gte(claudeDaily.date, since), members(userIds)))
    .groupBy(claudeDaily.userId, claudeDaily.date);
  const out = new Map<number, Map<string, number>>();
  for (const r of rows) {
    const m = out.get(r.userId) ?? new Map<string, number>();
    m.set(r.date, r.replies);
    out.set(r.userId, m);
  }
  return out;
}

export type ClaudeBoardRow = ClaudeTotals & {
  userId: number;
  login: string;
  avatarUrl: string;
  name: string | null;
  streak: number;
  /** Replies per day, oldest first, `HEATMAP_DAYS` long. */
  days: number[];
  /** The same totals over the previous period (`periodBounds`), for the momentum arrow and rank movement. */
  prevTokens: number;
  prevOutput: number;
};

/**
 * A claudestats board: only members who have ever sent a Claude Code number, so a crew where half
 * the members never turned it on does not show half a board of zeros. Ordered by tokens; `claudeRankBy`
 * reorders for the selected tab.
 */
export async function claudeBoard(userIds: number[] | null, window: Window, now = new Date()): Promise<ClaudeBoardRow[]> {
  const { current, previous } = periodBounds(window, now);
  const [people, totals, before, streaks, daily] = await Promise.all([
    db
      .select({ userId: users.id, login: users.githubLogin, avatarUrl: users.avatarUrl, name: users.name })
      .from(users)
      .where(and(members(userIds), sql`exists (select 1 from ${claudeDaily} where ${claudeDaily.userId} = ${users.id})`)),
    claudeTotals(userIds, current),
    claudeTotals(userIds, previous),
    claudeStreaks(userIds),
    claudeReplyDays(userIds, daysAgo(HEATMAP_DAYS, now)),
  ]);
  const empty = new Map<string, number>();
  const rows = people.map((p) => {
    const was = before.get(p.userId) ?? NO_CLAUDE;
    return {
      ...p,
      ...(totals.get(p.userId) ?? NO_CLAUDE),
      streak: streaks.get(p.userId) ?? 0,
      days: lastDays(daily.get(p.userId) ?? empty, HEATMAP_DAYS, now),
      prevTokens: was.tokens,
      prevOutput: was.output,
    };
  });
  return claudeRankBy(rows, "tokens");
}

/** The board's order follows the selected tab; ties fall to the other metric, then the login. */
export function claudeRankBy<T extends { tokens: number; output: number; login: string }>(rows: T[], metric: ClaudeMetric): T[] {
  const other: ClaudeMetric = metric === "tokens" ? "output" : "tokens";
  return [...rows].sort((a, b) => b[metric] - a[metric] || b[other] - a[other] || a.login.localeCompare(b.login));
}

/** The reader's place on a claudestats board, the same sentence `standing` gives gitstats. */
export function claudeStanding(rows: ClaudeBoardRow[], metric: ClaudeMetric, userId: number): Standing | null {
  const ranked = claudeRankBy(rows, metric);
  const index = ranked.findIndex((r) => r.userId === userId);
  if (index < 0) return null;
  const before = claudeRankBy(rows.map((r) => ({ ...r, tokens: r.prevTokens, output: r.prevOutput })), metric);
  const wasIndex = before.findIndex((r) => r.userId === userId);
  const anyBefore = before.some((r) => r.tokens > 0);
  return {
    rank: index + 1,
    total: ranked.length,
    percentile: Math.max(1, Math.ceil(((index + 1) / ranked.length) * 100)),
    value: ranked[index][metric],
    movement: anyBefore && wasIndex >= 0 ? wasIndex - index : null,
  };
}

export type ClaudeDayRow = Sums & { date: string; tokens: number };

/** One member's days in a range, every model summed, only days that have a row; oldest first. */
export async function claudeDays(userId: number, range: Range): Promise<ClaudeDayRow[]> {
  const rows = await db
    .select({ date: claudeDaily.date, ...sums })
    .from(claudeDaily)
    .where(and(eq(claudeDaily.userId, userId), between(claudeDaily.date, range.from, range.to)))
    .groupBy(claudeDaily.date)
    .orderBy(claudeDaily.date);
  return rows.map((r) => ({ ...r, tokens: tokensOf(r) }));
}

/** A chart bucket: a day, a Monday week or a calendar month, keyed by its first day. */
export type ClaudeBucket = { start: string; tokens: number; output: number };

/**
 * A range's days summed into the buckets `daySeriesMode` asks for, every bucket present and zero
 * where nothing was counted, so a quiet stretch draws as a gap rather than closing up.
 */
export function claudeBuckets(days: { date: string; tokens: number; output: number }[], range: Range, mode: DaySeriesMode): ClaudeBucket[] {
  const keyOf = (date: string) =>
    mode === "days" ? date : mode === "weeks" ? weekStart(new Date(`${date}T00:00:00Z`)) : `${date.slice(0, 7)}-01`;
  const out = new Map<string, ClaudeBucket>();
  for (let d = range.from; d <= range.to; d = shiftDate(d, 1)) {
    const key = keyOf(d);
    if (!out.has(key)) out.set(key, { start: key, tokens: 0, output: 0 });
  }
  for (const day of days) {
    const bucket = out.get(keyOf(day.date));
    if (!bucket) continue;
    bucket.tokens += day.tokens;
    bucket.output += day.output;
  }
  return [...out.values()];
}

export type ClaudeMemberDay = { userId: number; date: string; tokens: number; output: number };

/** Several members' days in a range, every model summed; the crew race and its weekly lines read these. */
export async function claudeMemberDays(userIds: number[], range: Range): Promise<ClaudeMemberDay[]> {
  if (userIds.length === 0) return [];
  const rows = await db
    .select({ userId: claudeDaily.userId, date: claudeDaily.date, ...sums })
    .from(claudeDaily)
    .where(and(inArray(claudeDaily.userId, userIds), between(claudeDaily.date, range.from, range.to)))
    .groupBy(claudeDaily.userId, claudeDaily.date);
  return rows.map((r) => ({ userId: r.userId, date: r.date, tokens: tokensOf(r), output: r.output }));
}

export type ClaudeWeekRow = { weekStart: string; tokens: number; output: number };

/** `count` Monday-to-Sunday weeks ending with the current one, oldest first, zeros included. */
export async function claudeWeeks(userId: number, count: number, now = new Date()): Promise<ClaudeWeekRow[]> {
  const last = weekStart(now);
  const first = shiftDate(last, -(count - 1) * 7);
  const days = await claudeDays(userId, { from: first, to: shiftDate(last, 6) });
  const weeks = new Map<string, ClaudeWeekRow>();
  for (let i = 0; i < count; i++) {
    const start = shiftDate(first, i * 7);
    weeks.set(start, { weekStart: start, tokens: 0, output: 0 });
  }
  for (const d of days) {
    const w = weeks.get(mondayOf(d.date));
    if (!w) continue;
    w.tokens += d.tokens;
    w.output += d.output;
  }
  return [...weeks.values()];
}

export type ClaudeModelRow = { model: string; label: string; family: ModelFamily; tokens: number; output: number };

/** Tokens and output per model over a range, summed over the given members, most tokens first. */
export async function claudeModels(userIds: number[], range: Range): Promise<ClaudeModelRow[]> {
  if (userIds.length === 0) return [];
  const rows = await db
    .select({ model: claudeDaily.model, ...sums })
    .from(claudeDaily)
    .where(and(inArray(claudeDaily.userId, userIds), between(claudeDaily.date, range.from, range.to)))
    .groupBy(claudeDaily.model);
  return rows
    .map((r) => ({ model: r.model, label: modelLabel(r.model), family: modelFamily(r.model), tokens: tokensOf(r), output: r.output }))
    .filter((r) => r.tokens > 0)
    .sort((a, b) => b.tokens - a.tokens || a.model.localeCompare(b.model));
}

export type ClaudeModelWeek = { weekStart: string; families: Partial<Record<ModelFamily, { tokens: number; output: number }>> };

/** `count` Monday weeks ending with the current one, oldest first, each split by model family; idle weeks are empty. */
export async function claudeModelWeeks(userId: number, count: number, now = new Date()): Promise<ClaudeModelWeek[]> {
  const last = weekStart(now);
  const first = shiftDate(last, -(count - 1) * 7);
  const rows = await db
    .select({ date: claudeDaily.date, model: claudeDaily.model, ...sums })
    .from(claudeDaily)
    .where(and(eq(claudeDaily.userId, userId), between(claudeDaily.date, first, shiftDate(last, 6))))
    .groupBy(claudeDaily.date, claudeDaily.model);
  const weeks = new Map<string, ClaudeModelWeek>();
  for (let i = 0; i < count; i++) {
    const start = shiftDate(first, i * 7);
    weeks.set(start, { weekStart: start, families: {} });
  }
  for (const r of rows) {
    const w = weeks.get(mondayOf(r.date));
    if (!w) continue;
    const family = modelFamily(r.model);
    const f = (w.families[family] ??= { tokens: 0, output: 0 });
    f.tokens += tokensOf(r);
    f.output += r.output;
  }
  return [...weeks.values()];
}

/** The first day any of these members has a Claude Code row: where an all-time chart starts drawing. */
export async function claudeDataStart(userIds: number[]): Promise<string | null> {
  if (userIds.length === 0) return null;
  const [row] = await db
    .select({ date: sql<string | null>`min(${claudeDaily.date})::text` })
    .from(claudeDaily)
    .where(inArray(claudeDaily.userId, userIds));
  const first = row?.date ?? null;
  return first !== null && first < CLAUDE_FROM ? CLAUDE_FROM : first;
}

/** One period a record is about: its first day and its two metrics. */
export type ClaudePeriodTotal = { start: string; tokens: number; output: number };

export type ClaudeRecords = {
  /** Best Monday-to-Sunday week and best calendar month, each by tokens and by output. */
  week: { tokens: ClaudePeriodTotal | null; output: ClaudePeriodTotal | null };
  month: { tokens: ClaudePeriodTotal | null; output: ClaudePeriodTotal | null };
  /** The single heaviest day by tokens and by output, and the day with the most replies. */
  day: { tokens: ClaudePeriodTotal | null; output: ClaudePeriodTotal | null; replies: { start: string; replies: number } | null };
  /** Longest run of reply days ever under the member's streak rule. */
  streak: { days: number; from: string; to: string } | null;
};

function mondayOf(date: string): string {
  return shiftDate(date, -((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7));
}

function bucket(days: ClaudeDayRow[], key: (date: string) => string): ClaudePeriodTotal[] {
  const out = new Map<string, ClaudePeriodTotal>();
  for (const d of days) {
    const start = key(d.date);
    const t = out.get(start) ?? { start, tokens: 0, output: 0 };
    t.tokens += d.tokens;
    t.output += d.output;
    out.set(start, t);
  }
  return [...out.values()];
}

/** The biggest period for a metric; the earliest wins a tie. */
function best(periods: ClaudePeriodTotal[], metric: ClaudeMetric): ClaudePeriodTotal | null {
  return periods.reduce<ClaudePeriodTotal | null>((a, p) => (p[metric] > 0 && (!a || p[metric] > a[metric] || (p[metric] === a[metric] && p.start < a.start)) ? p : a), null);
}

async function longestStreak(userId: number): Promise<{ days: number; from: string; to: string } | null> {
  const today = sql`(now() at time zone 'utc')::date`;
  const rows = await db.execute<{ len: number; from_d: string; to_d: string }>(sql`
    with active as (
      select distinct ${claudeDaily.date} as date from ${claudeDaily}
      where ${claudeDaily.userId} = ${userId} and ${claudeDaily.replies} > 0
    ),
    placed as (
      select a.date, ${timelinePosition(sql`a.date`)} as pos
      from active a
      join ${users} u on u.id = ${userId}
      where a.date <= ${today} and (u.streak_mode <> 'weekdays' or extract(isodow from a.date) < 6)
    ),
    ranked as (select date, pos, pos - row_number() over (order by pos) as run from placed)
    select count(*)::int as len, min(date)::text as from_d, max(date)::text as to_d
    from ranked group by run
    order by len desc, max(date) desc
    limit 1
  `);
  const [r] = rows.rows;
  return r ? { days: Number(r.len), from: r.from_d, to: r.to_d } : null;
}

/** All-time bests for one member, from the same days every claudestats total is a sum of. */
export async function claudeRecords(userId: number, now = new Date()): Promise<ClaudeRecords> {
  const [days, streak] = await Promise.all([claudeDays(userId, { from: CLAUDE_FROM, to: daysAgo(0, now) }), longestStreak(userId)]);
  const weeks = bucket(days, mondayOf);
  const months = bucket(days, (d) => `${d.slice(0, 7)}-01`);
  const perDay = days.map((d) => ({ start: d.date, tokens: d.tokens, output: d.output }));
  const replies = days.reduce<{ start: string; replies: number } | null>((a, d) => (d.replies > 0 && (!a || d.replies > a.replies) ? { start: d.date, replies: d.replies } : a), null);
  return {
    day: { tokens: best(perDay, "tokens"), output: best(perDay, "output"), replies },
    week: { tokens: best(weeks, "tokens"), output: best(weeks, "output") },
    month: { tokens: best(months, "tokens"), output: best(months, "output") },
    streak,
  };
}

const MODEL_ID = /^claude-(opus|sonnet|haiku|fable)-(\d+)(?:-(\d{1,2}))?(?!\d)/;

/** "claude-opus-5-5" → "Opus 5.5", "claude-haiku-4-5-20251001" → "Haiku 4.5"; anything else stays the raw id. */
export function modelLabel(model: string): string {
  const m = MODEL_ID.exec(model);
  if (!m) return model;
  const family = m[1][0].toUpperCase() + m[1].slice(1);
  return `${family} ${m[2]}${m[3] ? `.${m[3]}` : ""}`;
}

export type ModelFamily = "opus" | "sonnet" | "haiku" | "fable" | "other";

export function modelFamily(model: string): ModelFamily {
  const m = MODEL_ID.exec(model);
  return m ? (m[1] as ModelFamily) : "other";
}

/**
 * Colour follows the model family, never its rank. Palette violet is left out: it sits 17° from the
 * claudestats theme colour and would read as the accent.
 */
export const MODEL_COLOURS: Record<ModelFamily, string> = {
  opus: "#3987e5",
  sonnet: "#199e70",
  haiku: "#c98500",
  fable: "#d55181",
  other: "#6b7280",
};
