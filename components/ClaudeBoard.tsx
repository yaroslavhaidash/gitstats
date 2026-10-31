import { fmt, fmtTokens } from "@/lib/format";
import { modelLabel, type ClaudeBoardRow } from "@/lib/claudestats";
import { CLAUDE_HEAT_SCALE } from "@/lib/side";
import type { ClaudeMetric } from "@/lib/window";
import { Heatmap } from "./Heatmap";
import { Identity, OWN_CELL, ROW_CELL, STICK } from "./Leaderboard";
import { Momentum } from "./Momentum";
import { ViewLink } from "./ViewLink";

const UNIT: Record<ClaudeMetric, string> = { tokens: "tokens", output: "output" };

/** One member below 1024px: who, the ranked number large on the right, the rest in one quiet line, the strip. */
function Card({ row, rank, beforeLabel, metric, wrap, own }: { row: ClaudeBoardRow; rank: number; beforeLabel: string | null; metric: ClaudeMetric; wrap: (row: ClaudeBoardRow, children: React.ReactNode) => React.ReactNode; own: boolean }) {
  const other: ClaudeMetric = metric === "tokens" ? "output" : "tokens";
  return (
    <div className={`border-2 p-4 min-w-0 ${own ? "bg-alert/10 border-alert" : "bg-void border-dark"}`}>
      <div className="flex items-start gap-3">
        <span className={`pt-1 ${rank === 0 ? "text-alert font-bold" : "text-faint"}`}>{String(rank + 1).padStart(2, "0")}</span>
        <span className="min-w-0 flex-1 pt-0.5">{wrap(row, <Identity row={row} />)}</span>
        <span className="text-right shrink-0">
          <span className="block font-sans font-bold text-2xl leading-none text-white">{fmtTokens(row[metric])}</span>
          <span className="flex items-center justify-end gap-1.5 mt-1 text-[11px] text-faint uppercase tracking-wide">
            {UNIT[metric]}
            {beforeLabel !== null && <Momentum commits={row[metric]} before={metric === "tokens" ? row.prevTokens : row.prevOutput} label={beforeLabel} unit={UNIT[metric]} />}
          </span>
        </span>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-3 text-xs text-dim">
        <span>{fmtTokens(row[other])} {UNIT[other]}</span>
        <span>{fmt(row.sessions)} {row.sessions === 1 ? "session" : "sessions"}</span>
        <span>{row.activeDays}d active</span>
        <span>{row.streak}d streak</span>
      </div>
      <div className="flex items-end gap-3 mt-3">
        <Heatmap days={row.days} cell={9} label={`${row.login} Claude Code replies per day, last 12 weeks`} heat={CLAUDE_HEAT_SCALE} />
        <span className="text-[11px] text-faint uppercase tracking-wide leading-tight">
          last 12 weeks
          <span className="block text-dim normal-case">{row.topModel ? modelLabel(row.topModel) : "none"}</span>
        </span>
      </div>
    </div>
  );
}

/**
 * The claudestats board. Forked from `Leaderboard` because the row is a different shape, but built
 * from its identity cell and pinned-column constants, so the two tables line up and look the same.
 */
export function ClaudeBoard({
  rows,
  src,
  beforeLabel,
  metric,
  userBase = "/dashboard/claude/u",
  rankOffset = 0,
  highlightUserId,
}: {
  rows: ClaudeBoardRow[];
  src?: string;
  beforeLabel: string | null;
  metric: ClaudeMetric;
  userBase?: string;
  rankOffset?: number;
  highlightUserId?: number;
}) {
  const wrap = (row: ClaudeBoardRow, children: React.ReactNode) => (
    <ViewLink href={`${userBase}/${row.login}`} src={src} className="hover:text-alert">
      {children}
    </ViewLink>
  );
  const ranked = (m: ClaudeMetric) => (metric === m ? "text-white font-bold" : "text-silver");
  return (
    <>
      <div className="grid sm:grid-cols-2 gap-3 font-mono text-sm lg:hidden">
        {rows.map((r, i) => (
          <Card key={r.userId} row={r} rank={rankOffset + i} beforeLabel={beforeLabel} metric={metric} wrap={wrap} own={r.userId === highlightUserId} />
        ))}
      </div>

      <div className="panel overflow-x-auto hidden lg:block">
        <table className="w-full font-mono text-sm whitespace-nowrap">
          <thead>
            <tr className="text-xs text-faint uppercase tracking-wide border-b-2 border-dark">
              <th className={`${STICK} bg-void left-0 w-14 text-left px-4 py-3 font-normal`}>#</th>
              <th className={`${STICK} bg-void left-14 text-left px-4 py-3 font-normal xl:border-r-0 border-r-2 border-dark`}>dev</th>
              <th className="text-right px-4 py-3 font-normal">tokens</th>
              <th className="text-right px-4 py-3 font-normal">output</th>
              <th className="text-right px-4 py-3 font-normal">sessions</th>
              <th className="text-right px-4 py-3 font-normal">active days</th>
              <th className="text-right px-4 py-3 font-normal">streak</th>
              {beforeLabel !== null && (
                <th className="text-center px-4 py-3 font-normal" title={`momentum: ${UNIT[metric]} this period against the period of the same length before it`}>momentum</th>
              )}
              <th className="text-left px-4 py-3 font-normal">top model</th>
              <th className="text-left px-4 py-3 font-normal">last 12 weeks</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-dark">
            {rows.map((r, i) => (
              <tr key={r.userId} className={`group transition-colors ${r.userId === highlightUserId ? "bg-alert/10" : "hover:bg-dark/40"}`}>
                <td className={`${STICK} ${r.userId === highlightUserId ? OWN_CELL : ROW_CELL} left-0 w-14 px-4 py-3 ${rankOffset + i === 0 ? "text-alert font-bold" : "text-faint"}`}>{String(rankOffset + i + 1).padStart(2, "0")}</td>
                <td className={`${STICK} ${r.userId === highlightUserId ? OWN_CELL : ROW_CELL} left-14 px-4 py-3 xl:border-r-0 border-r-2 border-dark`}>{wrap(r, <Identity row={r} />)}</td>
                <td className={`px-4 py-3 text-right ${ranked("tokens")}`}>{fmtTokens(r.tokens)}</td>
                <td className={`px-4 py-3 text-right ${ranked("output")}`}>{fmtTokens(r.output)}</td>
                <td className="px-4 py-3 text-right">{fmt(r.sessions)}</td>
                <td className="px-4 py-3 text-right">{r.activeDays}</td>
                <td className="px-4 py-3 text-right">{r.streak}d</td>
                {beforeLabel !== null && (
                  <td className="px-4 py-3 text-center">
                    <Momentum commits={r[metric]} before={metric === "tokens" ? r.prevTokens : r.prevOutput} label={beforeLabel} unit={UNIT[metric]} />
                  </td>
                )}
                <td className="px-4 py-3 text-dim">{r.topModel ? modelLabel(r.topModel) : "none"}</td>
                <td className="px-4 py-3">
                  <Heatmap days={r.days} label={`${r.login} Claude Code replies per day, last 12 weeks`} heat={CLAUDE_HEAT_SCALE} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
