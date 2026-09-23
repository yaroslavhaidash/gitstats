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

export function heatColor(count: number): string {
  if (count === 0) return HEAT[0];
  if (count <= 2) return HEAT[1];
  if (count <= 5) return HEAT[2];
  if (count <= 9) return HEAT[3];
  return HEAT[4];
}
