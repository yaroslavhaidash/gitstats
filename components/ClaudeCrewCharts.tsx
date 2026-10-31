import type { ClaudeBoardRow } from "@/lib/claudestats";
import type { ClaudeCrewTimelines } from "@/lib/cached";
import { HUES, hue } from "@/lib/palette";
import { weekStart, type ClaudeMetric } from "@/lib/window";
import { CrewRace } from "./CrewRace";
import { EmptyNote } from "./EmptyNote";
import { MemberLines } from "./MemberLines";

const UNIT: Record<ClaudeMetric, string> = { tokens: "tokens", output: "output tokens" };

/** Each member's colour, by sign-up order as on the gitstats board, so every crew chart agrees. */
export function crewHues(rows: { userId: number }[]): Map<number, string> {
  const joined = rows.map((r) => r.userId).sort((a, b) => a - b);
  return new Map(joined.map((id, slot) => [id, hue(slot)]));
}

/**
 * The claudestats race and members' weekly tokens. Both charts count one number per member per day,
 * so the chosen metric travels in their `lines` field and the unit names it; colour follows the
 * member in sign-up order, as on the gitstats board.
 */
export function ClaudeCrewCharts({ rows, timelines, metric }: { rows: ClaudeBoardRow[]; timelines: ClaudeCrewTimelines; metric: ClaudeMetric }) {
  const joined = rows.map((r) => r.userId).sort((a, b) => a - b);
  const members = rows.map((r) => {
    const slot = joined.indexOf(r.userId);
    return { userId: r.userId, login: r.login, hue: hue(slot), wrapped: slot >= HUES.length };
  });
  const race = timelines.days
    .filter((d) => d.date >= timelines.raceFrom)
    .map((d) => ({ userId: d.userId, date: d.date, commits: 0, lines: d[metric], spreadLines: 0 }));
  const weeks = new Map<string, { weekStart: string; userId: number; commits: number; lines: number }>();
  for (const d of timelines.days) {
    if (d.date < timelines.weekFrom) continue;
    const start = weekStart(new Date(`${d.date}T00:00:00Z`));
    const key = `${d.userId}:${start}`;
    const row = weeks.get(key) ?? { weekStart: start, userId: d.userId, commits: 0, lines: 0 };
    row.lines += d[metric];
    weeks.set(key, row);
  }
  return (
    <>
      <section className="panel p-6 mt-8">
        <h2 className="font-sans font-bold text-lg mb-1">Race · last {timelines.raceWeeks} weeks</h2>
        <p className="font-mono text-xs text-faint mb-4">running total of {UNIT[metric]}, one frame per day · plays once, then the slider</p>
        {race.length === 0 ? (
          <EmptyNote inset>nothing counted yet</EmptyNote>
        ) : (
          <CrewRace rows={race} members={members} from={timelines.raceFrom} to={timelines.raceTo} metric="lines" unit={UNIT[metric]} />
        )}
      </section>
      <section className="panel p-6 mt-8 min-w-0">
        <h2 className="font-sans font-bold text-lg mb-1">Weekly {UNIT[metric]} per member</h2>
        <p className="font-mono text-xs text-faint mb-4">
          last {timelines.weekCount} weeks
          {members.length > 4 ? " · one row per member, each scaled to its own peak" : " · hover a line to isolate it, click to pin"}
        </p>
        {weeks.size === 0 ? (
          <EmptyNote inset>nothing counted in the last {timelines.weekCount} weeks</EmptyNote>
        ) : (
          <MemberLines rows={[...weeks.values()]} members={members} weeks={timelines.weekCount} endSunday={timelines.weekEnd} metric="lines" unit={`${UNIT[metric][0].toUpperCase()}${UNIT[metric].slice(1)}`} />
        )}
      </section>
    </>
  );
}
