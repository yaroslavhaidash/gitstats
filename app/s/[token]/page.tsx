import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Heatmap } from "@/components/Heatmap";
import { Logo } from "@/components/Logo";
import { shareStats } from "@/lib/cached";
import { fmt, fmtRank } from "@/lib/format";
import { PERCENTILE_FROM } from "@/lib/stats";
import { resolveShareToken, shareHeadline } from "@/lib/share";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import { windowLabel } from "@/lib/window";

/** A link is unguessable, so a crawler must never hold on to one. */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function ShareCard({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const payload = await resolveShareToken(token);
  if (!payload) notFound();
  const { row, standing, topRepos, record } = await shareStats(payload.userId, payload.window, payload.metric);
  const { options, metric } = payload;
  const label = windowLabel(payload.window);
  const { headline, unit } = shareHeadline(row, metric, options, record, label);
  return (
    <main className="flex-1 flex flex-col items-center justify-center px-4 py-14">
      <div className="w-full max-w-2xl">
        <div className="panel p-8">
          <div className="flex items-center gap-4 mb-6">
            <Image src={row.avatarUrl} alt="" width={56} height={56} className="border-2 border-dark shrink-0" unoptimized />
            <div className="min-w-0">
              <div className="font-sans font-bold text-2xl text-white truncate">{row.login}</div>
              <div className="font-mono text-xs text-faint">{label}</div>
            </div>
          </div>

          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-2">
            <span className="font-sans font-bold text-5xl text-white">{headline}</span>
            <span className="font-mono text-sm text-silver">{unit}</span>
          </div>
          {standing && (
            <p className="font-mono text-xs text-faint mb-6">
              &gt; {standing.total >= PERCENTILE_FROM ? `top ${standing.percentile}%` : `#${standing.rank}`} of {standing.total} on gitstats
            </p>
          )}

          {options.totals && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-dark border-2 border-dark mb-6">
              {([
                ["commits", fmt(row.commits), "text-silver"],
                ["added", `+${fmt(row.additions)}`, "text-green"],
                ["deleted", `−${fmt(row.deletions)}`, "text-alert"],
                ["streak", `${row.streak}d`, "text-silver"],
              ] as const).map(([name, value, tone]) => (
                <div key={name} className="bg-void px-4 py-3">
                  <div className="font-mono text-xs text-faint uppercase">{name}</div>
                  <div className={`font-sans font-bold text-xl mt-1 ${tone}`}>{value}</div>
                </div>
              ))}
            </div>
          )}
          {options.totals && (
            <p className="font-mono text-xs text-faint mb-6">
              &gt; {row.activeRepos} active repo{row.activeRepos === 1 ? "" : "s"}
              {row.topLanguage ? ` · mostly ${row.topLanguage}` : ""}
            </p>
          )}

          {options.grid && (
            <div className="mb-6">
              <div className="font-mono text-xs text-faint uppercase tracking-wide mb-2">last 26 weeks</div>
              <Heatmap days={row.days} label={`${row.login} daily contributions, last 26 weeks`} fluid />
            </div>
          )}

          {options.names && topRepos.length > 0 && (
            <div>
              <div className="font-mono text-xs text-faint uppercase tracking-wide mb-2">top repos {label}</div>
              <ul className="font-mono text-xs divide-y divide-dark">
                {topRepos.map((r) => (
                  <li key={r.nameWithOwner} className="py-2 flex justify-between gap-4">
                    <span className="text-silver truncate">{r.nameWithOwner}</span>
                    <span className="text-faint shrink-0">{fmtRank(r.lines)} lines</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 mt-6">
          <div className="flex items-center gap-3">
            <Logo />
            <span className="font-mono text-xs text-faint">{SITE_URL.replace("https://", "")}</span>
          </div>
          <Link href="/demo" className="btn-ghost">SEE A BOARD_</Link>
        </div>
        <p className="font-mono text-xs text-faint mt-6">
          &gt; {row.login} made this link on {SITE_NAME}. Anyone who has it can read this card; nothing else on the site opens without a GitHub sign-in.
        </p>
      </div>
    </main>
  );
}
