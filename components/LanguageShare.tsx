"use client";

import { useState } from "react";
import { fmt } from "@/lib/format";
import { HUES } from "@/lib/palette";
import type { LanguageRow } from "@/lib/stats";

const NAMED = HUES.length - 1;
const W = 720;
const BAR_H = 26;
const GAP = 2; // surface gap between segments

type Slice = { name: string; lines: number; additions: number; deletions: number };

export function LanguageShare({ rows }: { rows: LanguageRow[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const named = rows.filter((r) => r.lines > 0);
  const total = named.reduce((sum, r) => sum + r.lines, 0);
  if (total === 0) return <p className="font-mono text-sm text-dim">&gt; no lines in this window_</p>;

  const head: Slice[] = named.slice(0, NAMED).map((r) => ({
    name: r.language ?? "unknown",
    lines: r.lines,
    additions: r.additions,
    deletions: r.deletions,
  }));
  const rest = named.slice(NAMED).reduce(
    (acc, r) => ({ ...acc, lines: acc.lines + r.lines, additions: acc.additions + r.additions, deletions: acc.deletions + r.deletions }),
    { name: "other", lines: 0, additions: 0, deletions: 0 },
  );
  const segments = rest.lines > 0 ? [...head, rest] : head;

  const span = W - GAP * (segments.length - 1);
  let offset = 0;
  const placed: (Slice & { x: number; w: number; label: string; hue: string })[] = [];
  for (const [i, s] of segments.entries()) {
    const w = (s.lines / total) * span;
    const share = (s.lines / total) * 100;
    placed.push({ ...s, x: offset, w, label: share < 0.5 ? "<1%" : `${Math.round(share)}%`, hue: HUES[i] });
    offset += w + GAP;
  }
  const widest = Math.max(...placed.map((s) => s.lines));

  return (
    <div onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${BAR_H}`} className="block w-full h-auto" role="img" aria-label="Share of lines touched per language">
        {placed.map((s, i) => (
          <g key={s.name} opacity={hover !== null && hover !== i ? 0.5 : 1} onMouseEnter={() => setHover(i)}>
            <rect x={s.x} y={0} width={Math.max(1, s.w)} height={BAR_H} fill={s.hue} />
            {/* Only label inside when the text comfortably fits; the rows below carry the rest. */}
            {s.w > 46 && (
              <text x={s.x + s.w / 2} y={BAR_H / 2 + 4} textAnchor="middle" fontSize={11} fontFamily="var(--font-mono)" fill="#050505" fontWeight="bold">
                {s.label}
              </text>
            )}
          </g>
        ))}
      </svg>
      <ul className="font-mono text-xs mt-5">
        {placed.map((s, i) => (
          <li
            key={s.name}
            onMouseEnter={() => setHover(i)}
            className={`grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(5rem,7rem)_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 py-2 border-t-2 border-dark first:border-t-0 ${
              hover !== null && hover !== i ? "opacity-45" : ""
            }`}
          >
            <span className="flex items-center gap-2 min-w-0">
              <span className="w-3 h-3 shrink-0" style={{ backgroundColor: s.hue }} />
              <span className="text-silver truncate">{s.name}</span>
            </span>
            <span className="order-last col-span-2 sm:order-none sm:col-span-1 h-[6px] bg-dark block">
              <span className="block h-full" style={{ width: `${(s.lines / widest) * 100}%`, backgroundColor: s.hue }} />
            </span>
            <span className="flex items-center justify-end gap-3">
              <span className="text-green">+{fmt(s.additions)}</span>
              <span className="text-alert">−{fmt(s.deletions)}</span>
              <span className="text-dim w-9 text-right">{s.label}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
