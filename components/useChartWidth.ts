"use client";

import { useEffect, useState, type RefObject } from "react";

/**
 * The element's rendered width in CSS pixels, so a chart can spend one viewBox unit per pixel rather
 * than scaling a fixed viewBox down to fit. A scaled viewBox shrinks its own text with it — at a
 * phone's width a 10-unit axis label comes out around 4px — while at one unit per pixel the dates
 * stay the size they were drawn at and only the number of bars changes.
 *
 * `fallback` is what the server draws at; the first client frame replaces it with the real width.
 */
export function useChartWidth(ref: RefObject<HTMLElement | null>, fallback: number): number {
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

/** Chart height for a given width: proportional, but never so tall it dominates its card. */
export function chartHeight(width: number, ratio: number, min: number, max: number): number {
  return Math.round(Math.max(min, Math.min(max, width * ratio)));
}
