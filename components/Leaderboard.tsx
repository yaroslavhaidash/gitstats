import Image from "next/image";
import { fmt, fmtRank } from "@/lib/format";
import type { Metric } from "@/lib/window";
import type { BoardRow, RankedRow } from "@/lib/stats";
import { Heatmap } from "./Heatmap";
import { Momentum } from "./Momentum";
import { ViewLink } from "./ViewLink";

/**
 * Between 1024 and 1280 a long login can push the table past its box, which then scrolls sideways; the
 * rank and the member stay pinned so a row never loses its name. A pinned cell needs its own opaque
 * background: `OWN_CELL` and the hover colour are the row's translucent tints already laid over the void.
 */
const STICK = "sticky z-10 xl:static";
const ROW_CELL = "bg-void group-hover:bg-[#0d0d0d]";
const OWN_CELL = "bg-[#1a0909]";

function Identity({ row }: { row: BoardRow }) {
  return (
    <span className="flex items-center gap-3">
      <Image src={row.avatarUrl} alt="" width={28} height={28} className="border border-dark shrink-0" unoptimized />
      <span className="min-w-0">
        <span className="text-white font-bold block truncate">{row.login}</span>
        {row.name && <span className="text-faint text-xs block leading-none mt-1 truncate">{row.name}</span>}
      </span>
    </span>
  );
}

/**
 * One member on a phone or a tablet: the rank, who, and the number the board is ranked by, large on
 * the right with its momentum arrow; the other figures in one quiet line; the 12-week strip under it.
 * About a third of the height of the six-cell grid it replaced, so a crew of five fits on two screens.
 */
function Card({ row, rank, beforeLabel, metric, wrap, own }: { row: RankedRow; rank: number; beforeLabel: string; metric: Metric; wrap: (row: BoardRow, children: React.ReactNode) => React.ReactNode; own: boolean }) {
  const big = metric === "lines" ? fmtRank(row.additions + row.deletions) : fmt(row.commits);
  return (
    <div className={`border-2 p-4 min-w-0 ${own ? "bg-alert/10 border-alert" : "bg-void border-dark"}`}>
      <div className="flex items-start gap-3">
        <span className={`pt-1 ${rank === 0 ? "text-alert font-bold" : "text-faint"}`}>{String(rank + 1).padStart(2, "0")}</span>
        <span className="min-w-0 flex-1 pt-0.5">{wrap(row, <Identity row={row} />)}</span>
        <span className="text-right shrink-0">
          <span className="block font-sans font-bold text-2xl leading-none text-white">{big}</span>
          <span className="flex items-center justify-end gap-1.5 mt-1 text-[11px] text-faint uppercase tracking-wide">
            {metric}
            <Momentum commits={row.commits} before={row.prevCommits} label={beforeLabel} />
          </span>
        </span>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-3 text-xs text-dim">
        {metric === "lines" ? <span>{fmt(row.commits)} {row.commits === 1 ? "commit" : "commits"}</span> : <span>{fmtRank(row.additions + row.deletions)} lines</span>}
        <span>
          <span className="text-green">+{fmt(row.additions)}</span> <span className="text-alert">−{fmt(row.deletions)}</span>
        </span>
        <span>{row.activeRepos} {row.activeRepos === 1 ? "repo" : "repos"}</span>
        <span>{row.streak}d streak</span>
        <span className="text-amber">★ {fmt(row.stars)}</span>
      </div>
      <div className="flex items-end gap-3 mt-3">
        <Heatmap days={row.days} cell={9} label={`${row.login} daily contributions, last 12 weeks`} />
        <span className="text-[11px] text-faint uppercase tracking-wide leading-tight">
          last 12 weeks
          <span className="block text-dim normal-case">{row.topLanguage ?? "—"}</span>
        </span>
      </div>
    </div>
  );
}

export function Leaderboard({
  rows,
  linkUsers,
  src,
  beforeLabel,
  metric,
  userBase = "/dashboard/u",
  rankOffset = 0,
  highlightUserId,
}: {
  rows: RankedRow[];
  linkUsers: boolean;
  /** The board these rows are on, so each profile can offer the way back to it. */
  src?: string;
  beforeLabel: string;
  metric: Metric;
  /** Where a member's row links. The demo board renders the same table under its own path. */
  userBase?: string;
  /** Rank of the first row, zero-based. The global board draws slices of a longer board. */
  rankOffset?: number;
  /** Whose row to mark as the reader's own, when the board is a slice around them. */
  highlightUserId?: number;
}) {
  if (rows.length === 0) {
    return <div className="panel p-8 font-mono text-sm text-dim">&gt; no members yet_</div>;
  }
  const wrap = (row: BoardRow, children: React.ReactNode) =>
    linkUsers ? (
      <ViewLink href={`${userBase}/${row.login}`} src={src} className="hover:text-alert">
        {children}
      </ViewLink>
    ) : (
      children
    );
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
              <th className="text-right px-4 py-3 font-normal">commits</th>
              <th className="text-right px-4 py-3 font-normal">diff</th>
              <th className="text-right px-4 py-3 font-normal">total</th>
              <th className="text-right px-4 py-3 font-normal">repos</th>
              <th className="text-right px-4 py-3 font-normal">streak</th>
              <th className="text-center px-4 py-3 font-normal" title="momentum: commits this period against the period of the same length before it">momentum</th>
              <th className="text-right px-4 py-3 font-normal">stars</th>
              <th className="text-left px-4 py-3 font-normal">lang</th>
              <th className="text-left px-4 py-3 font-normal">last 12 weeks</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-dark">
            {rows.map((r, i) => (
              <tr key={r.userId} className={`group transition-colors ${r.userId === highlightUserId ? "bg-alert/10" : "hover:bg-dark/40"}`}>
                <td className={`${STICK} ${r.userId === highlightUserId ? OWN_CELL : ROW_CELL} left-0 w-14 px-4 py-3 ${rankOffset + i === 0 ? "text-alert font-bold" : "text-faint"}`}>{String(rankOffset + i + 1).padStart(2, "0")}</td>
                <td className={`${STICK} ${r.userId === highlightUserId ? OWN_CELL : ROW_CELL} left-14 px-4 py-3 xl:border-r-0 border-r-2 border-dark`}>{wrap(r, <Identity row={r} />)}</td>
                {/* The measure the board is ranked by is the one in white; the other stays legible but quiet. */}
                <td className={`px-4 py-3 text-right ${metric === "commits" ? "text-white font-bold" : "text-silver"}`}>{fmt(r.commits)}</td>
                <td className="px-4 py-3 text-right leading-tight">
                  <span className="text-green block">+{fmt(r.additions)}</span>
                  <span className="text-alert block">−{fmt(r.deletions)}</span>
                </td>
                <td className={`px-4 py-3 text-right ${metric === "lines" ? "text-white font-bold" : "text-silver"}`}>{fmtRank(r.additions + r.deletions)}</td>
                <td className="px-4 py-3 text-right">{r.activeRepos}</td>
                <td className="px-4 py-3 text-right">{r.streak}d</td>
                <td className="px-4 py-3 text-center">
                  <Momentum commits={r.commits} before={r.prevCommits} label={beforeLabel} />
                </td>
                <td className="px-4 py-3 text-right text-amber">{fmt(r.stars)}</td>
                <td className="px-4 py-3 text-dim">{r.topLanguage ?? "—"}</td>
                <td className="px-4 py-3">
                  <Heatmap days={r.days} label={`${r.login} daily contributions, last 12 weeks`} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
