/**
 * Seven categorical hues in fixed order, validated against the void surface (#050505):
 * lightness band, chroma floor, CVD separation, normal-vision floor and 3:1 contrast all pass.
 * Wherever a chart has more series than hues, the last slot is the "other" bucket, so a series
 * never changes colour because another one appeared.
 */
export const HUES = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9"] as const;

/** Hue for series `i`, wrapping once the fixed order runs out. */
export function hue(i: number): string {
  return HUES[i % HUES.length];
}

/**
 * The sequential red ramp the day grids share. It lives here rather than in `Heatmap` because the
 * share card's OG image draws the same cells and cannot import from a client module.
 */
const HEAT = ["#222222", "#6e2323", "#a82c2c", "#d93636", "#ff5a5a"] as const;
/** The top of each step but the last: 1–2 contributions, 3–5, 6–9, 10 and up. */
export const HEAT_STEPS = [2, 5, 9] as const;
/** Claude Code replies run into the thousands a day, so the same five cells cover a wider range. */
export const REPLY_STEPS = [150, 500, 1200] as const;
/** Typed messages run into the low hundreds a day. */
export const MESSAGE_STEPS = [20, 60, 140] as const;

/** A day grid's colours, thresholds and what one count is called, when it is not the default red ramp. */
export type HeatScale = { ramp: readonly string[]; steps: readonly number[]; unit: readonly [one: string, many: string] };

/** A day's cell colour: zero gets the empty cell, then one step per threshold. */
export function heatColor(count: number, ramp: readonly string[] = HEAT, steps: readonly number[] = HEAT_STEPS): string {
  if (count === 0) return ramp[0];
  const step = steps.findIndex((top) => count <= top);
  return ramp[step < 0 ? steps.length + 1 : step + 1];
}
