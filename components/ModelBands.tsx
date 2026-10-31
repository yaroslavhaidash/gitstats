"use client";

import { useState } from "react";
import type { ClaudeModelWeek, ModelFamily } from "@/lib/claudestats";
import { fmtDate, fmtTokens } from "@/lib/format";
import type { ClaudeMetric } from "@/lib/window";
import { CellTip } from "./CellTip";
import { useCellTip } from "./useCellTip";
import { chartHeight, useChartWidth } from "./useChartWidth";

const W = 720;
const PAD = { top: 8, bottom: 24, left: 8, right: 8 };
const LABEL_ROOM = 64;
const GAP = 2;
/** Fixed order, bottom up: colour and position follow the family, never its share. */
const ORDER: ModelFamily[] = ["opus", "sonnet", "haiku", "fable", "other"];
const NAMES: Record<ModelFamily, string> = { opus: "Opus", sonnet: "Sonnet", haiku: "Haiku", fable: "Fable", other: "other" };

const pct = (f: number) => (f < 0.001 ? "<0.1%" : `${Math.round(f * 1000) / 10}%`);

/** One band of a `ShareBands` chart: its key, its legend name and its colour (any CSS value). */
export type Band = { key: string; name: string; colour: string };
/** A week's amount per band key; null when the week did not count this at all. */
export type BandWeek = { weekStart: string; parts: Record<string, number> | null };

/** Each week split by model family, for whichever metric the page is ranked by. */
export function ModelBands({ weeks, metric, label }: { weeks: ClaudeModelWeek[]; metric: ClaudeMetric; label: string }) {
  return (
    <ShareBands
      weeks={weeks.map((w) => ({ weekStart: w.weekStart, parts: Object.fromEntries(ORDER.map((f) => [f, w.families[f]?.[metric] ?? 0])) }))}
      bands={ORDER.map((f) => ({ key: f, name: NAMES[f], colour: `var(--model-${f})` }))}
      label={label}
    />
  );
}

/**
 * Each week as one full-height column split into bands, so a switch from one to another reads as
 * the bands moving. Shares, not amounts: the bars above already show how much. An idle week is an
 * empty slot; a week that did not count this at all says so on hover. Band order is fixed, bottom up.
 */
export function ShareBands({ weeks, bands, label }: { weeks: BandWeek[]; bands: Band[]; label: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const { boxRef, point, onMouseMove, clear } = useCellTip();
  const width = useChartWidth(boxRef, W);
  const H = chartHeight(width, 1 / 4, 120, 180);
  const plotH = H - PAD.top - PAD.bottom;
  const base = PAD.top + plotH;
  const slotW = (width - PAD.left - PAD.right) / Math.max(1, weeks.length);
  const barW = Math.max(1, slotW - (slotW > 6 ? 2 : 1));
  const every = Math.max(1, Math.ceil(LABEL_ROOM / slotW));
  const value = (w: BandWeek, key: string) => w.parts?.[key] ?? 0;
  const present = bands.filter((b) => weeks.some((w) => value(w, b.key) > 0));
  const active = hover !== null ? weeks[hover] : null;
  const totalOf = (w: BandWeek) => present.reduce((s, b) => s + value(w, b.key), 0);

  return (
    <div>
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
          {weeks.map((w, i) => {
            const total = totalOf(w);
            const x = PAD.left + i * slotW + (slotW - barW) / 2;
            const parts = present.filter((b) => value(w, b.key) > 0);
            const room = plotH - GAP * Math.max(0, parts.length - 1);
            let y = base;
            return (
              <g key={w.weekStart} className="series-fade" opacity={hover !== null && hover !== i ? 0.45 : 1} onMouseEnter={() => setHover(i)}>
                <rect x={PAD.left + i * slotW} y={PAD.top} width={slotW} height={plotH} fill="transparent" />
                {total > 0 &&
                  parts.map((b, k) => {
                    const h = Math.max(1, (value(w, b.key) / total) * room);
                    y -= h;
                    const top = y;
                    if (k < parts.length - 1) y -= GAP;
                    // Rounded at the column's top only, so it still sits flat on the baseline.
                    const r = k === parts.length - 1 ? Math.min(4, barW / 2, h) : 0;
                    return (
                      <path
                        key={b.key}
                        style={{ fill: b.colour }}
                        d={`M${x},${top + h} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${top + h} Z`}
                      />
                    );
                  })}
              </g>
            );
          })}
          {weeks.map((w, index) =>
            (weeks.length - 1 - index) % every === 0 ? (
              <text
                key={w.weekStart}
                x={PAD.left + index * slotW + slotW / 2}
                y={H - 6}
                textAnchor={index === weeks.length - 1 ? "end" : "middle"}
                className="fill-faint"
                fontSize={10}
                fontFamily="var(--font-mono)"
              >
                {fmtDate(w.weekStart)}
              </text>
            ) : null,
          )}
        </svg>
        {active && point && (
          <CellTip point={point} className="panel px-3 py-2 font-mono text-xs">
            <div className="text-faint">week of {fmtDate(active.weekStart)}</div>
            {active.parts === null ? (
              <div className="text-dim">not counted</div>
            ) : totalOf(active) === 0 ? (
              <div className="text-dim">nothing counted</div>
            ) : (
              [...present].reverse().map((b) => {
                const v = value(active, b.key);
                return v > 0 ? (
                  <div key={b.key} className="flex items-center gap-2 text-silver">
                    <span className="w-2.5 h-2.5 inline-block" style={{ background: b.colour }} />
                    {b.name} {pct(v / totalOf(active))} · {fmtTokens(v)}
                  </div>
                ) : null;
              })
            )}
          </CellTip>
        )}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-silver">
        {[...present].reverse().map((b) => (
          <li key={b.key} className="flex items-center gap-2">
            <span className="w-3 h-3 inline-block" style={{ background: b.colour }} />
            {b.name}
          </li>
        ))}
      </ul>
    </div>
  );
}
