"use client";

import { useState } from "react";
import { CellTip } from "./CellTip";
import { useCellTip } from "./useCellTip";
import { pctDelta } from "@/lib/format";

const SIZE = 16;
/** Past this the arrow is already at full tilt; a 900% week and a 200% week would otherwise look different. */
const FULL = 100;
/** Inside this band the period is called flat, so ordinary noise does not read as a trend. */
const FLAT = 5;
const MAX_ANGLE = 60;
const MIN_LEN = 5;
const MAX_LEN = 7;

/**
 * Where a member is heading: commits this period against the period of the same length before it.
 * The angle carries the direction and the shaft length the size of the move, both clamped, because
 * the honest part of this mark is "up, hard" or "down, a little" — the number is on hover.
 */
export function Momentum({ commits, before, label }: { commits: number; before: number; label: string }) {
  const [on, setOn] = useState(false);
  const { boxRef, point, onMouseMove, clear } = useCellTip();
  const pct = pctDelta(commits, before);
  const flat = pct === null || Math.abs(pct) < FLAT;
  const share = pct === null ? 0 : Math.max(-1, Math.min(1, pct / FULL));
  const angle = flat ? 0 : share * MAX_ANGLE;
  const len = flat ? MIN_LEN : MIN_LEN + Math.abs(share) * (MAX_LEN - MIN_LEN);
  const colour = flat ? "#8b93a4" : share > 0 ? "#22c55e" : "#ff3333";
  // The arrow points right and tilts up or down around the middle of its own box. Coordinates are
  // rounded because `Math.cos` may land a bit-width apart on the server and in the browser, and the
  // two would then disagree over the same mark during hydration.
  const rad = (-angle * Math.PI) / 180;
  const mid = SIZE / 2;
  const at = (n: number) => Math.round(n * 100) / 100;
  const [dx, dy] = [Math.cos(rad) * len, Math.sin(rad) * len];
  const tip = `${at(mid + dx)},${at(mid + dy)}`;
  const head = 3.2;
  const wing = (turn: number) => `${at(mid + dx - Math.cos(rad + turn) * head)},${at(mid + dy - Math.sin(rad + turn) * head)}`;
  const text = pct === null ? (commits > 0 ? "first period with commits" : "nothing either period") : `${pct > 0 ? "+" : ""}${pct}% vs ${label}`;

  return (
    <span className="relative inline-block align-middle" ref={boxRef} onMouseMove={onMouseMove} onMouseLeave={() => (setOn(false), clear())}>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE} role="img" aria-label={text} onMouseEnter={() => setOn(true)} className="block">
        <line x1={at(mid - dx)} y1={at(mid - dy)} x2={at(mid + dx)} y2={at(mid + dy)} stroke={colour} strokeWidth={1.5} strokeLinecap="round" />
        <polygon points={`${tip} ${wing(0.6)} ${wing(-0.6)}`} fill={colour} />
      </svg>
      {on && point && (
        <CellTip point={point} className="panel px-3 py-2 font-mono text-xs text-silver">
          {text}
        </CellTip>
      )}
    </span>
  );
}
