"use client";

import { useState } from "react";
import { CellTip } from "./CellTip";
import { dayTicks, tickAnchor } from "./dayTicks";
import { useCellTip } from "./useCellTip";
import { chartHeight, useChartWidth } from "./useChartWidth";
import { fmt, fmtDate } from "@/lib/format";
import type { DailyLineRow } from "@/lib/stats";
import { rangeDays, shiftDate, type Metric } from "@/lib/window";

/** Width the server draws at; the client re-reads the real one, so a unit is always one CSS pixel. */
const W = 1200;
const PAD = { top: 14, bottom: 26, left: 8, right: 8 };
/** A bar takes this much of its day, up to a width past which it stops reading as a bar. */
const BAR_SHARE = 0.7;
const BAR_MAX = 80;
/** Commits are their own measure, so they get their own hue rather than the add/delete pair's. */
const COMMIT_HUE = "#d95926";

type Bucket = { date: string; additions: number; deletions: number; commits: number; spreadAdditions: number; spreadDeletions: number; spreadCommits: number };

/** Diagonal hatch, one per colour, so a figure placed from a week reads as "not counted per day". */
function Hatch({ id, color }: { id: string; color: string }) {
  return (
    <pattern id={id} width={4} height={4} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width={4} height={4} fill="#050505" />
      <rect width={2} height={4} fill={color} />
    </pattern>
  );
}

/** Every day in the span, so a quiet day is a gap in the series rather than a missing bar. */
function buckets(rows: DailyLineRow[], from: string, to: string): Bucket[] {
  const slots = new Map<string, Bucket>();
  for (let i = 0; i < rangeDays({ from, to }); i++) {
    const d = shiftDate(from, i);
    slots.set(d, { date: d, additions: 0, deletions: 0, commits: 0, spreadAdditions: 0, spreadDeletions: 0, spreadCommits: 0 });
  }
  for (const r of rows) {
    const slot = slots.get(r.date);
    if (!slot) continue;
    slot.additions += r.additions;
    slot.deletions += r.deletions;
    slot.commits += r.commits;
    slot.spreadAdditions += r.spreadAdditions;
    slot.spreadDeletions += r.spreadDeletions;
    slot.spreadCommits += r.spreadCommits;
  }
  return [...slots.values()];
}

/**
 * Lines per day: additions rise above the baseline in green, deletions fall below in red, one bar
 * per day whatever the window — a year is 365 thin bars rather than weekly buckets, because the card
 * at the top of the page already draws the year by week, and from a different source.
 */
