"use client";

import { useEffect, useRef, useState } from "react";
import { fmt, fmtDate } from "@/lib/format";
import type { MemberDayRow } from "@/lib/stats";
import { rangeDays, shiftDate, type Metric } from "@/lib/window";
import type { ChartMember } from "./MemberLines";
import { useChartWidth } from "./useChartWidth";

/** Width the server draws at; the client re-reads the real one, so a unit is always one CSS pixel. */
const W = 1200;
const ROW = 34;
/** Room the bars may take between the counter and the scale, so a big crew still fits its card. */
const BARS_H = 218;
const TOP = 26; // room for the day counter above the first bar
const AXIS = 20; // the scale under the last bar
const NAME_W = 150;
const VALUE_W = 78;
/**
 * The whole race, start to finish, whatever the span. Fixed rather than proportional: a four-week race
 * then runs at about two days a second — a deliberate crawl — and a six-month one stays continuous
 * because the slide is always exactly one frame long. Scaling the duration instead made the long spans
 * drag without making the short ones better.
 */
const RUN_MS = 13000;
const GRID = [0, 0.25, 0.5, 0.75, 1];

/** Running totals per member, day by day. Built once; a frame only reads one column of it. */
function cumulative(rows: MemberDayRow[], members: ChartMember[], days: string[], metric: Metric): number[][] {
  const column = new Map(days.map((d, i) => [d, i]));
  const row = new Map(members.map((m, i) => [m.userId, i]));
  const out = members.map(() => days.map(() => 0));
  for (const r of rows) {
    const x = column.get(r.date);
    const y = row.get(r.userId);
    if (x === undefined || y === undefined) continue;
    out[y][x] += metric === "lines" ? r.lines : r.commits;
  }
  for (const line of out) for (let i = 1; i < line.length; i++) line[i] += line[i - 1];
  return out;
}

/**
 * Who pulled ahead, and when. Horizontal bars of a running total, one frame per day: every frame is
 * a real day's total, so nothing on screen is a number that never happened, and a day's step is small
 * enough that the bars crawl rather than jump between weeks.
 *
 * The scale is fixed to the whole race's winning total rather than to the current day, so the bar in
 * front grows too instead of sitting pinned at full width — the grid behind it is that scale. A slide
 * lasts exactly as long as a frame and runs at a constant speed, so one day's movement finishes as
 * the next begins.
 */
