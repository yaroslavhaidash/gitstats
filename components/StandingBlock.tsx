import { fmt } from "@/lib/format";
import { PERCENTILE_FROM, type Standing } from "@/lib/stats";
import type { Metric } from "@/lib/window";

/**
 * Where the reader sits on the global board, in the one sentence they would repeat: a percentile,
 * the number behind it, and how many places they moved. It sits above the board whether the board
 * is the flat table or a neighbourhood, so the claim and the rows always come from the same ranking.
 */
export function StandingBlock({ standing, metric, label, beforeLabel, newcomer }: {
  standing: Standing;
  metric: Metric;
  label: string;
  beforeLabel: string;
  /** The account did not exist for any of the previous period, so it cannot have moved. */
  newcomer: boolean;
}) {
  const unit = metric === "lines" ? "lines" : "commits";
  const move = standing.movement;
  const byPercentile = standing.total >= PERCENTILE_FROM;
  return (
    <div className="panel p-6 mb-8">
      <div className="tag mb-3">YOUR STANDING</div>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="font-sans font-bold text-4xl text-white">
          {byPercentile ? `top ${standing.percentile}%` : `#${standing.rank} of ${standing.total}`}
        </span>
        <span className="font-mono text-sm text-silver">
          {fmt(standing.value)} {unit} {label}
        </span>
      </div>
      <p className="font-mono text-xs text-faint mt-3">
        &gt; {byPercentile && `#${standing.rank} of ${standing.total} · `}
        {newcomer ? (
          <span>first {label.startsWith("this ") ? label.slice(5) : "period"} on the board</span>
        ) : move === null ? (
          <span>no ranking to compare against {beforeLabel}</span>
        ) : move === 0 ? (
          <span>same place as {beforeLabel}</span>
        ) : (
          <span className={move > 0 ? "text-green" : "text-alert"}>
            {move > 0 ? "up" : "down"} {Math.abs(move)} place{Math.abs(move) === 1 ? "" : "s"} vs {beforeLabel}
          </span>
        )}
      </p>
    </div>
  );
}