export function DailyLines({ rows, from, to, metric }: { rows: DailyLineRow[]; from: string; to: string; metric: Metric }) {
  const [hover, setHover] = useState<number | null>(null);
  const { boxRef, point, onMouseMove, clear } = useCellTip();
  const width = useChartWidth(boxRef, W);
  const H = chartHeight(width, 0.26, 170, 290);
  const slots = buckets(rows, from, to);
  const plotH = H - PAD.top - PAD.bottom;
  /**
   * One scale for both directions, with the baseline where the two peaks meet rather than halfway
   * down: deletions are usually a fraction of additions, and a centred baseline spends half the card
   * on empty space below it. Both sides still read against the same unit, so the shape is honest.
   */
  // Commits have no negative half, so their baseline falls to the floor and the bars own the card.
  const up = (b: Bucket) => (metric === "lines" ? b.additions : b.commits);
  const down = (b: Bucket) => (metric === "lines" ? b.deletions : 0);
  const upSpread = (b: Bucket) => (metric === "lines" ? b.spreadAdditions : b.spreadCommits);
  const downSpread = (b: Bucket) => (metric === "lines" ? b.spreadDeletions : 0);
  const upHue = metric === "lines" ? "#22c55e" : COMMIT_HUE;
  const placed = slots.some((b) => upSpread(b) > 0 || downSpread(b) > 0);
  const peakAdd = Math.max(0, ...slots.map(up));
  const peakDel = Math.max(0, ...slots.map(down));
  const unit = (plotH - 8) / Math.max(1, peakAdd + peakDel);
  const mid = PAD.top + 4 + peakAdd * unit;
  const slotW = (width - PAD.left - PAD.right) / slots.length;
  const barW = Math.max(1, Math.min(slotW * BAR_SHARE, BAR_MAX));
  // A day with any work at all keeps a visible sliver: +62 beside a +49k day is 0.1px otherwise, and
  // an axis label with nothing above it reads as missing data rather than as a quiet day.
  const scale = (v: number) => (v > 0 ? Math.max(1, v * unit) : 0);
  const at = (i: number) => PAD.left + i * slotW + slotW / 2;
  const ticks = dayTicks(
    slots.map((b) => b.date),
    slotW,
  );
  const active = hover !== null ? slots[hover] : null;

  return (
    <div className="relative" ref={boxRef}>
      <div className="flex flex-wrap gap-x-6 gap-y-1 font-mono text-xs text-dim mb-2">
        {metric === "lines" ? (
          <>
            <span className="flex items-center gap-2">
              <span className="w-3 h-3 bg-green inline-block" /> additions
            </span>
            <span className="flex items-center gap-2">
              <span className="w-3 h-3 bg-alert inline-block" /> deletions
            </span>
          </>
        ) : (
          <span className="flex items-center gap-2">
            <span className="w-3 h-3 inline-block" style={{ backgroundColor: COMMIT_HUE }} /> commits
          </span>
        )}
        {placed && (
          <span className="flex items-center gap-2">
            <span className="w-3 h-3 inline-block" style={{ background: "repeating-linear-gradient(45deg, #666 0 2px, #050505 2px 4px)" }} /> placed from a
            week
          </span>
        )}
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
        aria-label={metric === "lines" ? "Lines added and deleted per day" : "Commits per day"}
        onMouseMove={onMouseMove}
        onMouseLeave={clear}
      >
        <defs>
          <Hatch id="spread-up" color={upHue} />
          <Hatch id="spread-down" color="#ff3333" />
        </defs>
        <line x1={PAD.left} x2={width - PAD.right} y1={mid} y2={mid} stroke="#333" strokeWidth={1} />
        {slots.map((b, i) => {
          const x = at(i) - barW / 2;
          // The counted part sits on the baseline and whatever was placed from a week rides on top of it.
          const a = scale(up(b));
          const d = scale(down(b));
          const aCounted = scale(up(b) - upSpread(b));
          const dCounted = scale(down(b) - downSpread(b));
          const dim = hover !== null && hover !== i;
          return (
            <g key={b.date} opacity={dim ? 0.45 : 1} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={PAD.left + i * slotW} y={PAD.top} width={slotW} height={plotH} fill="transparent" />
              {a > 0 && <rect x={x} y={mid - 1 - a} width={barW} height={a} fill="url(#spread-up)" />}
              {aCounted > 0 && <rect x={x} y={mid - 1 - aCounted} width={barW} height={aCounted} fill={upHue} />}
              {d > 0 && <rect x={x} y={mid + 1} width={barW} height={d} fill="url(#spread-down)" />}
              {dCounted > 0 && <rect x={x} y={mid + 1} width={barW} height={dCounted} fill="#ff3333" />}
            </g>
          );
        })}
        {hover !== null && <line x1={at(hover)} x2={at(hover)} y1={PAD.top} y2={H - PAD.bottom} stroke="#8b93a4" strokeWidth={1} pointerEvents="none" />}
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
          <div className="text-faint">{fmtDate(active?.date ?? from)}</div>
          {metric === "lines" && <div className="text-green">+{fmt(active?.additions ?? 0)}</div>}
          {metric === "lines" && <div className="text-alert">−{fmt(active?.deletions ?? 0)}</div>}
          <div className="text-dim">{fmt(active?.commits ?? 0)} commits</div>
          {active !== null && upSpread(active) + downSpread(active) > 0 && <div className="text-faint">placed from a weekly figure</div>}
        </CellTip>
      )}
    </div>
  );
}
