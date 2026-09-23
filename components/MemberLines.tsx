"use client";

import { useState } from "react";
import { CellTip } from "./CellTip";
import { useCellTip } from "./useCellTip";
import { tickAnchor } from "./dayTicks";
import { chartHeight, useChartWidth } from "./useChartWidth";
import { fmt, fmtDate } from "@/lib/format";
import type { MemberWeekRow } from "@/lib/stats";
import { shiftDate, type Metric } from "@/lib/window";

/** Past this many members the lines cross too often to follow, and each gets its own row instead. */
const MULTI_LIMIT = 4;
/** What a line the pointer is not on fades to, so the isolated one reads without the rest vanishing. */
const DIMMED = 0.2;
/** Vertical room one end-of-line login needs before the next one may start. */
const LABEL_GAP = 13;
/** Width the server draws at; the client re-reads the real one, so a unit is always one CSS pixel. */
const W = 720;
const ROW_H = 34;
/** Room the sparkline rows may take, so a big crew still fits its card. */
const ROWS_H = 238;
const AXIS_H = 26;
const LABEL_EVERY = 4;
/** Room one "22 Mar" needs before the next one, in pixels. */
const DATE_W = 56;
/** How wide a line's invisible hover target is, so a 2px line can be picked out with a mouse. */
const HIT_W = 14;
/** Room a row's peak needs at the right of the login column, in pixels. */
const PEAK_W = 52;
/** Room for the end-of-line logins in the multi-line chart, and for the row logins in the small multiples. */
const NAME_W = 132;

export type ChartMember = {
  userId: number;
  login: string;
  hue: string;
  /** True once the crew is larger than the palette and this member shares a hue with an earlier one. */
  wrapped: boolean;
};

/** Legend mark: a solid bar, or a dashed one for the members whose hue has come round a second time. */
export function MemberSwatch({ member, line }: { member: ChartMember; line?: boolean }) {
  const solid = { backgroundColor: member.hue };
  const dashed = { background: `repeating-linear-gradient(90deg, ${member.hue} 0 3px, #050505 3px 5px)` };
  return <span className={`w-3 shrink-0 inline-block ${line ? "h-[2px]" : "h-3"}`} style={member.wrapped ? dashed : solid} />;
}

/**
 * Nudge labels apart so none covers another, keeping their order and staying inside the plot: one
 * pass down from the top claiming `gap` each, then one back up so the run cannot spill past `max`.
 */
function stack(ys: number[], gap: number, min: number, max: number): number[] {
  const order = ys.map((_, i) => i).sort((a, b) => ys[a] - ys[b]);
  const out = ys.slice();
  let prev = min - gap;
  for (const i of order) {
    out[i] = Math.max(out[i], prev + gap);
    prev = out[i];
  }
  let next = max;
  for (const i of [...order].reverse()) {
    out[i] = Math.min(out[i], next);
    next = out[i] - gap;
  }
  return out;
}

/** The `weeks` buckets ending on `endSunday`, oldest first. */
export function weekStarts(weeks: number, endSunday: string): string[] {
  return Array.from({ length: weeks }, (_, i) => shiftDate(endSunday, -(weeks - 1 - i) * 7));
}

/** One per-week row per member, in the order they are given, with gaps filled as zeroes. */
function seriesOf(rows: MemberWeekRow[], members: ChartMember[], starts: string[], metric: Metric): number[][] {
  const column = new Map(starts.map((w, i) => [w, i]));
  const row = new Map(members.map((m, i) => [m.userId, i]));
  const out = members.map(() => starts.map(() => 0));
  for (const r of rows) {
    const x = column.get(r.weekStart);
    const y = row.get(r.userId);
    if (x === undefined || y === undefined) continue;
    out[y][x] += metric === "lines" ? r.lines : r.commits;
  }
  return out;
}

function Axis({ starts, y, from, to, every, width }: { starts: string[]; y: number; from: number; to: number; every: number; width: number }) {
  return (
    <>
      {starts.map((w, i) =>
        i % every === 0 ? (
          <text
            key={w}
            x={from + (i / (starts.length - 1)) * (to - from)}
            y={y}
            textAnchor={tickAnchor(from + (i / (starts.length - 1)) * (to - from), fmtDate(w), width)}
            className="fill-faint"
            fontSize={10}
            fontFamily="var(--font-mono)"
          >
            {fmtDate(w)}
          </text>
        ) : null,
      )}
    </>
  );
}

