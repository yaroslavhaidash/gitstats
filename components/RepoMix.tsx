"use client";

import { useState } from "react";
import { CellTip } from "./CellTip";
import { useCellTip } from "./useCellTip";
import { tickAnchor } from "./dayTicks";
import { chartHeight, useChartWidth } from "./useChartWidth";
import { fmt, fmtDate } from "@/lib/format";
import { hue } from "@/lib/palette";
import type { RepoWeekTotals } from "@/lib/stats";
import { shiftDate, type Metric } from "@/lib/window";

/** Width the server draws at; the client re-reads the real one, so a unit is always one CSS pixel. */
const W = 720;
const PAD = { top: 10, bottom: 26, left: 8, right: 8 };
/** Repos drawn on their own; everything past this folds into the last slot, which is always "other". */
const NAMED = 5;
const LABEL_EVERY = 4;
/** Room one "22 Mar" needs before the next one, in pixels. */
const DATE_W = 56;
const GAP = 2; // the surface gap between two repos' segments, and between two weeks' columns
const MASKED = "private repo";

export type MixSeries = {
  key: string;
  label: string;
  hue: string;
  /** Lines touched per week, in the week order the caller passed. */
  lines: number[];
  commits: number[];
  /** Lines over the whole span: the ranking, and what the share donut beside this card reads. */
  total: number;
};

/**
 * Top repos over the span, in a fixed order, with the tail folded into "other". Both this card and
 * the share donut read it, so a repo is the same colour on each. The **ranking is always by lines**,
 * whichever metric is being drawn, so flipping the switch never repaints a repo.
 */
export function mixSeries(rows: RepoWeekTotals[], weeks: string[], masked: Set<string>): MixSeries[] {
  const totals = new Map<string, { label: string; total: number }>();
  for (const r of rows) {
    const seen = totals.get(r.nodeId) ?? { label: masked.has(r.nodeId) ? MASKED : r.nameWithOwner, total: 0 };
    seen.total += r.additions + r.deletions;
    totals.set(r.nodeId, seen);
  }
  // Lines decide the order; the node id breaks ties so the colours do not shuffle between renders.
  const ranked = [...totals.entries()].sort((a, b) => b[1].total - a[1].total || a[0].localeCompare(b[0]));
  const head = ranked.slice(0, NAMED).map(([nodeId, t]) => ({ key: nodeId, label: t.label }));
  const tail = new Set(ranked.slice(NAMED).map(([nodeId]) => nodeId));
  const keys = tail.size > 0 ? [...head, { key: "other", label: "other" }] : head;
  const index = new Map(keys.map((k, i) => [k.key, i]));
  const series = keys.map((k, i) => ({ ...k, hue: hue(i), lines: weeks.map(() => 0), commits: weeks.map(() => 0), total: 0 }));
  const week = new Map(weeks.map((w, i) => [w, i]));
  for (const r of rows) {
    const col = week.get(r.weekStart);
    const row = index.get(tail.has(r.nodeId) ? "other" : r.nodeId);
    if (col === undefined || row === undefined) continue;
    series[row].lines[col] += r.additions + r.deletions;
    series[row].commits[col] += r.commits;
    series[row].total += r.additions + r.deletions;
  }
  return series;
}

/** The `weeks` buckets ending on `endSunday`, oldest first. */
export function mixWeekStarts(weeks: number, endSunday: string): string[] {
  return Array.from({ length: weeks }, (_, i) => shiftDate(endSunday, -(weeks - 1 - i) * 7));
}

/**
 * Where the week's lines went, as a share: one column per week, filled to the same height and split
 * between repos, so the card answers "what share of my work went where" rather than "how much did I
 * do". A week with nothing in it is simply an empty column.
 */
