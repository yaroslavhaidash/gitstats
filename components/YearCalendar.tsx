"use client";

import { useState } from "react";
import { CellTip } from "./CellTip";
import { useCellTip } from "./useCellTip";
import { heatColor } from "@/lib/palette";

const ROWS = 2;
const WEEKS_PER_ROW = 26;
const CELL = 11;
const GAP = 3;
const STEP = CELL + GAP;
const LEFT = 26; // day labels
const TOP = 16; // month labels
const ROW_H = 7 * STEP + TOP + 12;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_LABELS: Record<number, string> = { 1: "Mon", 3: "Wed", 5: "Fri" };

function utcDay(d: Date, offset: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + offset));
}

/**
 * 52 weeks as four stacked quarters, oldest at the top, each read left to right like a normal
 * contribution graph. `days` is oldest-first and ends today; it is padded so every row is whole weeks.
 */
export function YearCalendar({ days, label, now = new Date() }: { days: number[]; label: string; now?: Date }) {
  const [hover, setHover] = useState<{ x: number; y: number; text: string } | null>(null);
  const { boxRef, point, onMouseMove, clear } = useCellTip();
  const totalWeeks = ROWS * WEEKS_PER_ROW;
  // Pad so the last cell is today and the first cell is a Sunday.
  const trailing = 6 - now.getUTCDay();
  const needed = totalWeeks * 7 - trailing;
  const padded = [...Array<number>(Math.max(0, needed - days.length)).fill(0), ...days.slice(-needed), ...Array<number>(trailing).fill(-1)];
  const start = utcDay(now, -(needed - 1));
  const width = LEFT + WEEKS_PER_ROW * STEP;
  const height = ROWS * ROW_H;

  return (
    <div className="relative" ref={boxRef}>
      {hover && point && <CellTip point={point}>{hover.text}</CellTip>}
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="block w-full h-auto max-h-[380px] mx-auto"
        role="img"
        aria-label={label}
        onMouseMove={onMouseMove}
        onMouseLeave={() => {
          setHover(null);
          clear();
        }}
      >
      {Array.from({ length: ROWS }, (_, row) => {
        const y0 = row * ROW_H + TOP;
        const rowStart = utcDay(start, row * WEEKS_PER_ROW * 7);
        const monthTicks: { x: number; text: string }[] = [];
        const MIN_GAP = 3 * STEP; // labels closer than three columns would overlap
        let lastMonth = -1;
        let lastYear = -1;
        for (let w = 0; w < WEEKS_PER_ROW; w++) {
          const sunday = utcDay(rowStart, w * 7);
          const m = sunday.getUTCMonth();
          const y = sunday.getUTCFullYear();
          if (m === lastMonth) continue;
          lastMonth = m;
          const x = LEFT + w * STEP;
          const prev = monthTicks[monthTicks.length - 1];
          if (prev && x - prev.x < MIN_GAP) continue;
          monthTicks.push({ x, text: y !== lastYear ? `${MONTHS[m]} ${y}` : MONTHS[m] });
          lastYear = y;
        }
        return (
          <g key={row}>
            {monthTicks.map((t) => (
              <text key={t.x} x={t.x} y={y0 - 5} fontSize={9} fontFamily="var(--font-mono)" className="fill-faint">
                {t.text}
              </text>
            ))}
            {Object.entries(DAY_LABELS).map(([d, text]) => (
              <text key={d} x={0} y={y0 + Number(d) * STEP + CELL - 2} fontSize={9} fontFamily="var(--font-mono)" className="fill-faint">
                {text}
              </text>
            ))}
            {Array.from({ length: WEEKS_PER_ROW * 7 }, (_, i) => {
              const idx = row * WEEKS_PER_ROW * 7 + i;
              const count = padded[idx] ?? -1;
              if (count < 0) return null;
              const week = Math.floor(i / 7);
              const dow = i % 7;
              const d = utcDay(start, idx);
              const x = LEFT + week * STEP;
              const y = y0 + dow * STEP;
              const text = `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} · ${count === 0 ? "none" : count === 1 ? "1 contribution" : `${count} contributions`}`;
              const active = hover?.x === x && hover?.y === y;
              return (
                <rect
                  key={i}
                  x={x}
                  y={y}
                  width={CELL}
                  height={CELL}
                  rx={2}
                  fill={heatColor(count)}
                  stroke={active ? "#e0e2e5" : "none"}
                  strokeWidth={1}
                  onMouseEnter={() => setHover({ x, y, text })}
                />
              );
            })}
            {row < ROWS - 1 && (
              <line x1={LEFT} x2={width} y1={y0 + 7 * STEP + 6} y2={y0 + 7 * STEP + 6} stroke="#1a1a1a" strokeWidth={1} />
            )}
          </g>
        );
      })}
      </svg>
    </div>
  );
}
