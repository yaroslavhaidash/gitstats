"use client";

import { useState } from "react";
import { fmt } from "@/lib/format";
import type { Metric } from "@/lib/window";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const W = 360;
const H = 190;
const PAD = { top: 18, bottom: 22, left: 34, right: 8 };
const BAR = 22; // capped thickness; the slot's leftover stays as air

/** What one bar means, which follows the metric switch the rest of the page reads. */
const UNIT: Record<Metric, { label: string; empty: string }> = {
  lines: { label: "Average lines touched per weekday", empty: "no lines in this window" },
  commits: { label: "Average commits per weekday", empty: "no commits in this window" },
};

/** Average of the selected metric per weekday over the window; the strongest day carries the accent. */
export function WeekdayProfile({ averages, metric }: { averages: number[]; metric: Metric }) {
  const unit = UNIT[metric];
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...averages);
  const best = averages.indexOf(max);
  const plotH = H - PAD.top - PAD.bottom;
  const slot = (W - PAD.left - PAD.right) / 7;
  const base = PAD.top + plotH;
  if (max === 0) return <p className="font-mono text-sm text-dim">&gt; {unit.empty}_</p>;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block w-full h-auto" role="img" aria-label={unit.label} onMouseLeave={() => setHover(null)}>
      <line x1={PAD.left} x2={W - PAD.right} y1={base} y2={base} stroke="#333" strokeWidth={1} />
      {averages.map((v, i) => {
        const h = (v / max) * plotH;
        const x = PAD.left + i * slot + (slot - BAR) / 2;
        const top = base - h;
        const strongest = i === best;
        return (
          <g key={i} opacity={hover !== null && hover !== i ? 0.5 : 1} onMouseEnter={() => setHover(i)}>
            <rect x={PAD.left + i * slot} y={PAD.top} width={slot} height={plotH} fill="transparent" />
            {h > 0 && (
              <path
                d={`M${x} ${base} L${x} ${top + 4} Q${x} ${top} ${x + 4} ${top} L${x + BAR - 4} ${top} Q${x + BAR} ${top} ${x + BAR} ${top + 4} L${x + BAR} ${base} Z`}
                fill={strongest ? "#ff3333" : "#6b7280"}
              />
            )}
            {(strongest || hover === i) && (
              <text x={x + BAR / 2} y={top - 5} textAnchor="middle" fontSize={10} fontFamily="var(--font-mono)" className="fill-silver">
                {v >= 10 ? fmt(Math.round(v)) : v.toFixed(1)}
              </text>
            )}
            <text
              x={x + BAR / 2}
              y={H - 7}
              textAnchor="middle"
              fontSize={10}
              fontFamily="var(--font-mono)"
              className={strongest ? "fill-silver" : "fill-faint"}
            >
              {DAYS[i]}
            </text>
          </g>
        );
      })}
      <text x={PAD.left - 6} y={base} textAnchor="end" fontSize={9} fontFamily="var(--font-mono)" className="fill-faint">
        0
      </text>
    </svg>
  );
}