export function RepoMix({ rows, weeks, endSunday, masked, metric }: {
  rows: RepoWeekTotals[];
  weeks: number;
  endSunday: string;
  /** Node ids this viewer may not see the name of; they are labelled `private repo` and keep their colour. */
  masked: string[];
  metric: Metric;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const { boxRef, point, onMouseMove, clear } = useCellTip();
  const width = useChartWidth(boxRef, W);
  const H = chartHeight(width, 0.44, 150, 250);
  const starts = mixWeekStarts(weeks, endSunday);
  const series = mixSeries(rows, starts, new Set(masked));
  const value = (s: MixSeries, i: number) => (metric === "lines" ? s.lines[i] : s.commits[i]);
  const totals = starts.map((_, i) => series.reduce((sum, s) => sum + value(s, i), 0));
  const plotH = H - PAD.top - PAD.bottom;
  const slotW = (width - PAD.left - PAD.right) / weeks;
  const colW = Math.max(2, slotW - GAP);
  const at = (i: number) => PAD.left + i * slotW;
  const base = PAD.top + plotH;
  // Every fourth week, or fewer when the columns are too close for the dates to clear each other.
  const labelEvery = Math.max(LABEL_EVERY, Math.ceil(DATE_W / Math.max(1, slotW)));

  return (
    <div className="relative" ref={boxRef}>
      <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-dim mb-2">
        {series.map((s) => (
          <span key={s.key} className="flex items-center gap-2 min-w-0">
            <span className="w-3 h-3 shrink-0 inline-block" style={{ backgroundColor: s.hue }} />
            <span className="truncate">{s.label}</span>
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
        aria-label={`Share of weekly ${metric} per repo`}
        onMouseMove={onMouseMove}
        onMouseLeave={clear}
      >
        {[0.25, 0.5, 0.75].map((g) => (
          <line key={g} x1={PAD.left} x2={width - PAD.right} y1={base - g * plotH} y2={base - g * plotH} stroke="#1f1f1f" strokeWidth={1} />
        ))}
        {starts.map((w, i) => {
          let top = base;
          return (
            <g key={w} opacity={hover !== null && hover !== i ? 0.45 : 1} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={at(i)} y={PAD.top} width={slotW} height={plotH} fill="transparent" />
              {totals[i] > 0 &&
                series.map((s) => {
                  const h = (value(s, i) / totals[i]) * plotH;
                  if (h <= 0) return null;
                  top -= h;
                  // The gap comes out of the segment, so a column still reaches the same height overall.
                  return <rect key={s.key} x={at(i)} y={top} width={colW} height={Math.max(1, h - GAP)} fill={s.hue} />;
                })}
            </g>
          );
        })}
        <line x1={PAD.left} x2={width - PAD.right} y1={base} y2={base} stroke="#333" strokeWidth={1} />
        {starts.map((w, i) =>
          i % labelEvery === 0 ? (
            <text
              key={`l-${w}`}
              x={at(i) + colW / 2}
              y={H - 8}
              textAnchor={tickAnchor(at(i) + colW / 2, fmtDate(w), width)}
              className="fill-faint"
              fontSize={10}
              fontFamily="var(--font-mono)"
            >
              {fmtDate(w)}
            </text>
          ) : null,
        )}
      </svg>
      {hover !== null && point && (
        <CellTip point={point} className="panel px-3 py-2 font-mono text-xs">
          <div className="text-faint">week of {fmtDate(starts[hover])}</div>
          {totals[hover] === 0 ? (
            <div className="text-dim">nothing</div>
          ) : (
            series
              .filter((s) => value(s, hover) > 0)
              .map((s) => (
                <div key={s.key} className="flex items-center gap-2">
                  <span className="w-2 h-2 shrink-0 inline-block" style={{ backgroundColor: s.hue }} />
                  <span className="text-silver">{s.label}</span>
                  <span className="text-dim ml-auto">
                    {Math.round((value(s, hover) / totals[hover]) * 100)}% · {fmt(value(s, hover))}
                  </span>
                </div>
              ))
          )}
        </CellTip>
      )}
    </div>
  );
}
