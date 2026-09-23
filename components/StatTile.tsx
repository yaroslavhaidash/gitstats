// Written out, not interpolated: Tailwind only ships classes it can see in the source.
const TONE = { white: "text-white", green: "text-green", alert: "text-alert", amber: "text-amber" } as const;

/** Past this the exact percentage says nothing a reader can use; a week off zero prints +777550%. */
const CAP = 999;

export function StatTile({
  label,
  value,
  suffix,
  sub,
  delta,
  tone = "white",
}: {
  label: string;
  value: string;
  /** Small mono qualifier on the same line as the number, e.g. "· weekdays". */
  suffix?: string;
  sub?: string;
  /** Percent change vs the previous period; `null` when the previous period was zero. */
  delta?: number | null;
  /** Only the line counters and the stars carry colour; every other number is white. */
  tone?: keyof typeof TONE;
}) {
  return (
    <div className="bg-void p-4 sm:p-5">
      <div className="font-mono text-xs text-faint uppercase tracking-wide mb-2">{label}</div>
      <div className={`font-sans font-bold text-3xl leading-none ${TONE[tone]}`}>
        {value}
        {suffix && <span className="font-mono font-normal text-xs text-dim ml-2 align-middle">{suffix}</span>}
      </div>
      {delta !== undefined && (
        <div className={`font-mono text-xs mt-2 ${delta === null ? "text-faint" : delta > 0 ? "text-green" : delta < 0 ? "text-alert" : "text-dim"}`}>
          {delta === null ? "—" : delta > CAP ? `>${CAP}%` : `${delta > 0 ? "+" : delta < 0 ? "−" : ""}${Math.abs(delta)}%`}
        </div>
      )}
      {sub && <div className="font-mono text-xs text-dim mt-2">{sub}</div>}
    </div>
  );
}
