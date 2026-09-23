"use client";

import { useLayoutEffect, useRef } from "react";
import type { TipPoint } from "./useCellTip";

const OFFSET = 12; // how far the label sits from the pointer

const LABEL = "bg-silver text-void font-mono text-[11px] leading-none px-2 py-1.5 border border-void";

/**
 * Hover label placed from the pointer: right of and above it, flipping when it would leave the chart.
 * The flipped side is not clamped, because a container that hugs its svg (the board heatmaps) is
 * narrower than the label, and clamping would push it off the page instead of beside the cursor.
 */
export function CellTip({ point, className = LABEL, children }: { point: TipPoint; className?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  // No dependency list: the label is re-placed after every render, because its size moves with its text.
  useLayoutEffect(() => {
    const el = ref.current;
    const box = el?.offsetParent as HTMLElement | null;
    if (!el || !box) return;
    const left = point.x + OFFSET + el.offsetWidth > box.clientWidth ? point.x - OFFSET - el.offsetWidth : point.x + OFFSET;
    const top = point.y - OFFSET - el.offsetHeight < 0 ? point.y + OFFSET : point.y - OFFSET - el.offsetHeight;
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.style.visibility = "visible";
  });

  return (
    <div
      ref={ref}
      className={className}
      style={{ position: "absolute", left: 0, top: 0, visibility: "hidden", zIndex: 10, pointerEvents: "none", whiteSpace: "nowrap" }}
    >
      {children}
    </div>
  );
}
