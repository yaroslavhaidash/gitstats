"use client";

import { useState } from "react";
import { CellTip } from "./CellTip";
import { tickAnchor } from "./dayTicks";
import { useCellTip } from "./useCellTip";
import { chartHeight, useChartWidth } from "./useChartWidth";
import { fmt, fmtDate } from "@/lib/format";

const W = 720;
const PAD = { top: 14, bottom: 26, left: 8, right: 8 };
const BAR_SHARE = 0.7;
const COMMIT_HUE = "#d95926";
/** Room one "05 Apr" label needs, so the stride follows the chart's real width. */
const LABEL_W = 90;

/** Commits per Sunday-start week, one bar each, for a GitHub user who is not a member yet. */
export function CommitWeeks({ weeks }: { weeks: { weekStart: string; commits: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const { boxRef, point, onMouseMove, clear } = useCellTip();
  const width = useChartWidth(boxRef, W);
  const H = chartHeight(width, 0.3, 150, 240);
  const plotH = H - PAD.top - PAD.bottom;
  const peak = Math.max(1, ...weeks.map((w) => w.commits));
  const slotW = (width - PAD.left - PAD.right) / Math.max(1, weeks.length);
  const barW = Math.max(1, slotW * BAR_SHARE);
  const at = (i: number) => PAD.left + i * slotW + slotW / 2;
  const base = PAD.top + plotH;
  // A week's date every few bars, as many as fit, anchored to the newest week.
  const every = Math.max(1, Math.ceil(LABEL_W / slotW));
  const ticks = weeks.flatMap((w, index) => ((weeks.length - 1 - index) % every === 0 ? [{ index, label: fmtDate(w.weekStart) }] : []));
  const active = hover !== null ? weeks[hover] : null;

  return (
    <div className="relative" ref={boxRef}>
      <svg
        viewBox={`0 0 ${width} ${H}`}
        width="100%"
        height={H}
        preserveAspectRatio="xMinYMin slice"
        className="block"
        role="img"
        aria-label="Commits per week"
        onMouseMove={onMouseMove}
        onMouseLeave={clear}
      >
        <line x1={PAD.left} x2={width - PAD.right} y1={base} y2={base} stroke="#333" strokeWidth={1} />
        {weeks.map((w, i) => {
          const h = w.commits > 0 ? Math.max(1, (w.commits / peak) * (plotH - 4)) : 0;
          return (
            <g key={w.weekStart} opacity={hover !== null && hover !== i ? 0.45 : 1} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={PAD.left + i * slotW} y={PAD.top} width={slotW} height={plotH} fill="transparent" />
              {h > 0 && <rect x={at(i) - barW / 2} y={base - 1 - h} width={barW} height={h} fill={COMMIT_HUE} />}
            </g>
          );
        })}
        {ticks.map((t) => (
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
        ))}
      </svg>
      {active && point && (
        <CellTip point={point} className="panel px-3 py-2 font-mono text-xs">
          <div className="text-faint">week of {fmtDate(active.weekStart)}</div>
          <div className="text-dim">{fmt(active.commits)} commits</div>
        </CellTip>
      )}
    </div>
  );
}
