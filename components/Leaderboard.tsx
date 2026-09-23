import Image from "next/image";
import { fmt, fmtRank } from "@/lib/format";
import type { Metric } from "@/lib/window";
import type { BoardRow, RankedRow } from "@/lib/stats";
import { Heatmap } from "./Heatmap";
import { Momentum } from "./Momentum";
import { ViewLink } from "./ViewLink";

function Identity({ row }: { row: BoardRow }) {
  return (
    <span className="flex items-center gap-3">
      <Image src={row.avatarUrl} alt="" width={28} height={28} className="border border-dark shrink-0" unoptimized />
      <span className="min-w-0">
        <span className="text-white font-bold">{row.login}</span>
        {row.name && <span className="text-faint text-xs block leading-none mt-1 truncate">{row.name}</span>}
      </span>
    </span>
  );
}

/** Six numbers as a 3×2 grid: what the desktop table's columns say, stacked for a phone. */
function CardNumbers({ row, beforeLabel, metric }: { row: RankedRow; beforeLabel: string; metric: Metric }) {
  const cells: [string, React.ReactNode, string][] = [
    ["commits", fmt(row.commits), metric === "commits" ? "text-white font-bold" : "text-silver"],
    [
      "diff",
      <span key="diff" className="block leading-tight">
        <span className="text-green block">+{fmt(row.additions)}</span>
        <span className="text-alert block">−{fmt(row.deletions)}</span>
      </span>,
      "",
    ],
    ["total", fmtRank(row.additions + row.deletions), metric === "lines" ? "text-white font-bold" : "text-silver"],
    ["repos", String(row.activeRepos), "text-silver"],
    // The phone has no room for a column of its own, so the arrow rides beside the streak it belongs next to.
    [
      "streak",
      <span key="streak" className="flex items-center gap-2">
        {row.streak}d <Momentum commits={row.commits} before={row.prevCommits} label={beforeLabel} />
      </span>,
      "text-silver",
    ],
    ["stars", fmt(row.stars), "text-amber"],
  ];
  return (
    <div className="grid grid-cols-3 gap-y-3 mt-4">
      {cells.map(([label, value, tone]) => (
        <div key={label}>
          <div className="text-xs text-faint uppercase tracking-wide">{label}</div>
          <div className={tone}>{value}</div>
        </div>
      ))}
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
      <div className="panel divide-y-2 divide-dark font-mono text-sm sm:hidden">
        {rows.map((r, i) => (
          <div key={r.userId} className={`p-4 ${r.userId === highlightUserId ? "bg-alert/10 border-l-2 border-alert" : ""}`}>
            <div className="flex items-start gap-3">
              <span className={rankOffset + i === 0 ? "text-alert font-bold" : "text-faint"}>{String(rankOffset + i + 1).padStart(2, "0")}</span>
              <span className="min-w-0 flex-1">{wrap(r, <Identity row={r} />)}</span>
            </div>
            <CardNumbers row={r} beforeLabel={beforeLabel} metric={metric} />
            <div className="text-xs text-faint uppercase tracking-wide mt-4 mb-1">last 12 weeks · {r.topLanguage ?? "—"}</div>
            <Heatmap days={r.days} label={`${r.login} daily contributions, last 12 weeks`} fluid />
          </div>
        ))}
      </div>

      <div className="panel overflow-x-auto hidden sm:block">
        <table className="w-full font-mono text-sm whitespace-nowrap">
          <thead>
            <tr className="text-xs text-faint uppercase tracking-wide border-b-2 border-dark">
              <th className="text-left px-4 py-3 font-normal">#</th>
              <th className="text-left px-4 py-3 font-normal">dev</th>
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
              <tr key={r.userId} className={`transition-colors ${r.userId === highlightUserId ? "bg-alert/10" : "hover:bg-dark/40"}`}>
                <td className={`px-4 py-3 ${rankOffset + i === 0 ? "text-alert font-bold" : "text-faint"}`}>{String(rankOffset + i + 1).padStart(2, "0")}</td>
                <td className="px-4 py-3">{wrap(r, <Identity row={r} />)}</td>
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
