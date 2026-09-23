"use client";

import { useState } from "react";
import { CellTip } from "./CellTip";
import { useCellTip } from "./useCellTip";
import { fmt, fmtDate } from "@/lib/format";
import type { MemberDayRow } from "@/lib/stats";
import { daySeriesMode, rangeDays, shiftDate, sundayOf, type Metric } from "@/lib/window";
import { dayTicks, tickAnchor } from "./dayTicks";
import { MemberSwatch, type ChartMember } from "./MemberLines";
import { chartHeight, useChartWidth } from "./useChartWidth";

/** Width the server draws at; the client re-reads the real one, so a unit is always one CSS pixel. */
const W = 720;
const PAD = { top: 12, bottom: 26, left: 8, right: 8 };
/** At or under this many days a bucket is wide enough to hold every member side by side. */
const GROUPED_LIMIT = 14;
/** A group of bars takes this much of its bucket, up to a width past which it stops reading as bars. */
const BAR_SHARE = 0.78;
const GROUP_MAX = 60;
/** The surface gap that keeps two members' bars from reading as one block. */
const GAP = 2;
/** A small-multiple row never goes below this, however many members share the card. */
const MIN_ROW_H = 18;
const AXIS_H = 26;
/** A band above the rows for the shared scale's ceiling, so it never lands on the first row's login. */
const HEAD_H = 13;
/** Room for the row logins in the small multiples. */
const NAME_W = 132;

/** Diagonal hatch, one per member, so a figure placed from a week reads as "not counted per day". */
function Hatch({ id, color }: { id: string; color: string }) {
  return (
    <pattern id={id} width={4} height={4} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width={4} height={4} fill="#050505" />
      <rect width={2} height={4} fill={color} />
    </pattern>
  );
}

/**
 * A day's work per member. Under two weeks every member gets their own bar inside the day, side by
 * side in leaderboard order, because that is the comparison the card is for. Past that the bars are
 * too thin to sit beside each other, so each member takes a row of their own — all sharing one y
 * scale, so a tall row really is a busier member — and a crosshair reads every row at the day under
 * the pointer. Spans longer than a quarter bucket to weeks rather than draw less than was asked for.
 *
 * Commits are the merged calendar — GitHub's public days plus the private-repo days each member
 * shares with their crew. Lines are counted per day where a linked computer counted them and placed
 * across a week's days where only GitHub's weekly figure exists; the placed part is hatched.
 */