export function CrewRace({ rows, members, from, to, metric }: {
  rows: MemberDayRow[];
  members: ChartMember[];
  from: string;
  to: string;
  metric: Metric;
}) {
  const days = Array.from({ length: rangeDays({ from, to }) }, (_, i) => shiftDate(from, i));
  const totals = cumulative(rows, members, days, metric);
  const [day, setDay] = useState(0);
  const [run, setRun] = useState(0);
  const [mode, setMode] = useState<"play" | "scrub">("play");
  const box = useRef<HTMLDivElement>(null);
  const width = useChartWidth(box, W);
  const last = days.length - 1;

  // Every state change happens inside a frame callback, so mounting the race costs one render, not two.
  useEffect(() => {
    if (mode !== "play") return;
    const reduce = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
    let frame = 0;
    let started = 0;
    const step = (now: number) => {
      if (reduce) return setDay(last);
      if (started === 0) started = now;
      const done = Math.min(1, (now - started) / RUN_MS);
      setDay(Math.round(done * last));
      if (done < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [last, run, mode]);

  // Fixed for the whole race: running totals only grow, so the last day holds the largest.
  const peak = Math.max(1, ...totals.map((line) => line[last]));
  const standings = members
    .map((member, i) => ({ member, total: totals[i][day] }))
    .sort((a, b) => b.total - a.total || a.member.login.localeCompare(b.member.login));
  // A crowded crew gets shorter bars rather than a card that runs past everything else on the page.
  const row = Math.max(20, Math.min(ROW, Math.floor(BARS_H / members.length)));
  const H = TOP + members.length * row + AXIS;
  // The name and value columns give up room first when there is not much of it.
  const nameW = Math.min(NAME_W, width * 0.28);
  const valueW = Math.min(VALUE_W, width * 0.16);
  const barMax = width - nameW - valueW;
  /** Characters the name column fits at roughly 7px per mono glyph. */
  const names = Math.max(6, Math.floor((nameW - 12) / 7));
  /** One frame's worth of time; the slide is given exactly this, so the two never fight. */
  const slide = mode === "play" ? RUN_MS / Math.max(1, last) : 0;
  // Every rule is drawn, but a narrow track only has room to put a number under three of them.
  const labelled = barMax >= 420 ? GRID : [0, 0.5, 1];

  return (
    <div ref={box} style={{ "--race-step": `${Math.round(slide)}ms` } as React.CSSProperties}>
      <svg
        viewBox={`0 0 ${width} ${H}`}
        width="100%"
        height={H}
        preserveAspectRatio="xMinYMin slice"
        className="block"
        role="img"
        aria-label={`Running total of ${metric} per crew member, day by day`}
      >
        <defs>
          {members
            .filter((m) => m.wrapped)
            .map((m) => (
              <pattern key={m.userId} id={`race-${m.userId}`} width={6} height={6} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width={6} height={6} fill="#050505" />
                <rect width={3} height={6} fill={m.hue} />
              </pattern>
            ))}
        </defs>
        {/* The grid stands still while the bars move over it, so there is something to measure against. */}
        {members.map((_, rank) => (
          <rect key={rank} x={nameW} y={TOP + rank * row + 4} width={barMax} height={row - 10} fill="#0d0d0d" />
        ))}
        {GRID.map((g) => (
          <line key={g} x1={nameW + g * barMax} x2={nameW + g * barMax} y1={TOP} y2={TOP + members.length * row} stroke="#232323" strokeWidth={1} />
        ))}
        {labelled.map((g) => (
          <text
            key={g}
            x={nameW + g * barMax}
            y={H - 6}
            textAnchor={g === 0 ? "start" : g === 1 ? "end" : "middle"}
            className="fill-faint"
            fontSize={10}
            fontFamily="var(--font-mono)"
          >
            {fmt(Math.round(g * peak))}
          </text>
        ))}
        <text x={width} y={16} textAnchor="end" className="fill-dim" fontSize={13} fontFamily="var(--font-mono)">
          W {String(Math.floor(day / 7) + 1).padStart(2, "0")} · {fmtDate(days[day])}
        </text>
        {standings.map(({ member, total }, rank) => (
          <g key={member.userId} className="race-bar" style={{ transform: `translateY(${TOP + rank * row}px)` }}>
            <text x={nameW - 10} y={row / 2 + 4} textAnchor="end" className="fill-dim" fontSize={12} fontFamily="var(--font-mono)">
              {member.login.length > names ? `${member.login.slice(0, names - 1)}…` : member.login}
            </text>
            <rect
              x={nameW}
              y={4}
              height={row - 10}
              fill={member.wrapped ? `url(#race-${member.userId})` : member.hue}
              className="race-bar"
              style={{ width: Math.max(2, (total / peak) * barMax) }}
            />
            {/* The number keeps its own column: chasing the end of a moving bar would be the one thing here that jitters. */}
            <text x={width} y={row / 2 + 4} textAnchor="end" className="fill-silver" fontSize={12} fontFamily="var(--font-mono)">
              {fmt(total)}
            </text>
          </g>
        ))}
      </svg>
      <div className="flex items-center gap-3 mt-3 font-mono text-xs text-faint">
        <input
          type="range"
          min={0}
          max={last}
          value={day}
          onChange={(e) => {
            setMode("scrub");
            setDay(Number(e.target.value));
          }}
          aria-label="day"
          className="flex-1 accent-alert cursor-pointer"
        />
        <button
          type="button"
          onClick={() => {
            setMode("play");
            setDay(0);
            setRun((n) => n + 1);
          }}
          className="border-2 border-dark px-2 py-1 hover:border-silver hover:text-silver transition-colors cursor-pointer"
        >
          REPLAY
        </button>
      </div>
    </div>
  );
}
