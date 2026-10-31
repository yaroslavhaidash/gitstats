"use client";

import { useState } from "react";
import { CellTip } from "./CellTip";
import { useCellTip } from "./useCellTip";
import { heatColor, type HeatScale } from "@/lib/palette";

/** Daily contribution cells, oldest first, laid out in 7-row columns (one column per week). */
export function Heatmap({ days, cell = 8, gap = 2, label, fluid = false, heat }: { days: number[]; cell?: number; gap?: number; label: string; fluid?: boolean; heat?: HeatScale }) {
  const [hover, setHover] = useState<{ x: number; y: number; text: string } | null>(null);
  const { boxRef, point, onMouseMove, clear } = useCellTip();
  const today = new Date();
  const weeks = Math.ceil(days.length / 7);
  const width = weeks * (cell + gap) - gap;
  const height = 7 * (cell + gap) - gap;
  const offset = weeks * 7 - days.length;
  return (
    <div className={fluid ? "relative block w-full" : "relative inline-block align-middle"} ref={boxRef}>
      {hover && point && <CellTip point={point}>{hover.text}</CellTip>}
    <svg
      onMouseMove={onMouseMove}
      onMouseLeave={() => {
        setHover(null);
        clear();
      }}
      width={fluid ? undefined : width}
      height={fluid ? undefined : height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={label}
      className={fluid ? "block w-full h-auto" : "block shrink-0"}
    >
      {days.map((count, i) => {
        const slot = i + offset;
        const col = Math.floor(slot / 7);
        const row = slot % 7;
        const x = col * (cell + gap);
        const y = row * (cell + gap);
        const d = new Date(today.getTime() - (days.length - 1 - i) * 86_400_000);
        const [one, many] = heat?.unit ?? ["contribution", "contributions"];
        const text = `${d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", timeZone: "UTC" })} · ${count === 0 ? "none" : count === 1 ? `1 ${one}` : `${count} ${many}`}`;
        const colour = heatColor(count, heat?.ramp, heat?.steps);
        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={cell}
            height={cell}
            fill={colour}
            // A ramp of CSS variables only resolves through `style`, not the presentation attribute.
            style={heat ? { fill: colour } : undefined}
            stroke={hover?.x === x && hover?.y === y ? "#e0e2e5" : "none"}
            strokeWidth={1}
            onMouseEnter={() => setHover({ x, y, text })}
          />
        );
      })}
    </svg>
    </div>
  );
}