/**
 * Commits per week per member. Up to four members get one chart with a line each and the login
 * written at the end of its line; from five up the lines cross too often to follow, so each member
 * gets a row of their own, sharing the x-axis but each scaled to its own peak — a quiet member stays
 * readable next to a loud one, and the hover panel carries the numbers that comparing the heights
 * would otherwise be relied on for.
 *
 * Either way one member can be picked out of the rest: the pointer over a line or a legend entry
 * fades the others, and a click keeps them faded until the same entry is clicked again.
 */
export function MemberLines({ rows, members, weeks, endSunday, metric }: {
  rows: MemberWeekRow[];
  /** Leaderboard order; the colour, though, belongs to the member and never follows their rank. */
  members: ChartMember[];
  weeks: number;
  endSunday: string;
  metric: Metric;
}) {
  const [hover, setHover] = useState<number | null>(null);
  // Isolation: the pointer picks a member out while it is over them, a click keeps them picked out.
  const [pointed, setPointed] = useState<number | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);
  const { boxRef, point, onMouseMove, clear } = useCellTip();
  const width = useChartWidth(boxRef, W);
  const starts = weekStarts(weeks, endSunday);
  const series = seriesOf(rows, members, starts, metric);
  const small = members.length > MULTI_LIMIT;
  const isolated = pinned ?? pointed;
  const fade = (userId: number) => (isolated === null || isolated === userId ? 1 : DIMMED);
  const linesH = chartHeight(width, 0.5, 170, 280);
  // A crowded crew gets shorter rows rather than a card that runs past everything else on the page.
  const rowH = Math.max(20, Math.min(ROW_H, Math.floor(ROWS_H / members.length)));
  const H = small ? members.length * rowH + AXIS_H : linesH;
  // The login column gives up room first when there is not much of it.
  const nameW = Math.min(NAME_W, width * 0.3);
  const endLabels = !small;
  const left = small ? nameW : 8;
  const right = small ? width - 8 : width - nameW;
  const at = (i: number) => left + (i / (starts.length - 1)) * (right - left);
  /** Which week a client x falls on, so the crosshair does not need a hit rect of its own. */
  const weekAt = (clientX: number) => {
    const box = boxRef.current?.getBoundingClientRect();
    if (!box) return null;
    const i = Math.round(((clientX - box.left - left) / (right - left)) * (starts.length - 1));
    return Math.max(0, Math.min(starts.length - 1, i));
  };
  const labelEvery = Math.max(LABEL_EVERY, Math.ceil(DATE_W / Math.max(1, (right - left) / (starts.length - 1))));
  /** Characters a login fits at roughly 7px per mono glyph. In the rows it also shares the column
   *  with that row's peak, so it gives up the room that number needs rather than running under it. */
  const names = Math.max(5, Math.floor((nameW - 14 - (small ? PEAK_W : 0)) / 7));

  const peak = Math.max(1, ...series.flat());
  const lineTop = 12;
  const lineH = linesH - lineTop - AXIS_H;
  const endY = members.map((_, k) => lineTop + lineH - (series[k][starts.length - 1] / peak) * lineH);
  const labelY = endLabels ? stack(endY, LABEL_GAP, lineTop, lineTop + lineH) : endY;

  return (
    <div className="relative" ref={boxRef}>
      <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-dim mb-2">
        {members.map((m) => (
          <button
            key={m.userId}
            type="button"
            aria-pressed={pinned === m.userId}
            className="series-fade flex items-center gap-2 min-w-0 cursor-pointer hover:text-silver"
            style={{ opacity: fade(m.userId) }}
            onMouseEnter={() => setPointed(m.userId)}
            onMouseLeave={() => setPointed(null)}
            onFocus={() => setPointed(m.userId)}
            onBlur={() => setPointed(null)}
            onClick={() => setPinned((p) => (p === m.userId ? null : m.userId))}
          >
            <MemberSwatch member={m} line />
            <span className="truncate">{m.login}</span>
          </button>
        ))}
      </div>
      <svg
        viewBox={`0 0 ${width} ${H}`}
        width="100%"
        height={H}
        // Until the width is measured the viewBox is wider than the box; slicing draws the chart at
        // its true size and crops it for that one frame instead of shrinking it to a quarter size.
        preserveAspectRatio="xMinYMin slice"
        className="block"
        role="img"
        aria-label={`${metric === "lines" ? "Lines" : "Commits"} per week per crew member`}
        onMouseMove={(e) => {
          onMouseMove(e);
          setHover(weekAt(e.clientX));
        }}
        onMouseLeave={() => {
          clear();
          setHover(null);
          setPointed(null);
        }}
      >
        {starts.map((w, i) =>
          i % labelEvery === 0 ? <line key={`t-${w}`} x1={at(i)} x2={at(i)} y1={0} y2={H - AXIS_H} stroke="#1f1f1f" strokeWidth={1} /> : null,
        )}

        {small
          ? members.map((m, k) => {
              // Own y-axis per row: the rows answer "when was this member busy", not "who is busiest".
              const top = k * rowH;
              const max = Math.max(1, ...series[k]);
              const path = series[k].map((v, i) => `${at(i)},${top + rowH - 6 - (v / max) * (rowH - 12)}`).join(" L");
              return (
                <g key={m.userId} className="series-fade" opacity={fade(m.userId)}>
                  <line x1={left} x2={right} y1={top + rowH - 6} y2={top + rowH - 6} stroke="#1f1f1f" strokeWidth={1} />
                  <path d={`M${path}`} fill="none" stroke={m.hue} strokeWidth={1.5} strokeLinejoin="round" strokeDasharray={m.wrapped ? "5 3" : undefined} />
                  <text x={8} y={top + rowH / 2 + 3} className="fill-dim" fontSize={11} fontFamily="var(--font-mono)">
                    {m.login.length > names ? `${m.login.slice(0, names - 1)}…` : m.login}
                  </text>
                  <text x={nameW - 10} y={top + rowH / 2 + 3} textAnchor="end" className="fill-faint" fontSize={10} fontFamily="var(--font-mono)">
                    {fmt(max)}
                  </text>
                </g>
              );
            })
          : members.map((m, k) => (
              <g key={m.userId} className="series-fade" opacity={fade(m.userId)}>
                <path
                  d={`M${series[k].map((v, i) => `${at(i)},${lineTop + lineH - (v / peak) * lineH}`).join(" L")}`}
                  fill="none"
                  stroke={m.hue}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeDasharray={m.wrapped ? "6 4" : undefined}
                />
                {endLabels && (
                  <>
                    {Math.abs(labelY[k] - endY[k]) > 1 && (
                      <path d={`M${right},${endY[k]} L${right + 5},${labelY[k]}`} fill="none" stroke={m.hue} strokeWidth={1} opacity={0.6} />
                    )}
                    <text x={right + 8} y={labelY[k] + 3} className="fill-dim" fontSize={11} fontFamily="var(--font-mono)">
                      {m.login.length > names ? `${m.login.slice(0, names - 1)}…` : m.login}
                    </text>
                  </>
                )}
              </g>
            ))}

        {!small && <line x1={left} x2={right} y1={lineTop + lineH} y2={lineTop + lineH} stroke="#333" strokeWidth={1} />}
        {hover !== null && <line x1={at(hover)} x2={at(hover)} y1={0} y2={H - AXIS_H} stroke="#e0e2e5" strokeWidth={1} pointerEvents="none" />}
        {/* Isolation targets, over everything: a fat invisible stroke along each line, or the whole
            row in the small multiples. The crosshair is read from the pointer rather than from hit
            rects, so these can sit on top without taking the week away from it. */}
        {members.map((m, k) =>
          small ? (
            <rect
              key={`i-${m.userId}`}
              x={0}
              y={k * rowH}
              width={width}
              height={rowH}
              fill="transparent"
              className="cursor-pointer"
              onMouseEnter={() => setPointed(m.userId)}
              onMouseLeave={() => setPointed(null)}
              onClick={() => setPinned((p) => (p === m.userId ? null : m.userId))}
            />
          ) : (
            <path
              key={`i-${m.userId}`}
              d={`M${series[k].map((v, i) => `${at(i)},${lineTop + lineH - (v / peak) * lineH}`).join(" L")}`}
              fill="none"
              stroke="transparent"
              strokeWidth={HIT_W}
              strokeLinejoin="round"
              pointerEvents="stroke"
              className="cursor-pointer"
              onMouseEnter={() => setPointed(m.userId)}
              onMouseLeave={() => setPointed(null)}
              onClick={() => setPinned((p) => (p === m.userId ? null : m.userId))}
            />
          ),
        )}
        <Axis starts={starts} y={H - 8} from={left} to={right} every={labelEvery} width={width} />
      </svg>
      {hover !== null && point && (
        <CellTip point={point} className="panel px-3 py-2 font-mono text-xs">
          <div className="text-faint">week of {fmtDate(starts[hover])}</div>
          {members.map((m, k) => (
            <div key={m.userId} className="flex items-center gap-2">
              <MemberSwatch member={m} line />
              <span className="text-silver">{m.login}</span>
              <span className="text-dim ml-auto">{fmt(series[k][hover])}</span>
            </div>
          ))}
        </CellTip>
      )}
    </div>
  );
}
