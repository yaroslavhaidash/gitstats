import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { BackLink } from "@/components/BackLink";
import { MemberBars } from "@/components/MemberBars";
import { RangePicker } from "@/components/RangePicker";
import { WindowTabs } from "@/components/WindowTabs";
import { repoStats } from "@/lib/cached";
import { backTarget, crewmateIds } from "@/lib/crews";
import { fmt, fmtDate } from "@/lib/format";
import { parseWindow, windowLabel, windowQuery } from "@/lib/window";

/** Per request: it reads the session. The stats behind it are cached in lib/cached.ts. */
export const instant = false;

/**
 * Next hands a dynamic segment with its reserved characters still percent-encoded, so a CLI repo's
 * `local:<hmac>` arrives as `local%3A<hmac>` and never matches a row. A malformed `%` sequence
 * throws, and an id that cannot be decoded is an id nothing can match.
 */
function decodeNodeId(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export default async function RepoPage({
  params,
  searchParams,
}: {
  params: Promise<{ nodeId: string }>;
  searchParams: Promise<{ w?: string; from?: string; to?: string; src?: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/");
  const [{ nodeId }, query] = await Promise.all([params, searchParams]);
  const window = parseWindow(query);
  const [stats, back] = await Promise.all([
    repoStats(session.user.id, decodeNodeId(nodeId), await crewmateIds(session.user.id), window),
    backTarget(session.user.id, query.src, windowQuery(window)),
  ]);
  if (!stats) notFound();
  const { repo, members, weeks, chartWeeks, chartEnd } = stats;
  const label = windowLabel(window);
  const basePath = `/dashboard/r/${encodeURIComponent(repo.nodeId)}`;
  const totals = members.reduce(
    (sum, m) => ({ commits: sum.commits + m.commits, additions: sum.additions + m.additions, deletions: sum.deletions + m.deletions }),
    { commits: 0, additions: 0, deletions: 0 },
  );
  return (
    <>
      <BackLink href={back.href} label={back.label} />
      <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
        <div className="min-w-0">
          <div className="tag mb-3">REPO // {repo.isPrivate ? "PRIVATE" : "PUBLIC"}</div>
          <h1 className="font-sans font-bold text-4xl break-all">{repo.nameWithOwner}</h1>
          <p className="font-mono text-xs text-faint mt-2 flex flex-wrap gap-x-4 gap-y-1">
            <span>{repo.primaryLanguage ?? "language unknown"}</span>
            <span>★ {fmt(repo.stargazerCount)}</span>
            {repo.isFork && <span>fork</span>}
            {!repo.isPrivate && (
              <a href={`https://github.com/${repo.nameWithOwner}`} target="_blank" rel="noreferrer" className="text-silver hover:text-alert">
                github ↗
              </a>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <WindowTabs current={window} basePath={basePath} />
          <RangePicker current={window} basePath={basePath} />
        </div>
      </div>

      <section className="panel p-6 mb-8">
        <h2 className="font-sans font-bold text-lg mb-1">Commits per week</h2>
        <p className="font-mono text-xs text-faint mb-4">
          {window.kind === "preset" ? `last ${chartWeeks} weeks` : `${chartWeeks} weeks ending ${fmtDate(chartEnd)}`} · stacked per member
        </p>
        {members.length === 0 ? (
          <p className="font-mono text-sm text-dim">&gt; nobody you share a crew with touched this repo {label}_</p>
        ) : (
          <MemberBars members={members} weeks={weeks} totalWeeks={chartWeeks} endSunday={chartEnd} />
        )}
      </section>

      <section className="panel">
        <div className="flex justify-between items-center px-4 py-3 border-b-2 border-dark">
          <h2 className="font-sans font-bold text-lg">Members {label}</h2>
          <span className="font-mono text-xs text-faint">
            {fmt(totals.commits)} commits · +{fmt(totals.additions)} · −{fmt(totals.deletions)}
          </span>
        </div>
        {members.length === 0 ? (
          <p className="font-mono text-sm text-dim p-6">&gt; nothing {label}_</p>
        ) : (
          <table className="w-full font-mono text-sm">
            <thead>
              <tr className="text-xs text-faint uppercase tracking-wide border-b border-dark">
                <th className="text-left px-4 py-2 font-normal">member</th>
                <th className="text-right px-4 py-2 font-normal">commits</th>
                <th className="text-right px-4 py-2 font-normal">added</th>
                <th className="text-right px-4 py-2 font-normal">deleted</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark">
              {members.map((m) => (
                <tr key={m.userId} className="hover:bg-dark/40">
                  <td className="px-4 py-2">
                    <Link href={`/dashboard/u/${m.login}?${windowQuery(window)}${query.src ? `&src=${encodeURIComponent(query.src)}` : ""}`} className="flex items-center gap-3 text-white hover:text-alert">
                      <Image src={m.avatarUrl} alt="" width={24} height={24} className="border border-dark shrink-0" unoptimized />
                      <span className="truncate">{m.name ?? m.login}</span>
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-right text-white font-bold">{fmt(m.commits)}</td>
                  <td className="px-4 py-2 text-right text-green">+{fmt(m.additions)}</td>
                  <td className="px-4 py-2 text-right text-alert">−{fmt(m.deletions)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
