"use client";

import { useState } from "react";
import { fmtCounted, fmtDate, fmtMonth, fmtTokens } from "@/lib/format";
import type { ClaudeBucket } from "@/lib/claudestats";
import type { ClaudeMetric, DaySeriesMode } from "@/lib/window";
import { CellTip } from "./CellTip";
import { dayTicks, tickAnchor } from "./dayTicks";
import { useCellTip } from "./useCellTip";
import { chartHeight, useChartWidth } from "./useChartWidth";

const W = 720;
const PAD = { top: 12, bottom: 24, left: 8, right: 8 };
/** Room one "05 Oct" needs to itself, in viewBox units (one per CSS pixel). */
const LABEL_ROOM = 64;

const NAME: Record<ClaudeMetric, string> = { tokens: "tokens", output: "output tokens", messages: "messages" };

/**
 * One bar per bucket in the side's accent, for whichever metric the page is ranked by. Output is a
 * fraction of a percent of all tokens, so stacking it on the total would draw it as nothing; the
 * hover label carries both. Buckets arrive filled, so the x axis is time and an idle week is a gap.
 * A bucket whose messages were not counted (CLI before 0.7.0) draws a dotted baseline, not a zero bar.
 */
export function TokenBars({ bars, mode, metric, label }: { bars: ClaudeBucket[]; mode: DaySeriesMode; metric: ClaudeMetric; label: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const { boxRef, point, onMouseMove, clear } = useCellTip();
  const width = useChartWidth(boxRef, W);
  const H = chartHeight(width, 1 / 3, 160, 220);
  const plotH = H - PAD.top - PAD.bottom;
  const base = PAD.top + plotH;
  const slotW = (width - PAD.left - PAD.right) / Math.max(1, bars.length);
  const barW = Math.max(1, slotW - (slotW > 6 ? 2 : 1));
  const max = Math.max(1, ...bars.map((b) => b[metric] ?? 0));
  const dates = bars.map((b) => b.start);
  const ticks =
    mode === "weeks"
      ? dates.flatMap((d, index) => {
          const every = Math.max(1, Math.ceil(LABEL_ROOM / slotW));
          return (dates.length - 1 - index) % every === 0 ? [{ index, label: fmtDate(d) }] : [];
        })
      : dayTicks(dates, slotW, mode === "months");
  const active = hover !== null ? bars[hover] : null;
  const title = (b: ClaudeBucket) => (mode === "months" ? fmtMonth(b.start) : mode === "weeks" ? `week of ${fmtDate(b.start)}` : fmtDate(b.start));

  return (
    <div className="relative" ref={boxRef}>
      <svg
        viewBox={`0 0 ${width} ${H}`}
        width="100%"
        height={H}
        preserveAspectRatio="xMinYMin slice"
        className="block"
        role="img"
        aria-label={label}
        onMouseMove={onMouseMove}
        onMouseLeave={() => {
          clear();
          setHover(null);
        }}
      >
        <line x1={PAD.left} x2={width - PAD.right} y1={base} y2={base} stroke="#333" strokeWidth={1} />
        {bars.map((b, i) => {
          const value = b[metric];
          const h = ((value ?? 0) / max) * (plotH - 2);
          const x = PAD.left + i * slotW + (slotW - barW) / 2;
          // Rounded at the data end only, so the bar still sits flat on the baseline.
          const r = Math.min(4, barW / 2, h);
          return (
            <g key={b.start} opacity={hover !== null && hover !== i ? 0.45 : 1} onMouseEnter={() => setHover(i)}>
              <rect x={PAD.left + i * slotW} y={PAD.top} width={slotW} height={plotH} fill="transparent" />
              {value === null && <line x1={x} x2={x + barW} y1={base - 1.5} y2={base - 1.5} className="stroke-faint" strokeWidth={1} strokeDasharray="1 2" />}
              {h > 0 && (
                <path
                  className="fill-alert"
                  d={`M${x},${base} V${base - h + r} Q${x},${base - h} ${x + r},${base - h} H${x + barW - r} Q${x + barW},${base - h} ${x + barW},${base - h + r} V${base} Z`}
                />
              )}
            </g>
          );
        })}
        {ticks.map(({ index, label: text }) => {
          const x = PAD.left + index * slotW + slotW / 2;
          return text === null ? (
            <circle key={index} cx={x} cy={H - 10} r={1} className="fill-faint" />
          ) : (
            <text key={index} x={x} y={H - 6} textAnchor={tickAnchor(x, text, width)} className="fill-faint" fontSize={10} fontFamily="var(--font-mono)">
              {text}
            </text>
          );
        })}
      </svg>
      {active && point && (
        <CellTip point={point} className="panel px-3 py-2 font-mono text-xs">
          <div className="text-faint">{title(active)}</div>
          <div className={metric === "tokens" ? "text-white" : "text-dim"}>{fmtTokens(active.tokens)} {NAME.tokens}</div>
          <div className={metric === "output" ? "text-white" : "text-dim"}>{fmtTokens(active.output)} {NAME.output}</div>
          {metric === "messages" && <div className="text-white">{active.messages === null ? "messages not counted" : `${fmtCounted(active.messages)} ${NAME.messages}`}</div>}
        </CellTip>
      )}
    </div>
  );
}
