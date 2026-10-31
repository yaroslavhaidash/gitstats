import type { ReactNode } from "react";
import { claudeMemberRecords, claudeUserStats } from "@/lib/cached";
import { claudeBuckets, modelLabel, type ClaudePeriodTotal } from "@/lib/claudestats";
import { fmt, fmtMonth, fmtTokens, pctDelta } from "@/lib/format";
import { CLAUDE_HEAT_SCALE } from "@/lib/side";
import { daySeriesMode, isAllTime, rangeDays, windowLabel, windowRange, type ClaudeMetric, type Window } from "@/lib/window";
import { ClaudeSetup } from "./ClaudeSetup";
import { EmptyNote } from "./EmptyNote";
import { ShareBar } from "./ShareBar";
import { StatTile } from "./StatTile";
import { TokenBars } from "./TokenBars";
import { WeekdayProfile } from "./WeekdayProfile";
import { YearCalendar } from "./YearCalendar";

const UNIT: Record<ClaudeMetric, string> = { tokens: "tokens", output: "output tokens" };
/** The four kinds of token in one split; output carries the side's colour, the rest step down from silver. */
const TYPES = [
  ["input", "#e0e2e5"],
  ["cache write", "#9ca3af"],
  ["cache read", "#4b5563"],
  ["output", "var(--color-alert)"],
] as const;

