"use client";

import { useState } from "react";
import { fmt } from "@/lib/format";
import type { RepoWeekTotals } from "@/lib/stats";
import { mixSeries, mixWeekStarts } from "./RepoMix";
import type { Metric } from "@/lib/window";

const SIZE = 220;
const MID = SIZE / 2;
const OUTER = 100;
const INNER = 62;

/** Two decimals is plenty for a 220-unit ring, and it keeps the server and the browser agreeing. */
const round = (n: number) => Math.round(n * 100) / 100;

/** A ring segment from `a0` to `a1` radians, drawn clockwise from twelve o'clock. */
function segment(a0: number, a1: number): string {
  const point = (r: number, a: number) => `${round(MID + r * Math.sin(a))},${round(MID - r * Math.cos(a))}`;
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M${point(OUTER, a0)} A${OUTER},${OUTER} 0 ${large} 1 ${point(OUTER, a1)} L${point(INNER, a1)} A${INNER},${INNER} 0 ${large} 0 ${point(INNER, a0)} Z`;
}

/**
 * How the half-year's work divides between repos, in total. The card beside this one normalises every
 * week to the same height, which answers "what was I on that week" but hides how much a week was
 * worth; this is the plain split, on the same ranking and the same colours.
 */
export function RepoShare({ rows, weeks, endSunday, masked, metric }: {
  rows: RepoWeekTotals[];
  weeks: number;
  endSunday: string;
  /** Node ids this viewer may not see the name of; they are labelled `private repo` and keep their colour. */
  masked: string[];
  metric: Metric;
}) {
  const [hover, setHover] = useState<string | null>(null);
  // Ranked and coloured by lines whatever the switch says, so a repo keeps its slice colour.
  const ranked = mixSeries(rows, mixWeekStarts(weeks, endSunday), new Set(masked));
  const series = ranked
    .map((s) => ({ ...s, value: metric === "lines" ? s.total : s.commits.reduce((n, c) => n + c, 0) }))
    .filter((s) => s.value > 0);
  const total = series.reduce((sum, s) => sum + s.value, 0);
  if (total === 0) return <p className="font-mono text-sm text-dim">&gt; nothing in the last {weeks} weeks_</p>;

  // Each slice starts where everything ranked above it ended; six of them, so the walk is free.
  const slices = series.map((s, i) => {
    const before = series.slice(0, i).reduce((sum, t) => sum + t.value, 0);
    return { ...s, share: s.value / total, a0: (before / total) * Math.PI * 2, a1: ((before + s.value) / total) * Math.PI * 2 };
  });
  const whole = slices.length === 1;

  return (
    <div className="flex flex-wrap items-center gap-6" onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-[180px] max-w-full h-auto block shrink-0" role="img" aria-label={`Share of ${metric} per repo`}>
        {/* One repo would make a segment whose ends meet, which draws as nothing: that case is a plain ring. */}
        {whole ? (
          <circle cx={MID} cy={MID} r={(OUTER + INNER) / 2} fill="none" stroke={slices[0].hue} strokeWidth={OUTER - INNER} />
        ) : (
          slices.map((s) => (
            <path
              key={s.key}
              d={segment(s.a0, s.a1)}
              fill={s.hue}
              stroke="#050505"
              strokeWidth={2}
              opacity={hover !== null && hover !== s.key ? 0.45 : 1}
              onMouseEnter={() => setHover(s.key)}
            />
          ))
        )}
        <text x={MID} y={MID - 2} textAnchor="middle" className="fill-silver" fontSize={22} fontFamily="var(--font-mono)" fontWeight="bold">
          {fmt(total)}
        </text>
        <text x={MID} y={MID + 18} textAnchor="middle" className="fill-faint" fontSize={12} fontFamily="var(--font-mono)">
          {metric}
        </text>
      </svg>
      <ul className="font-mono text-xs flex-1 min-w-[180px]">
        {slices.map((s) => (
          <li
            key={s.key}
            onMouseEnter={() => setHover(s.key)}
            className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 py-2 border-t-2 border-dark first:border-t-0 ${
              hover !== null && hover !== s.key ? "opacity-45" : ""
            }`}
          >
            <span className="flex items-center gap-2 min-w-0">
              <span className="w-3 h-3 shrink-0" style={{ backgroundColor: s.hue }} />
              <span className="text-silver truncate">{s.label}</span>
            </span>
            <span className="flex items-center gap-3 whitespace-nowrap">
              <span className="text-dim">{fmt(s.value)}</span>
              <span className="text-faint w-9 text-right">{s.share < 0.005 ? "<1%" : `${Math.round(s.share * 100)}%`}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
