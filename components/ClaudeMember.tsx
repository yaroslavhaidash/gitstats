import type { ReactNode } from "react";
import { claudeMemberRecords, claudeUserStats } from "@/lib/cached";
import { claudeBuckets, modelLabel, type ClaudePeriodTotal } from "@/lib/claudestats";
import { fmt, fmtCounted, fmtMonth, fmtTokens, pctDelta } from "@/lib/format";
import { CLAUDE_HEAT_SCALE, CLAUDE_MESSAGE_HEAT_SCALE } from "@/lib/side";
import { daySeriesMode, isAllTime, rangeDays, windowLabel, windowRange, type ClaudeMetric, type Window } from "@/lib/window";
import { EffortMix, HourProfile, PerMessage, SubagentShare } from "./ClaudeHabits";
import { ClaudeIntensity } from "./ClaudeIntensity";
import { ClaudeSetup } from "./ClaudeSetup";
import { EmptyNote } from "./EmptyNote";
import { ModelBands } from "./ModelBands";
import { ShareBar } from "./ShareBar";
import { StatTile } from "./StatTile";
import { TokenBars } from "./TokenBars";
import { WeekdayProfile } from "./WeekdayProfile";
import { YearCalendar } from "./YearCalendar";

const UNIT: Record<ClaudeMetric, string> = { tokens: "tokens", output: "output tokens", messages: "messages" };
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
  const { week, month, day: heaviest, streak, messageStreak } = await claudeMemberRecords(userId);
  const tile = (label: string, p: ClaudePeriodTotal | null, metric: ClaudeMetric, when: (d: string) => string) => (
    <StatTile key={label} label={label} value={p ? fmtTokens(p[metric]) : "none"} sub={p ? when(p.start) : undefined} />
  );
  return (
    <section className="mb-8">
      <h2 className="font-sans font-bold text-lg mb-3">Records</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-[2px] bg-dark border-2 border-dark">
        {tile("best week · tokens", week.tokens, "tokens", (d) => `week of ${day(d)}`)}
        {tile("best week · output", week.output, "output", (d) => `week of ${day(d)}`)}
        {tile("best month · tokens", month.tokens, "tokens", fmtMonth)}
        {tile("best month · output", month.output, "output", fmtMonth)}
        {tile("heaviest day · tokens", heaviest.tokens, "tokens", day)}
        {tile("heaviest day · output", heaviest.output, "output", day)}
        <StatTile label="most replies in a day" value={heaviest.replies ? fmt(heaviest.replies.replies) : "none"} sub={heaviest.replies ? day(heaviest.replies.start) : undefined} />
        <StatTile label="longest streak" value={streak ? `${streak.days}d` : "none"} sub={streak ? `${day(streak.from)} to ${day(streak.to)}` : undefined} />
        {tile("best week · messages", week.messages, "messages", (d) => `week of ${day(d)}`)}
        {tile("most messages in a day", heaviest.messages, "messages", day)}
        <StatTile label="longest message streak" value={messageStreak ? `${messageStreak.days}d` : "none"} sub={messageStreak ? `${day(messageStreak.from)} to ${day(messageStreak.to)}` : undefined} />
        <StatTile label="most tool calls in a day" value={heaviest.toolCalls ? fmt(heaviest.toolCalls.toolCalls) : "none"} sub={heaviest.toolCalls ? day(heaviest.toolCalls.start) : "experimental"} />
      </div>
      <p className="font-mono text-xs text-faint mt-2">&gt; weeks run Monday to Sunday · all time · messages and tool calls count from CLI 0.7.0</p>
    </section>
  );
}

