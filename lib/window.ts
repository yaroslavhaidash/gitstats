export const PRESETS = ["week", "month", "year"] as const;
export type Preset = (typeof PRESETS)[number];

/** Either one of the presets or an explicit `?from=&to=` range. */
export type Window = { kind: "preset"; value: Preset } | { kind: "range"; from: string; to: string };
export type Range = { from: string; to: string };

/** The year preset stays rolling; week and month are calendar-aligned. */
const YEAR_DAYS = 365;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function isCalendarDate(value: string | undefined): value is string {
  if (typeof value !== "string" || !ISO.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && isoDate(d) === value;
}

export function shiftDate(date: string, days: number): string {
  return isoDate(new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000));
}

/** Length of an inclusive range in days. */
export function rangeDays({ from, to }: Range): number {
  return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 + 1;
}

/** Monday 00:00 UTC of the week `now` is in. */
export function weekStart(now: Date): string {
  const back = (now.getUTCDay() + 6) % 7;
  return isoDate(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - back)));
}

/** The Sunday that opens the GitHub week containing `date`. */
export function sundayOf(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  return shiftDate(date, -d.getUTCDay());
}

function monthStart(now: Date): string {
  return isoDate(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)));
}

/** A well-formed `from`/`to` pair wins; anything else falls back to a preset, default week. */
export function parseWindow({ w, from, to }: { w?: string; from?: string; to?: string }): Window {
  if (isCalendarDate(from) && isCalendarDate(to) && from <= to) return { kind: "range", from, to };
  const value = (PRESETS as readonly string[]).includes(w ?? "") ? (w as Preset) : "week";
  return { kind: "preset", value };
}

/**
 * Days the window covers, inclusive. Week runs from Monday of the current week, month from the 1st;
 * both end today, so they answer "what have I done so far this week/month". Year stays rolling.
 */
export function windowRange(window: Window, now = new Date()): Range {
  if (window.kind === "range") return { from: window.from, to: window.to };
  const to = isoDate(now);
  if (window.value === "week") return { from: weekStart(now), to };
  if (window.value === "month") return { from: monthStart(now), to };
  return { from: daysAgo(YEAR_DAYS - 1, now), to };
}

/**
 * Bounds a weekly bucket's Sunday start has to fall in. GitHub's weeks start on Sunday and ours on
 * Monday, so a bucket counts when its Sunday falls up to six days before the window: that week
 * overlaps it.
 */
export function weekRange(window: Window, now = new Date()): Range {
  const range = windowRange(window, now);
  return { from: shiftDate(range.from, -6), to: range.to };
}

/**
 * The period immediately before this one: the previous calendar week or month (cut at the same
 * point in it, so a Wednesday is compared against a Wednesday), or the previous 365 days. A preset
 * shifts `now` instead of turning into a range so its bucket rule stays identical on both sides.
 */
export function previousPeriod(window: Window, now = new Date()): { window: Window; now: Date } {
  if (window.kind === "preset") {
    if (window.value === "week") return { window, now: new Date(now.getTime() - 7 * 86_400_000) };
    if (window.value === "year") return { window, now: new Date(now.getTime() - YEAR_DAYS * 86_400_000) };
    // Same day number one month back, clamped to that month's length (31 Mar → 28 Feb).
    const days = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0)).getUTCDate();
    const day = Math.min(now.getUTCDate(), days);
    return { window, now: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, day)) };
  }
  const len = rangeDays(window);
  return { window: { kind: "range", from: shiftDate(window.from, -len), to: shiftDate(window.to, -len) }, now };
}

/**
 * The days this window covers and the days of the period it is compared against, cut at the same
 * point: Monday to today against last Monday to the same weekday. Every total and every delta reads
 * these two ranges, so no surface can compare a partial week against a whole one.
 */
export function periodBounds(window: Window, now = new Date()): { current: Range; previous: Range } {
  const prev = previousPeriod(window, now);
  return { current: windowRange(window, now), previous: windowRange(prev.window, prev.now) };
}

/** The last instant the previous period covers: what an account must predate to have a place there. */
export function previousPeriodEnd(window: Window, now = new Date()): Date {
  const prev = previousPeriod(window, now);
  return prev.window.kind === "range" ? new Date(`${prev.window.to}T23:59:59.999Z`) : prev.now;
}

/** How the lines-per-day panel draws this window. */
export type DayChartMode = "week" | "month" | "days" | "months";

/** Longer than this a range gives up on day cells and shows one tile per month. */
const DAY_CELL_LIMIT = 62;

export function dayChartMode(window: Window): DayChartMode {
  if (window.kind === "preset") return window.value === "year" ? "months" : window.value;
  return rangeDays(window) > DAY_CELL_LIMIT ? "months" : "days";
}