function day(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

/** All-time bests by tokens and by output, the claudestats counterpart of `RecordsPanel`. */
async function Records({ userId }: { userId: number }) {
  const { week, month, streak } = await claudeMemberRecords(userId);
  const tile = (label: string, p: ClaudePeriodTotal | null, metric: ClaudeMetric, when: (d: string) => string) => (
    <StatTile key={label} label={label} value={p ? fmtTokens(p[metric]) : "none"} sub={p ? when(p.start) : undefined} />
  );
  return (
    <section className="mb-8">
      <h2 className="font-sans font-bold text-lg mb-3">Records</h2>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-[2px] bg-dark border-2 border-dark">
        {tile("best week · tokens", week.tokens, "tokens", (d) => `week of ${day(d)}`)}
        {tile("best week · output", week.output, "output", (d) => `week of ${day(d)}`)}
        {tile("best month · tokens", month.tokens, "tokens", fmtMonth)}
        {tile("best month · output", month.output, "output", fmtMonth)}
        <StatTile label="longest streak" value={streak ? `${streak.days}d` : "none"} sub={streak ? `${day(streak.from)} to ${day(streak.to)}` : undefined} />
      </div>
      <p className="font-mono text-xs text-faint mt-2">&gt; weeks run Monday to Sunday · all time</p>
    </section>
  );
}

/**
 * Everything below a member's claudestats header: tiles, the yearly bars, the calendar of replies,
 * the window chart, the token split, the model mix, the weekday profile and the records. Shared by
 * the member page and the demo, which differ only in who may see it and where links go.
 */
export async function ClaudeMember({ userId, window, metric, streakMode, setup, share }: {
  userId: number;
  window: Window;
  metric: ClaudeMetric;
  streakMode: string;
  /** The owner with no rows yet sees how to turn counting on; null for everyone else. */
  setup: { linked: boolean } | null;
  /** The owner's share panel, shown once there is something to share. */
  share?: ReactNode;
}) {
  const { row, before, weeks, days, models, year, weekdays, span } = await claudeUserStats(userId, window);
  if (!row) {
    return setup ? <ClaudeSetup linked={setup.linked} /> : <EmptyNote>no Claude Code numbers here yet</EmptyNote>;
  }
  const allTime = isAllTime(window);
  const label = windowLabel(window);
  const delta = (now: number, was: number) => (allTime || (now === 0 && was === 0) ? undefined : pctDelta(now, was));
  const mode = daySeriesMode(span);
  const bars = claudeBuckets(days, span, mode);
  const types = [row.input, row.cacheWrite, row.cacheRead, row.output];
  const mix = models
    .filter((m) => m[metric] > 0)
    .map((m) => ({ label: m.label, value: m[metric], colour: `var(--model-${m.family})` }));
  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-[2px] bg-dark border-2 border-dark">
        <StatTile label="tokens" value={fmtTokens(row.tokens)} delta={delta(row.tokens, before.tokens)} />
        <StatTile label="output" value={fmtTokens(row.output)} delta={delta(row.output, before.output)} />
        <StatTile label="sessions" value={fmt(row.sessions)} delta={delta(row.sessions, before.sessions)} />
        <StatTile label="active days" value={String(row.activeDays)} />
        <StatTile label="streak" value={`${row.streak}d`} suffix={streakMode === "weekdays" ? "· weekdays" : undefined} />
        <StatTile label="top model" value={row.topModel ? modelLabel(row.topModel) : "none"} />
      </div>
      <p className="font-mono text-xs text-faint mt-2 mb-8">
        {allTime
          ? `> all time · since ${fmtMonth(span.from)} · counted on linked computers`
          : `> percentages compare against the ${rangeDays(windowRange(window))} days before this window`}
      </p>
      {share}

      <section className="panel p-6 mb-8">
        <h2 className="font-sans font-bold text-lg mb-1">{UNIT[metric][0].toUpperCase() + UNIT[metric].slice(1)} per week</h2>
        <p className="font-mono text-xs text-faint mb-4">last {weeks.length} weeks · Monday to Sunday</p>
        <TokenBars
          bars={weeks.map((w) => ({ start: w.weekStart, tokens: w.tokens, output: w.output }))}
          mode="weeks"
          metric={metric}
          label={`${UNIT[metric]} per week, last ${weeks.length} weeks`}
        />
      </section>

      <section className="panel p-6 mb-8">
        <h2 className="font-sans font-bold text-lg mb-1">Year of replies</h2>
        <p className="font-mono text-xs text-faint mb-4">Claude Code replies per day · last 52 weeks</p>
        <YearCalendar days={year} label="Claude Code replies per day, last 52 weeks" heat={CLAUDE_HEAT_SCALE} />
      </section>

      <section className="panel p-6 mb-8">
        <h2 className="font-sans font-bold text-lg mb-1">
          {UNIT[metric][0].toUpperCase() + UNIT[metric].slice(1)} {{ days: "per day", weeks: "per week", months: "per month" }[mode]}
        </h2>
        <p className="font-mono text-xs text-faint mb-4">{label}</p>
        <TokenBars bars={bars} mode={mode} metric={metric} label={`${UNIT[metric]} ${label}`} />
      </section>

      {/* The two split bars are short, so they stack beside the weekday profile rather than each taking a row. */}
      <div className="grid lg:grid-cols-2 gap-8 mb-8">
        <div className="grid gap-8 content-start min-w-0">
          <section className="panel p-6 min-w-0">
            <h2 className="font-sans font-bold text-lg mb-1">Token types</h2>
            <p className="font-mono text-xs text-faint mb-4">{label} · cache reads are context Claude Code sent again</p>
            <ShareBar rows={TYPES.map(([name, colour], i) => ({ label: name, value: types[i], colour }))} label={`Token types ${label}`} />
          </section>
          <section className="panel p-6 min-w-0">
            <h2 className="font-sans font-bold text-lg mb-1">Model mix</h2>
            <p className="font-mono text-xs text-faint mb-4">{UNIT[metric]} {label} by model</p>
            {mix.length === 0 ? <EmptyNote inset>nothing counted {label}</EmptyNote> : <ShareBar rows={mix} label={`Model mix ${label}`} />}
          </section>
        </div>
        <section className="panel p-6 min-w-0">
          <h2 className="font-sans font-bold text-lg mb-1">Weekday profile</h2>
          <p className="font-mono text-xs text-faint mb-4">average Claude Code replies per weekday {label}</p>
          <WeekdayProfile averages={weekdays} unit={{ label: "Average Claude Code replies per weekday", empty: `no replies ${label}` }} />
        </section>
      </div>

      <Records userId={userId} />
    </>
  );
}