/**
 * Everything below a member's claudestats header: tiles, intensity, the yearly bars, the calendar of
 * replies, the window chart, the model bands, the token split, the model mix, the weekday profile and
 * the records. Shared by
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
  const { row, before, weeks, days, models, modelWeeks, year, weekdays, messageYear, messageWeekdays, effortWeeks, span } = await claudeUserStats(userId, window);
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
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-[2px] bg-dark border-2 border-dark">
        <StatTile label="tokens" value={fmtTokens(row.tokens)} delta={delta(row.tokens, before.tokens)} />
        <StatTile label="output" value={fmtTokens(row.output)} delta={delta(row.output, before.output)} />
        <StatTile
          label="messages"
          value={fmtCounted(row.messages)}
          delta={row.messages === null || before.messages === null ? undefined : delta(row.messages, before.messages)}
        />
        <StatTile label="sessions" value={fmt(row.sessions)} delta={delta(row.sessions, before.sessions)} />
        <StatTile label="active days" value={String(row.activeDays)} />
        {metric === "messages" ? (
          <StatTile label="message streak" value={`${row.messageStreak}d`} suffix={streakMode === "weekdays" ? "· weekdays" : undefined} />
        ) : (
          <StatTile label="streak" value={`${row.streak}d`} suffix={streakMode === "weekdays" ? "· weekdays" : undefined} />
        )}
        <div className="col-span-2 md:col-span-2 lg:col-span-1 grid">
          <StatTile label="top model" value={row.topModel ? modelLabel(row.topModel) : "none"} />
        </div>
      </div>
      <p className="font-mono text-xs text-faint mt-2 mb-8">
        {allTime
          ? `> all time · since ${fmtMonth(span.from)} · counted on linked computers`
          : `> percentages compare against the ${rangeDays(windowRange(window))} days before this window`}
      </p>
      {share}

      {metric === "messages" ? (
        <PerMessage row={row} before={before} label={label} allTime={allTime} from={span.from} />
      ) : (
        <ClaudeIntensity row={row} before={before} label={label} allTime={allTime} />
      )}

      <div className="grid lg:grid-cols-[2fr_1fr] gap-8 mb-8">
        <section className="panel p-6 min-w-0">
          <h2 className="font-sans font-bold text-lg mb-1">{UNIT[metric][0].toUpperCase() + UNIT[metric].slice(1)} per week</h2>
          <p className="font-mono text-xs text-faint mb-4">last {weeks.length} weeks · Monday to Sunday</p>
          <TokenBars
            bars={weeks.map((w) => ({ start: w.weekStart, tokens: w.tokens, output: w.output, messages: w.messages }))}
            mode="weeks"
            metric={metric}
            label={`${UNIT[metric]} per week, last ${weeks.length} weeks`}
          />
        </section>
        <section className="panel p-6 min-w-0">
          {metric === "messages" ? (
            <>
              <h2 className="font-sans font-bold text-lg mb-4">Year of messages</h2>
              <YearCalendar days={messageYear} label="Messages typed per day, last 52 weeks" heat={CLAUDE_MESSAGE_HEAT_SCALE} />
              <p className="font-mono text-xs text-faint mt-4">messages you typed per day · blank days were not counted (CLI before 0.7.0)</p>
            </>
          ) : (
            <>
              <h2 className="font-sans font-bold text-lg mb-4">Year of replies</h2>
              <YearCalendar days={year} label="Claude Code replies per day, last 52 weeks" heat={CLAUDE_HEAT_SCALE} />
              <p className="font-mono text-xs text-faint mt-4">Claude Code replies per day · older half on top, newer half below</p>
            </>
          )}
        </section>
      </div>

      <section className="panel p-6 mb-8">
        <h2 className="font-sans font-bold text-lg mb-1">
          {UNIT[metric][0].toUpperCase() + UNIT[metric].slice(1)} {{ days: "per day", weeks: "per week", months: "per month" }[mode]}
        </h2>
        <p className="font-mono text-xs text-faint mb-4">{label}</p>
        <TokenBars bars={bars} mode={mode} metric={metric} label={`${UNIT[metric]} ${label}`} />
      </section>

      <section className="panel p-6 mb-8">
        <h2 className="font-sans font-bold text-lg mb-1">Model mix by week</h2>
        <p className="font-mono text-xs text-faint mb-4">share of {UNIT[metric]} per model family · last {modelWeeks.length} weeks</p>
        <ModelBands weeks={modelWeeks} metric={metric} label={`Share of ${UNIT[metric]} per model family, last ${modelWeeks.length} weeks`} />
      </section>

      <EffortMix detail={row.detail} weeks={effortWeeks} label={label} from={span.from} />

      <div className="grid lg:grid-cols-2 gap-8 mb-8">
        <SubagentShare detail={row.detail} label={label} from={span.from} />
        <HourProfile detail={row.detail} label={label} from={span.from} />
      </div>

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
          {metric === "messages" ? (
            <>
              <p className="font-mono text-xs text-faint mb-4">average messages typed per weekday {label}, over the days that counted them</p>
              {messageWeekdays === null ? (
                <EmptyNote inset>messages not counted {label}</EmptyNote>
              ) : (
                <WeekdayProfile averages={messageWeekdays} unit={{ label: "Average messages typed per weekday", empty: `no messages ${label}` }} />
              )}
            </>
          ) : (
            <>
              <p className="font-mono text-xs text-faint mb-4">average Claude Code replies per weekday {label}</p>
              <WeekdayProfile averages={weekdays} unit={{ label: "Average Claude Code replies per weekday", empty: `no replies ${label}` }} />
            </>
          )}
        </section>
      </div>

      <Records userId={userId} />
    </>
  );
}
