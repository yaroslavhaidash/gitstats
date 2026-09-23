"use client";

import { useState } from "react";
import { CellTip } from "./CellTip";
import { useCellTip } from "./useCellTip";
import { fmt, fmtDate } from "@/lib/format";
import type { WeekRow } from "@/lib/stats";

const W = 720;
const H = 240;
const PAD = { top: 16, bottom: 28, left: 8, right: 8 };
const LABEL_EVERY = 4; // every fourth bucket carries a date, and a rule down to it

/** Diagonal hatch, one pattern per colour, so pending work reads as "not landed yet". */
function Hatch({ id, color }: { id: string; color: string }) {
  return (
    <pattern id={id} width={4} height={4} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width={4} height={4} fill="#050505" />
      <rect width={2} height={4} fill={color} />
    </pattern>
  );
}

/**
 * Mirrored weekly bars: additions rise above the baseline in green, deletions fall below in red.
 * Work still sitting on an unmerged branch is hatched on top of each bar; it is never ranked.
 * `endSunday` is the last bucket drawn, so a custom range ends on its own last week, not on today's.
 */
export function WeeklyBars({ weeks, totalWeeks, endSunday }: { weeks: WeekRow[]; totalWeeks: number; endSunday: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const { boxRef, point, onMouseMove, clear } = useCellTip();
  const byWeek = new Map(weeks.map((w) => [w.weekStart, w]));
  const slots: (WeekRow | null)[] = [];
  const sunday = new Date(`${endSunday}T00:00:00Z`);
  for (let i = totalWeeks - 1; i >= 0; i--) {
    const d = new Date(sunday.getTime() - i * 7 * 86_400_000).toISOString().slice(0, 10);
    slots.push(byWeek.get(d) ?? null);
  }
  // Merged work sets the scale; a few thousand pending lines must not flatten the bars that landed.
  const max = Math.max(1, ...weeks.map((w) => Math.max(w.additions, w.deletions)));
  const hasPending = weeks.some((w) => w.pendingAdditions > 0 || w.pendingDeletions > 0);
  const plotH = H - PAD.top - PAD.bottom;
  const mid = PAD.top + plotH / 2;
  const half = plotH / 2 - 4;
  const slotW = (W - PAD.left - PAD.right) / totalWeeks;
  const barW = Math.max(2, slotW - 3);
  const scale = (v: number) => (v / max) * half;
  const active = hover !== null ? slots[hover] : null;

  /** A pending cap taller than the plot is cut at the edge and marked; the hover panel has the real number. */
  const cap = (merged: number, pending: number) => {
    const drawn = Math.min(scale(pending), half - Math.min(scale(merged), half));
    return { drawn, clipped: scale(merged) + scale(pending) > half };
  };

  return (
    <div className="relative" ref={boxRef}>
      <div className="flex flex-wrap gap-x-6 gap-y-1 font-mono text-xs text-dim mb-2">
        <span className="flex items-center gap-2">
          <span className="w-3 h-3 bg-green inline-block" /> additions
        </span>
        <span className="flex items-center gap-2">
          <span className="w-3 h-3 bg-alert inline-block" /> deletions
        </span>
        {hasPending && (
          <span className="flex items-center gap-2">
            <span className="w-3 h-3 inline-block" style={{ background: "repeating-linear-gradient(45deg, #666 0 2px, #050505 2px 4px)" }} /> pending
          </span>
        )}
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto block"
        role="img"
        aria-label="Weekly lines added and deleted"
        onMouseMove={onMouseMove}
        onMouseLeave={clear}
      >
        <defs>
          <Hatch id="pending-add" color="#22c55e" />
          <Hatch id="pending-del" color="#ff3333" />
        </defs>
        {/* One faint rule per labelled column, so a bar high above the axis can be traced to its date. */}
        {slots.map((_, i) =>
          i % LABEL_EVERY === 0 ? (
            <line
              key={`tick-${i}`}
              x1={PAD.left + i * slotW + slotW / 2}
              x2={PAD.left + i * slotW + slotW / 2}
              y1={PAD.top}
              y2={H - 18}
              stroke="#1f1f1f"
              strokeWidth={1}
            />
          ) : null,
        )}
        <line x1={PAD.left} x2={W - PAD.right} y1={mid} y2={mid} stroke="#333" strokeWidth={1} />
        {slots.map((w, i) => {
          const x = PAD.left + i * slotW + (slotW - barW) / 2;
          const a = Math.min(w ? scale(w.additions) : 0, half);
          const d = Math.min(w ? scale(w.deletions) : 0, half);
          const pa = w ? cap(w.additions, w.pendingAdditions) : { drawn: 0, clipped: false };
          const pd = w ? cap(w.deletions, w.pendingDeletions) : { drawn: 0, clipped: false };
          const dim = hover !== null && hover !== i;
          const mx = x + barW / 2;
          return (
            <g key={i} opacity={dim ? 0.45 : 1} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={PAD.left + i * slotW} y={PAD.top} width={slotW} height={plotH} fill="transparent" />
              {a > 0 && <rect x={x} y={mid - 1 - a} width={barW} height={a} fill="#22c55e" />}
              {pa.drawn > 0 && <rect x={x} y={mid - 1 - a - pa.drawn} width={barW} height={pa.drawn} fill="url(#pending-add)" />}
              {pa.clipped && <polygon points={`${mx},${mid - 2 - half} ${mx - 3},${mid + 2 - half} ${mx + 3},${mid + 2 - half}`} fill="#22c55e" />}
              {d > 0 && <rect x={x} y={mid + 1} width={barW} height={d} fill="#ff3333" />}
              {pd.drawn > 0 && <rect x={x} y={mid + 1 + d} width={barW} height={pd.drawn} fill="url(#pending-del)" />}
              {pd.clipped && <polygon points={`${mx},${mid + 2 + half} ${mx - 3},${mid - 2 + half} ${mx + 3},${mid - 2 + half}`} fill="#ff3333" />}
            </g>
          );
        })}
        {slots.map((_, i) =>
          i % LABEL_EVERY === 0 ? (
            <text
              key={i}
              x={PAD.left + i * slotW + slotW / 2}
              y={H - 8}
              textAnchor="middle"
              className="fill-faint"
              fontSize={10}
              fontFamily="var(--font-mono)"
            >
              {fmtDate(new Date(sunday.getTime() - (totalWeeks - 1 - i) * 7 * 86_400_000))}
            </text>
          ) : null,
        )}
      </svg>
      <p className="font-mono text-xs text-faint mt-1">default branch{hasPending ? " · pending = unmerged branches, never ranked; ▲ means it runs off the top" : ""}</p>
      {hover !== null && point && (
        <CellTip point={point} className="panel px-3 py-2 font-mono text-xs">
          <div className="text-faint">week of {fmtDate(new Date(sunday.getTime() - (totalWeeks - 1 - hover) * 7 * 86_400_000))}</div>
          <div className="text-green">+{fmt(active?.additions ?? 0)}</div>
          <div className="text-alert">−{fmt(active?.deletions ?? 0)}</div>
          <div className="text-dim">{fmt(active?.commits ?? 0)} commits</div>
          {(active?.pendingAdditions ?? 0) + (active?.pendingDeletions ?? 0) > 0 && (
            <div className="text-faint">pending +{fmt(active?.pendingAdditions ?? 0)} −{fmt(active?.pendingDeletions ?? 0)}</div>
          )}
        </CellTip>
      )}
    </div>
  );
}