/** Past this many days one bar per day is a hairline, so a per-day chart buckets to weeks instead. */
const DAY_SERIES_LIMIT = 92;

/** How a per-member day chart draws a span: a bar per day, or a bar per week once it is too long. */
export type DaySeriesMode = "days" | "weeks";

/** Asked by the chart and by the caption above it, so the two can never disagree. */
export function daySeriesMode(range: Range): DaySeriesMode {
  return rangeDays(range) > DAY_SERIES_LIMIT ? "weeks" : "days";
}

/** The lines-per-week chart is yearly context: 52 buckets ending on this week's Sunday, always. */
export const YEAR_WEEKS = 52;

export function yearChart(now = new Date()): { weeks: number; endSunday: string } {
  return { weeks: YEAR_WEEKS, endSunday: sundayOf(isoDate(now)) };
}

/** How many weekly buckets a window-driven weekly chart draws, and the Sunday it ends on. */
export function chartWeeks(window: Window, now = new Date()): { weeks: number; endSunday: string } {
  if (window.kind === "preset") {
    return { weeks: window.value === "year" ? 52 : 12, endSunday: sundayOf(isoDate(now)) };
  }
  return { weeks: Math.max(8, Math.ceil(rangeDays(window) / 7)), endSunday: sundayOf(window.to) };
}

/** Reads as a noun phrase after a word: "Repos this week", "Repos 01 Jun – 30 Jun". */
export function windowLabel(window: Window): string {
  if (window.kind === "preset") return `this ${window.value}`;
  // A 365-day span crosses a new year, and without it reads as one day to the same day.
  const crossesYears = window.from.slice(0, 4) !== window.to.slice(0, 4);
  return `${fmtShort(window.from, crossesYears)} – ${fmtShort(window.to, crossesYears)}`;
}

function fmtShort(date: string, withYear = false): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: withYear ? "numeric" : undefined,
    timeZone: "UTC",
  });
}

/** How the momentum arrow names the period it compares against. */
export function previousLabel(window: Window): string {
  return window.kind === "preset" ? `last ${window.value}` : "the period before";
}

/** What the comparison charts count. Lines is the default: a commit is whatever someone calls a commit. */
export const METRICS = ["lines", "commits"] as const;
export type Metric = (typeof METRICS)[number];

export function parseMetric(m: string | undefined): Metric {
  return m === "commits" ? "commits" : "lines";
}

/** The window and the metric as one query string, so a control can change one and keep the other. */
export function viewQuery(window: Window, metric: Metric): string {
  return `${windowQuery(window)}${metric === "lines" ? "" : `&m=${metric}`}`;
}

export function windowQuery(window: Window): string {
  return window.kind === "preset" ? `w=${window.value}` : `from=${window.from}&to=${window.to}`;
}

/**
 * How far back the race runs. It is deliberately longer than the window — a week's worth of frames is
 * not a race — but it scales with it, because a fixed half-year barely changes between visits and the
 * early frames are mostly dead air. Week races the month, month the quarter, year the half-year.
 */
const RACE_WEEKS: Record<Preset, number> = { week: 4, month: 12, year: 26 };
const RACE_MIN = 4;
const RACE_MAX = 26;

export function raceWeeks(window: Window): number {
  if (window.kind === "preset") return RACE_WEEKS[window.value];
  return Math.max(RACE_MIN, Math.min(RACE_MAX, Math.ceil(rangeDays(window) / 7)));
}

/** Enough of the query string to describe what the reader is looking at. */
const VIEW_KEYS = ["w", "from", "to", "m"] as const;

/** Anything that can answer for a query parameter: `URLSearchParams`, or Next's readonly flavour. */
export type ViewParams = { get(key: string): string | null };

/**
 * `href` with the reader's window and metric carried across. Moving between the boards and a profile
 * would otherwise drop them back to this week and lines, which is the one thing people notice.
 */
export function withView(href: string, params: ViewParams): string {
  const carried = new URLSearchParams();
  for (const key of VIEW_KEYS) {
    const value = params.get(key);
    if (value) carried.set(key, value);
  }
  const query = carried.toString();
  return query ? `${href}?${query}` : href;
}

/** For links that set the window themselves: a preset replaces any custom range, the metric comes along. */
export function withMetric(href: string, params: ViewParams): string {
  const metric = params.get("m");
  return metric ? `${href}${href.includes("?") ? "&" : "?"}m=${metric}` : href;
}

export function daysAgo(n: number, now = new Date()): string {
  return isoDate(new Date(now.getTime() - n * 86_400_000));
}
