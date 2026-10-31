import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Heatmap } from "@/components/Heatmap";
import { Logo } from "@/components/Logo";
import { MODEL_COLOURS, modelLabel } from "@/lib/claudestats";
import { fmt, fmtRank, fmtTokens } from "@/lib/format";
import { claudeShareCard, isClaudeMetric, resolveShareToken, shareCard, type SharePayload } from "@/lib/share";
import { accentCss, CLAUDE_HEAT_SCALE } from "@/lib/side";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import { SHARE_HEATMAP_DAYS } from "@/lib/stats";
import type { ClaudeMetric } from "@/lib/window";

/** Per request: reads the URL. The stats behind it are cached in lib/cached.ts. */
export const instant = false;

/** A link is unguessable, so a crawler must never hold on to one. */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function ShareCard({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const payload = await resolveShareToken(token);
  if (!payload) notFound();
  const { metric } = payload;
  if (isClaudeMetric(metric)) return <ClaudeCard payload={{ ...payload, metric }} />;
  const { row, label, headline, unit, rankLine, topRepos, activeDays } = await shareCard({ ...payload, metric });
  const { options } = payload;
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
          {rankLine && <p className="font-mono text-xs text-faint mb-6">&gt; {rankLine}</p>}

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
              &gt; {activeDays === null ? `${row.activeRepos} active repo${row.activeRepos === 1 ? "" : "s"}` : `${activeDays} of 7 days active`}
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

/**
 * A claudestats card: the same layout in the side's colour, with tokens, output, sessions and the
 * streak, and the 26 weeks of replies. There are no repos on this side, so no names to switch on.
 */
async function ClaudeCard({ payload }: { payload: SharePayload & { metric: ClaudeMetric } }) {
  const { row, label, headline, unit, rankLine } = await claudeShareCard(payload);
  const { options } = payload;
  const login = row?.login ?? "";
  return (
    <main className="flex-1 flex flex-col items-center justify-center px-4 py-14" data-side="claude">
      <style dangerouslySetInnerHTML={{ __html: accentCss(MODEL_COLOURS) }} />
      <div className="w-full max-w-2xl">
        <div className="panel p-8">
          <div className="flex items-center gap-4 mb-6">
            {row && <Image src={row.avatarUrl} alt="" width={56} height={56} className="border-2 border-dark shrink-0" unoptimized />}
            <div className="min-w-0">
              <div className="font-sans font-bold text-2xl text-white truncate">{login}</div>
              <div className="font-mono text-xs text-faint">Claude Code · {label}</div>
            </div>
          </div>

          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-2">
            <span className="font-sans font-bold text-5xl text-white">{headline}</span>
            <span className="font-mono text-sm text-silver">{unit}</span>
          </div>
          {rankLine && <p className="font-mono text-xs text-faint mb-6">&gt; {rankLine}</p>}

          {options.totals && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-dark border-2 border-dark mb-6">
              {([
                ["tokens", fmtTokens(row?.tokens ?? 0), "text-silver"],
                ["output", fmtTokens(row?.output ?? 0), "text-alert"],
                ["sessions", fmt(row?.sessions ?? 0), "text-silver"],
                ["streak", `${row?.streak ?? 0}d`, "text-silver"],
              ] as const).map(([name, value, tone]) => (
                <div key={name} className="bg-void px-4 py-3">
                  <div className="font-mono text-xs text-faint uppercase">{name}</div>
                  <div className={`font-sans font-bold text-xl mt-1 ${tone}`}>{value}</div>
                </div>
              ))}
            </div>
          )}
          {options.totals && row && (
            <p className="font-mono text-xs text-faint mb-6">
              &gt; {row.activeDays} active day{row.activeDays === 1 ? "" : "s"}
              {row.topModel ? ` · mostly ${modelLabel(row.topModel)}` : ""}
            </p>
          )}

          {options.grid && (
            <div className="mb-6">
              <div className="font-mono text-xs text-faint uppercase tracking-wide mb-2">last 26 weeks</div>
              <Heatmap days={row?.days ?? new Array<number>(SHARE_HEATMAP_DAYS).fill(0)} label={`${login} Claude Code replies per day, last 26 weeks`} fluid heat={CLAUDE_HEAT_SCALE} />
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 mt-6">
          <div className="flex items-center gap-3">
            <Logo href="/claude" side="claude" />
            <span className="font-mono text-xs text-faint">{SITE_URL.replace("https://", "")}</span>
          </div>
          <Link href="/demo/claude" className="btn-ghost">SEE A BOARD_</Link>
        </div>
        <p className="font-mono text-xs text-faint mt-6">
          &gt; {login} made this link on {SITE_NAME}. Anyone who has it can read this card; nothing else on the site opens without a GitHub sign-in.
        </p>
      </div>
    </main>
  );
}
