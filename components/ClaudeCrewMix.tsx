import type { ClaudeBoardRow, ClaudeModelRow } from "@/lib/claudestats";
import { fmt, fmtTokens } from "@/lib/format";
import type { RankedRow } from "@/lib/stats";
import type { ClaudeMetric } from "@/lib/window";
import { cacheReuse, contextFactor, Meter } from "./ClaudeIntensity";
import { crewHues } from "./ClaudeCrewCharts";
import { ShareBar } from "./ShareBar";

const UNIT: Record<ClaudeMetric, string> = { tokens: "tokens", output: "output tokens" };
const per = (a: number, b: number) => (b > 0 ? a / b : null);

/**
 * The crew board's second row: who carried what share, which models the crew ran, how each member
 * works (ratios of their own totals) and, for members on both sides, git lines per million output
 * tokens. The git lines are the gitstats crew board's own numbers for the same window, so the
 * crossover never shows a figure the gitstats board would not.
 */
export function ClaudeCrewMix({ rows, models, git, metric, label }: { rows: ClaudeBoardRow[]; models: ClaudeModelRow[]; git: RankedRow[]; metric: ClaudeMetric; label: string }) {
  const hues = crewHues(rows);
  const share = rows.map((r) => ({ label: r.login, value: r[metric], colour: hues.get(r.userId) ?? "#6b7280" }));
  const mix = models.filter((m) => m[metric] > 0).map((m) => ({ label: m.label, value: m[metric], colour: `var(--model-${m.family})` }));
  const lines = new Map(git.map((g) => [g.userId, g.additions + g.deletions]));
  const cross = rows
    .map((r) => ({ row: r, lines: lines.get(r.userId) ?? 0 }))
    .filter((c) => c.lines > 0 && c.row.output > 0)
    .map((c) => ({ ...c, rate: c.lines / (c.row.output / 1e6) }))
    .sort((a, b) => b.rate - a.rate || a.row.login.localeCompare(b.row.login));
  const top = Math.max(1, ...cross.map((c) => c.rate));
  return (
    <>
      <div className="grid lg:grid-cols-2 gap-8 mt-8">
        <div className="grid gap-8 content-start min-w-0">
          <section className="panel p-6 min-w-0">
            <h2 className="font-sans font-bold text-lg mb-1">Crew share</h2>
            <p className="font-mono text-xs text-faint mb-4">who carried the crew&apos;s {UNIT[metric]} {label}</p>
            <ShareBar rows={share} label={`Crew share of ${UNIT[metric]} ${label}`} />
          </section>
          <section className="panel p-6 min-w-0">
            <h2 className="font-sans font-bold text-lg mb-1">Crew model mix</h2>
            <p className="font-mono text-xs text-faint mb-4">{UNIT[metric]} {label} by model, everyone together</p>
            <ShareBar rows={mix} label={`Crew model mix ${label}`} />
          </section>
        </div>
        <section className="panel p-6 min-w-0 self-start">
          <h2 className="font-sans font-bold text-lg mb-1">Code per output</h2>
          <p className="font-mono text-xs text-faint mb-4">git lines changed (gitstats) per million Claude Code output tokens · {label} · members on both</p>
          {cross.length === 0 ? (
            <p className="font-mono text-xs text-dim">nobody here has both git lines and Claude Code output {label}</p>
          ) : (
            <ul className="grid gap-3 font-mono text-xs">
              {cross.map((c) => (
                <li key={c.row.userId} className="min-w-0">
                  <div className="flex items-baseline gap-2 mb-1 min-w-0">
                    <span className="text-silver truncate">{c.row.login}</span>
                    <span className="ml-auto text-white font-bold whitespace-nowrap">{fmt(Math.round(c.rate))}</span>
                  </div>
                  <div className="h-3 bg-dark">
                    <div className="h-full meter-fill" style={{ width: `${(c.rate / top) * 100}%`, background: hues.get(c.row.userId) }} />
                  </div>
                  <div className="text-faint mt-1">
                    {fmt(c.lines)} lines · {fmtTokens(c.row.output)} output tokens
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="panel p-6 mt-8 min-w-0">
        <h2 className="font-sans font-bold text-lg mb-1">How each member works</h2>
        <p className="font-mono text-xs text-faint mb-4">{label} · ratios of each member&apos;s own totals, not ranked</p>
        <div className="overflow-x-auto -mx-6 px-6">
          <table className="w-full min-w-[560px] font-mono text-xs">
            <thead>
              <tr className="text-faint uppercase tracking-wide text-left">
                <th className="font-normal pb-2 pr-3">dev</th>
                <th className="font-normal pb-2 pr-3 text-right">per session</th>
                <th className="font-normal pb-2 pr-3 text-right">output per reply</th>
                <th className="font-normal pb-2 pr-3 text-right">context per output</th>
                <th className="font-normal pb-2 w-[30%]">cache reuse</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const reuse = cacheReuse(r);
                const factor = contextFactor(r);
                const session = per(r.tokens, r.sessions);
                const reply = per(r.output, r.replies);
                return (
                  <tr key={r.userId} className="border-t border-dark">
                    <td className="py-2.5 pr-3">
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="w-2.5 h-2.5 shrink-0 inline-block" style={{ background: hues.get(r.userId) }} />
                        <span className="text-silver truncate max-w-40">{r.login}</span>
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 text-right text-white">{session === null ? "none" : fmtTokens(session)}</td>
                    <td className="py-2.5 pr-3 text-right text-white">{reply === null ? "none" : fmt(Math.round(reply))}</td>
                    <td className="py-2.5 pr-3 text-right text-white">{factor === null ? "none" : `${fmt(Math.round(factor))}×`}</td>
                    <td className="py-2.5">
                      {reuse === null ? (
                        <span className="text-dim">none</span>
                      ) : (
                        <span className="flex items-center gap-2">
                          <span className="flex-1 min-w-12">
                            <Meter value={reuse} label={`${r.login} cache reuse`} />
                          </span>
                          <span className="text-white w-12 text-right">{(reuse * 100).toFixed(1)}%</span>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
