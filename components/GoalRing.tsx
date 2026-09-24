"use client";

import { useState } from "react";
import { CellTip } from "./CellTip";
import { useCellTip } from "./useCellTip";
import { fmt, fmtDate } from "@/lib/format";
import type { PeriodTotal } from "@/lib/stats";

const SIZE = 112;
const STROKE = 10;
const R = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * R;
const DOT = 14;
const DOT_GAP = 8;

/**
 * The owner's weekly goal: a ring for this week so far (Monday to now, the WEEK tile's number) and
 * one dot per whole week before it, filled when the goal was reached. Only the owner's page renders it.
 */
export function GoalRing({ metric, goal, weeks }: { metric: "lines" | "commits"; goal: number; weeks: PeriodTotal[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const { boxRef, point, onMouseMove, clear } = useCellTip();
  const current = weeks[weeks.length - 1];
  const past = weeks.slice(0, -1);
  const value = current ? current[metric] : 0;
  const share = Math.min(1, value / goal);
  const done = value >= goal;
  const hits = past.filter((w) => w[metric] >= goal).length;
  const shown = hover === null ? null : past[hover];
  return (
    <section className="panel p-6 mb-8 flex flex-wrap items-center gap-8">
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={`${fmt(value)} of ${fmt(goal)} ${metric} this week`} className="shrink-0">
        <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="#2d2d2d" strokeWidth={STROKE} />
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          stroke={done ? "#22c55e" : "#ff3333"}
          strokeWidth={STROKE}
          strokeDasharray={`${share * CIRCUMFERENCE} ${CIRCUMFERENCE}`}
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
        />
        <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" fill="#ffffff" className="font-sans font-bold" fontSize={24}>
          {Math.floor(share * 100)}%
        </text>
      </svg>
      <div className="min-w-0">
        <div className="tag mb-2">WEEKLY GOAL · ONLY YOU SEE THIS</div>
        <p className="font-sans font-bold text-2xl text-white mb-1">
          {fmt(value)} <span className="font-mono font-normal text-sm text-dim">of {fmt(goal)} {metric} this week</span>
        </p>
        <p className="font-mono text-xs text-faint mb-4">&gt; Monday to now · {done ? "reached" : `${fmt(goal - value)} to go`}</p>
        <div ref={boxRef} className="relative inline-block">
          <svg
            width={past.length * (DOT + DOT_GAP) - DOT_GAP}
            height={DOT}
            role="img"
            aria-label={`goal reached in ${hits} of the last ${past.length} weeks`}
            onMouseMove={onMouseMove}
            onMouseLeave={() => {
              setHover(null);
              clear();
            }}
          >
            {past.map((w, i) => {
              const hit = w[metric] >= goal;
              return (
                <circle
                  key={w.start}
                  cx={i * (DOT + DOT_GAP) + DOT / 2}
                  cy={DOT / 2}
                  r={DOT / 2 - 1}
                  fill={hit ? "#ff3333" : "none"}
                  stroke={hit ? "#ff3333" : "#8b93a4"}
                  strokeWidth={1.5}
                  onMouseEnter={() => setHover(i)}
                />
              );
            })}
          </svg>
          {shown && point && (
            <CellTip point={point}>
              week of {fmtDate(shown.start)} · {fmt(shown[metric])} {metric} · {shown[metric] >= goal ? "reached" : "missed"}
            </CellTip>
          )}
        </div>
        <p className="font-mono text-xs text-faint mt-2">
          &gt; reached in {hits} of the last {past.length} weeks
        </p>
      </div>
    </section>
  );
}
