import { fmtDate } from "@/lib/format";

const FULL = 80; // "01 Sept" plus breathing room, in viewBox units
const SHORT = 30; // "31" plus the room it needs not to crowd its neighbours
const DOTTED = 10; // below this a number per day collides, but a mark per day still fits

export type DayTick = { index: number; label: string | null };

/**
 * Keep a tick's text inside the plot: centred unless it would run off an edge, in which case it is
 * anchored to that edge instead. Mono glyphs are ~6 units wide at the size the axes use.
 */
export function tickAnchor(x: number, label: string, width: number): "start" | "middle" | "end" {
  const half = label.length * 3;
  if (x - half < 2) return "start";
  if (x + half > width - 2) return "end";
  return "middle";
}

/**
 * One tick per day where they fit, thinning out as the bars get closer together: the full date while
 * there is room for it, then the day of the month, then a number every other day with a dot marking
 * the ones in between, and finally a date every few days. `slotW` is what one day owns in viewBox
 * units, so the same span is labelled differently in a full-width card and in a half-width one.
 */
export function dayTicks(dates: string[], slotW: number): DayTick[] {
  const day = (d: string) => String(Number(d.slice(8, 10)));
  if (slotW >= FULL) return dates.map((d, index) => ({ index, label: fmtDate(d) }));
  if (slotW >= SHORT) return dates.map((d, index) => ({ index, label: day(d) }));
  // Both thinned modes are anchored to the last day, so the newest bar always carries its label.
  if (slotW >= DOTTED) {
    return dates.map((d, index) => ({ index, label: (dates.length - 1 - index) % 2 === 0 ? day(d) : null }));
  }
  // A little more than one label's width apart: the last one is anchored to the edge and shifts left.
  const every = Math.ceil((FULL + 20) / Math.max(1, slotW));
  return dates.flatMap((d, index) => {
    const wanted = (dates.length - 1 - index) % every === 0;
    // A date centred a few units from the left edge would be cut; only the very first one can start there.
    return wanted && (index === 0 || index * slotW > FULL / 2) ? [{ index, label: fmtDate(d) }] : [];
  });
}
