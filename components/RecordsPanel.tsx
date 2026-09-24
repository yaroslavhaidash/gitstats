import { StatTile } from "./StatTile";
import { fmt } from "@/lib/format";
import type { PeriodTotal, Records } from "@/lib/stats";

/** Records reach back years, so their dates carry the year. */
function day(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

function month(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
}

/** All-time bests, as the reader of the page may see them. */
export function RecordsPanel({ records }: { records: Records }) {
  const tile = (label: string, p: PeriodTotal | null, metric: "lines" | "commits", when: (d: string) => string) => (
    <StatTile key={label} label={label} value={p ? fmt(p[metric]) : "none"} sub={p ? when(p.start) : undefined} />
  );
  const { week, month: m, streak } = records;
  return (
    <section className="mb-8">
      <h2 className="font-sans font-bold text-lg mb-3">Records</h2>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-[2px] bg-dark border-2 border-dark">
        {tile("best week · lines", week.lines, "lines", (d) => `week of ${day(d)}`)}
        {tile("best week · commits", week.commits, "commits", (d) => `week of ${day(d)}`)}
        {tile("best month · lines", m.lines, "lines", month)}
        {tile("best month · commits", m.commits, "commits", month)}
        <StatTile label="longest streak" value={streak ? `${streak.days}d` : "none"} sub={streak ? `${day(streak.from)} to ${day(streak.to)}` : undefined} />
      </div>
      <p className="font-mono text-xs text-faint mt-2">&gt; weeks run Monday to Sunday · all time, from the days every total on this page is made of</p>
    </section>
  );
}