export function MemberDaily({ rows, members, from, to, metric }: {
  rows: MemberDayRow[];
  /** Leaderboard order; the colour, though, belongs to the member and never follows their rank. */
  members: ChartMember[];
  from: string;
  to: string;
  metric: Metric;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const { boxRef, point, onMouseMove, clear } = useCellTip();
  const width = useChartWidth(boxRef, W);
  const days = Array.from({ length: rangeDays({ from, to }) }, (_, i) => shiftDate(from, i));
  const byWeek = daySeriesMode({ from, to }) === "weeks";
  // One bucket per day, or per GitHub week (Sunday-opening) once the window is longer than a quarter.
  const buckets = byWeek ? [...new Set(days.map(sundayOf))] : days;
  const bucketAt = new Map(buckets.map((b, i) => [b, i]));
  const column = new Map(days.map((d, i) => [d, byWeek ? (bucketAt.get(sundayOf(d)) ?? -1) : i]));
  const row = new Map(members.map((m, i) => [m.userId, i]));
  const counts = members.map(() => buckets.map(() => 0));
  /** The part of the bucket above that was placed from a weekly total; commits are never placed. */
  const placed = members.map(() => buckets.map(() => 0));
  for (const r of rows) {
    const x = column.get(r.date);
    const y = row.get(r.userId);
    if (x === undefined || x < 0 || y === undefined) continue;
    counts[y][x] += metric === "lines" ? r.lines : r.commits;
    if (metric === "lines") placed[y][x] += r.spreadLines;
  }
  const grouped = buckets.length <= GROUPED_LIMIT;
  // One scale for every bar in the card, grouped or in rows: the whole point is comparing members.
  const max = Math.max(1, ...counts.flat());

  // The rows split the height the grouped bars would have taken, so the card is the same size either
  // way and a three-member crew does not leave a third of its panel empty.
  const budget = chartHeight(width, 0.44, 150, 250);
  const rowH = Math.max(MIN_ROW_H, Math.floor((budget - AXIS_H - HEAD_H) / members.length));
  const H = grouped ? budget : members.length * rowH + AXIS_H + HEAD_H;
  // The login column gives up room first when there is not much of it.
  const nameW = grouped ? 0 : Math.min(NAME_W, width * 0.3);
  /** Characters a login fits at roughly 7px per mono glyph. */
  const names = Math.max(6, Math.floor((nameW - 14) / 7));

  const left = grouped ? PAD.left : nameW;
  const right = width - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const slotW = (right - left) / buckets.length;
  const at = (i: number) => left + i * slotW + slotW / 2;
  const base = PAD.top + plotH;
  const ticks = dayTicks(buckets, slotW);
  const fill = (m: ChartMember) => (m.wrapped ? `url(#mix-${m.userId})` : m.hue);

  // Grouped, the members split what one bucket gives them; in rows each member has it to themselves.
  const groupW = Math.min(slotW * BAR_SHARE, GROUP_MAX);
  const barW = grouped ? Math.max(1, groupW / members.length - GAP) : Math.max(1, groupW);

  return (
    <div className="relative" ref={boxRef}>
      <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-dim mb-2">
        {members.map((m) => (
          <span key={m.userId} className="flex items-center gap-2 min-w-0">
            <MemberSwatch member={m} />
            <span className="truncate">{m.login}</span>
          </span>
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
        aria-label={`${metric === "lines" ? "Lines" : "Commits"} per ${byWeek ? "week" : "day"} per crew member`}
        onMouseMove={onMouseMove}
        onMouseLeave={clear}
      >
        <defs>
          {/* A crew larger than the palette sends a hue round twice; the second run is hatched, so no two members look alike. */}
          {members
            .filter((m) => m.wrapped)
            .map((m) => (
              <pattern key={m.userId} id={`mix-${m.userId}`} width={5} height={5} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width={5} height={5} fill="#050505" />
                <rect width={2.5} height={5} fill={m.hue} />
              </pattern>
            ))}
          {members.map((m) => (
            <Hatch key={m.userId} id={`spread-${m.userId}`} color={m.hue} />
          ))}
        </defs>

        {grouped ? (
          <>
            <line x1={left} x2={right} y1={base} y2={base} stroke="#333" strokeWidth={1} />
            {buckets.map((d, i) => (
              <g key={d} opacity={hover !== null && hover !== i ? 0.45 : 1} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                <rect x={left + i * slotW} y={PAD.top} width={slotW} height={plotH} fill="transparent" />
                {members.map((m, k) => {
                  const h = (counts[k][i] / max) * plotH;
                  if (h <= 0) return null;
                  const solid = ((counts[k][i] - placed[k][i]) / max) * plotH;
                  const x = at(i) - groupW / 2 + k * (groupW / members.length);
                  return (
                    <g key={m.userId}>
                      <rect x={x} y={base - h} width={barW} height={h} fill={`url(#spread-${m.userId})`} />
                      {solid > 0 && <rect x={x} y={base - solid} width={barW} height={solid} fill={fill(m)} />}
                    </g>
                  );
                })}
              </g>
            ))}
          </>
        ) : (
          <>
            {members.map((m, k) => {
              const top = HEAD_H + k * rowH;
              const rowPlot = rowH - 8;
              return (
                <g key={m.userId}>
                  <line x1={left} x2={right} y1={top + rowH - 4} y2={top + rowH - 4} stroke="#1f1f1f" strokeWidth={1} />
                  {counts[k].map((v, i) => {
                    if (v <= 0) return null;
                    const h = Math.max(1, (v / max) * rowPlot);
                    const solid = Math.round(((v - placed[k][i]) / max) * rowPlot);
                    const floor = top + rowH - 4;
                    return (
                      <g key={buckets[i]}>
                        <rect x={at(i) - barW / 2} y={floor - h} width={barW} height={h} fill={`url(#spread-${m.userId})`} />
                        {solid > 0 && <rect x={at(i) - barW / 2} y={floor - solid} width={barW} height={solid} fill={fill(m)} />}
                      </g>
                    );
                  })}
                  <text x={8} y={top + rowH / 2 + 3} className="fill-dim" fontSize={11} fontFamily="var(--font-mono)">
                    {m.login.length > names ? `${m.login.slice(0, names - 1)}…` : m.login}
                  </text>
                </g>
              );
            })}
            {/* One scale for every row, so its ceiling is written once rather than per row. */}
            <text x={left} y={9} className="fill-faint" fontSize={10} fontFamily="var(--font-mono)">
              max {fmt(max)}
            </text>
            {hover !== null && (
              <line x1={at(hover)} x2={at(hover)} y1={HEAD_H} y2={H - AXIS_H} stroke="#e0e2e5" strokeWidth={1} pointerEvents="none" />
            )}
            {buckets.map((d, i) => (
              <rect
                key={`h-${d}`}
                x={left + i * slotW}
                y={HEAD_H}
                width={slotW}
                height={H - AXIS_H - HEAD_H}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              />
            ))}
          </>
        )}

        {ticks.map((t) =>
          t.label === null ? (
            <circle key={t.index} cx={at(t.index)} cy={H - 11} r={1} className="fill-faint" />
          ) : (
            <text
              key={t.index}
              x={at(t.index)}
              y={H - 8}
              textAnchor={tickAnchor(at(t.index), t.label, width)}
              className="fill-faint"
              fontSize={10}
              fontFamily="var(--font-mono)"
            >
              {t.label}
            </text>
          ),
        )}
      </svg>
      {hover !== null && point && (
        <CellTip point={point} className="panel px-3 py-2 font-mono text-xs">
          <div className="text-faint">
            {byWeek ? "week of " : ""}
            {fmtDate(buckets[hover])}
          </div>
          {members.every((_m, k) => counts[k][hover] === 0) ? (
            <div className="text-dim">nothing</div>
          ) : (
            members.map((m, k) => (
              <div key={m.userId} className="flex items-center gap-2">
                <MemberSwatch member={m} />
                <span className="text-silver">{m.login}</span>
                <span className="text-dim ml-auto">
                  {fmt(counts[k][hover])}
                  {placed[k][hover] > 0 ? <span className="text-faint"> · {fmt(placed[k][hover])} placed</span> : null}
                </span>
              </div>
            ))
          )}
        </CellTip>
      )}
    </div>
  );
}
