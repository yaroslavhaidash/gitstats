import { fmtTokens } from "@/lib/format";

/** A part too small to round to 0.1% still reads as present. */
const share = (f: number) => (f < 0.001 ? "<0.1%" : `${Math.round(f * 1000) / 10}%`);

export type ShareRow = { label: string; value: number; colour: string };

/**
 * One horizontal bar split into parts, with a legend that names every part and its number, so a
 * part never has to be told apart by its colour alone. Colours are CSS values (a variable is fine),
 * set as styles because the side's accent is one.
 */
export function ShareBar({ rows, label, format = fmtTokens }: { rows: ShareRow[]; label: string; format?: (n: number) => string }) {
  const total = rows.reduce((sum, r) => sum + r.value, 0);
  const shown = rows.filter((r) => r.value > 0);
  if (total === 0) return null;
  return (
    <div>
      <div className="flex h-4 gap-[2px]" role="img" aria-label={`${label}: ${shown.map((r) => `${r.label} ${format(r.value)}`).join(", ")}`}>
        {shown.map((r) => (
          <span key={r.label} className="h-full min-w-[2px]" style={{ width: `${(r.value / total) * 100}%`, background: r.colour }} />
        ))}
      </div>
      <ul className="mt-3 grid gap-1.5 font-mono text-xs">
        {shown.map((r) => (
          <li key={r.label} className="flex items-center gap-2 min-w-0">
            <span className="w-3 h-3 inline-block shrink-0" style={{ background: r.colour }} />
            <span className="text-silver truncate">{r.label}</span>
            <span className="ml-auto text-dim whitespace-nowrap">
              {format(r.value)} · {share(r.value / total)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
