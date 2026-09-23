"use client";

import { useState } from "react";
import { CellTip } from "./CellTip";
import { useCellTip } from "./useCellTip";
import { fmt, fmtDate } from "@/lib/format";
import { hue } from "@/lib/palette";
import type { RepoMemberRow, RepoWeekRow } from "@/lib/stats";

const W = 720;
const H = 240;
const PAD = { top: 20, bottom: 28, left: 8, right: 8 };
/** Above this many bars the per-bar totals collide, so only the hover label carries numbers. */
const LABEL_LIMIT = 16;

type Slot = { sunday: string; total: number; parts: { userId: number; commits: number }[] };

/** Weekly commits on one repo, stacked per member in the member order the table uses. */
export function MemberBars({ members, weeks, totalWeeks, endSunday }: { members: RepoMemberRow[]; weeks: RepoWeekRow[]; totalWeeks: number; endSunday: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const { boxRef, point, onMouseMove, clear } = useCellTip();
  const order = members.map((m) => m.userId);
  const byWeek = new Map<string, Map<number, number>>();
  for (const w of weeks) {
    const m = byWeek.get(w.weekStart) ?? new Map<number, number>();
    m.set(w.userId, (m.get(w.userId) ?? 0) + w.commits);
    byWeek.set(w.weekStart, m);
  }
  const end = new Date(`${endSunday}T00:00:00Z`).getTime();
  const slots: Slot[] = [];
  for (let i = totalWeeks - 1; i >= 0; i--) {
    const sunday = new Date(end - i * 7 * 86_400_000).toISOString().slice(0, 10);
    const found = byWeek.get(sunday);
    const parts = order.map((userId) => ({ userId, commits: found?.get(userId) ?? 0 }));
    slots.push({ sunday, total: parts.reduce((sum, p) => sum + p.commits, 0), parts });
  }

  const max = Math.max(1, ...slots.map((s) => s.total));
  const plotH = H - PAD.top - PAD.bottom;
  const baseline = PAD.top + plotH;
  const slotW = (W - PAD.left - PAD.right) / totalWeeks;
  const barW = Math.max(2, slotW - 3);
  const active = hover !== null ? slots[hover] : null;
  const named = new Map(members.map((m) => [m.userId, m.name ?? m.login]));

  return (
    <div className="relative" ref={boxRef}>
      <ul className="flex flex-wrap gap-x-5 gap-y-1 font-mono text-xs text-dim mb-2">
        {members.map((m, i) => (
          <li key={m.userId} className="flex items-center gap-2">
            <span className="w-3 h-3 inline-block shrink-0" style={{ backgroundColor: hue(i) }} />
            <span className="text-silver">{m.login}</span>
          </li>
        ))}
        <li className="w-full sm:w-auto sm:ml-auto text-faint">commits per week</li>
      </ul>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto block"
        role="img"
        aria-label="Weekly commits per member"
        onMouseMove={onMouseMove}
        onMouseLeave={clear}
      >
        <line x1={PAD.left} x2={W - PAD.right} y1={baseline} y2={baseline} stroke="#333" strokeWidth={1} />
        {slots.map((s, i) => {
          const x = PAD.left + i * slotW + (slotW - barW) / 2;
          let y = baseline;
          return (
            <g key={s.sunday} opacity={hover !== null && hover !== i ? 0.45 : 1} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={PAD.left + i * slotW} y={PAD.top} width={slotW} height={plotH} fill="transparent" />
              {s.parts.map((p, j) => {
                if (p.commits === 0) return null;
                const h = (p.commits / max) * plotH;
                y -= h;
                return <rect key={p.userId} x={x} y={y} width={barW} height={h} fill={hue(j)} />;
              })}
              {totalWeeks <= LABEL_LIMIT && s.total > 0 && (
                <text x={x + barW / 2} y={y - 5} textAnchor="middle" className="fill-dim" fontSize={10} fontFamily="var(--font-mono)">
                  {s.total}
                </text>
              )}
            </g>
          );
        })}
        {slots.map((s, i) =>
          i % 4 === 0 ? (
            <text key={s.sunday} x={PAD.left + i * slotW + slotW / 2} y={H - 8} textAnchor="middle" className="fill-faint" fontSize={10} fontFamily="var(--font-mono)">
              {fmtDate(s.sunday)}
            </text>
          ) : null,
        )}
      </svg>
      {active && point && (
        <CellTip point={point} className="panel px-3 py-2 font-mono text-xs">
          <div className="text-faint">week of {fmtDate(active.sunday)}</div>
          {active.parts.every((p) => p.commits === 0) ? (
            <div className="text-dim">nothing</div>
          ) : (
            active.parts
              .filter((p) => p.commits > 0)
              .map((p) => (
                <div key={p.userId} className="text-dim">
                  <span className="text-silver">{named.get(p.userId)}</span> {fmt(p.commits)}
                </div>
              ))
          )}
        </CellTip>
      )}
    </div>
  );
}
