"use client";

import { useCallback, useRef, useState, type MouseEvent, type RefObject } from "react";

export type TipPoint = { x: number; y: number };

/**
 * Pointer position inside a chart's `relative` container. A chart hangs `boxRef` on that container,
 * passes `onMouseMove` to its svg and `clear` to `onMouseLeave`; `CellTip` places itself from the
 * point that comes back, so the label follows the cursor instead of the cell's viewBox coordinates.
 */
export function useCellTip(): {
  boxRef: RefObject<HTMLDivElement | null>;
  point: TipPoint | null;
  onMouseMove: (e: MouseEvent) => void;
  clear: () => void;
} {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [point, setPoint] = useState<TipPoint | null>(null);
  const onMouseMove = useCallback((e: MouseEvent) => {
    const box = boxRef.current?.getBoundingClientRect();
    if (box) setPoint({ x: e.clientX - box.left, y: e.clientY - box.top });
  }, []);
  const clear = useCallback(() => setPoint(null), []);
  return { boxRef, point, onMouseMove, clear };
}
