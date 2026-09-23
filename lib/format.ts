const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const plain = new Intl.NumberFormat("en-US");

export function fmt(n: number): string {
  return Math.abs(n) >= 10_000 ? compact.format(n) : plain.format(n);
}

const compact2 = new Intl.NumberFormat("en-US", { notation: "compact", minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * The number a board is ranked by, to two decimals. `fmt` rounds 1,523,427 and 1,501,952 both to
 * "1.5M", which leaves two rows looking identical while one sits above the other.
 */
export function fmtRank(n: number): string {
  return Math.abs(n) >= 10_000 ? compact2.format(n) : plain.format(n);
}

export function fmtDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(`${d}T00:00:00Z`) : d;
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" });
}

export function fmtDateTime(d: Date): string {
  return d.toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

/** Percent change vs a previous period; `null` when there is nothing to compare against. */
export function pctDelta(current: number, previous: number): number | null {
  return previous === 0 ? null : Math.round(((current - previous) / previous) * 100);
}
