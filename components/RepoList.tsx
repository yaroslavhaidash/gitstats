import Link from "next/link";
import { toggleRepoName } from "@/lib/actions";
import { fmt } from "@/lib/format";
import type { RepoRow } from "@/lib/stats";
import { windowQuery, type Window } from "@/lib/window";

const PENDING_TITLE = "GitHub was still computing this repo at the last snapshot; numbers are from the previous run";

function RepoName({ row, named, window, linkRepo, src }: { row: RepoRow; named: boolean; window: Window; linkRepo: boolean; src?: string }) {
  return (
    <>
      {named && linkRepo ? (
        <Link href={`/dashboard/r/${encodeURIComponent(row.nodeId)}?${windowQuery(window)}${src ? `&src=${encodeURIComponent(src)}` : ""}`} className="text-white hover:text-alert">
          {row.nameWithOwner}
        </Link>
      ) : named ? (
        <span className="text-white">{row.nameWithOwner}</span>
      ) : (
        <span className="text-dim">{row.isPrivate ? "private repo" : "hidden repo"}</span>
      )}
      {named && !row.isPrivate && (
        <a href={`https://github.com/${row.nameWithOwner}`} target="_blank" rel="noreferrer" title="open on GitHub" className="text-faint hover:text-alert ml-2">
          ↗
        </a>
      )}
      {row.isPrivate && <span className="text-faint text-xs ml-2">private</span>}
      {row.isFork && <span className="text-faint text-xs ml-2">fork</span>}
      {row.statsPending && (
        <span className="text-amber text-xs ml-2" title={PENDING_TITLE}>
          stats pending
        </span>
      )}
    </>
  );
}

/** The owner's per-repo name switch: hiding here beats whatever the visibility matrix allows. */
function NameToggle({ row, hidden, back }: { row: RepoRow; hidden: boolean; back: string }) {
  return (
    <form action={toggleRepoName} className="inline">
      <input type="hidden" name="nodeId" value={row.nodeId} />
      <input type="hidden" name="hidden" value={hidden ? "0" : "1"} />
      <input type="hidden" name="back" value={back} />
      <button className="font-mono text-xs text-faint hover:text-alert whitespace-nowrap">[{hidden ? "show name" : "hide name"}]</button>
    </form>
  );
}

/**
 * Repos the member shipped to in the window: a table on desktop, one card per repo on a phone.
 * `owner` turns on the per-repo name switches, which only the member themselves ever sees.
 */
export function RepoList({
  rows,
  showName,
  window,
  owner,
  hiddenNames,
  back,
  linkRepos = true,
  src,
}: {
  rows: RepoRow[];
  showName: (row: RepoRow) => boolean;
  window: Window;
  owner?: boolean;
  hiddenNames?: Set<string>;
  back?: string;
  /** Off on the public demo, where a repo page would ask the reader to sign in. */
  linkRepos?: boolean;
  /** Passed straight through to each repo page, so its back link says what this page's says. */
  src?: string;
}) {
  return (
    <>
      <div className="divide-y divide-dark font-mono text-sm sm:hidden">
        {rows.map((r) => (
          <div key={r.nodeId} className="px-4 py-3">
            <div className="break-all">
              <RepoName row={r} named={showName(r)} window={window} linkRepo={linkRepos} src={src} />
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs mt-2">
              <span className="text-white font-bold">{fmt(r.commits)} commits</span>
              <span className="text-green">+{fmt(r.additions)}</span>
              <span className="text-alert">−{fmt(r.deletions)}</span>
              <span className="text-dim ml-auto">{r.primaryLanguage ?? "—"} · ★ {fmt(r.stargazerCount)}</span>
            </div>
            {owner && <div className="mt-2"><NameToggle row={r} hidden={hiddenNames?.has(r.nodeId) ?? false} back={back ?? ""} /></div>}
          </div>
        ))}
      </div>

      <table className="w-full font-mono text-sm whitespace-nowrap hidden sm:table">
        <thead>
          <tr className="text-xs text-faint uppercase tracking-wide border-b border-dark">
            <th className="text-left px-4 py-2 font-normal">repo</th>
            <th className="text-left px-4 py-2 font-normal">lang</th>
            <th className="text-right px-4 py-2 font-normal">stars</th>
            <th className="text-right px-4 py-2 font-normal">commits</th>
            <th className="text-right px-4 py-2 font-normal">added</th>
            <th className="text-right px-4 py-2 font-normal">deleted</th>
            {owner && <th className="text-right px-4 py-2 font-normal">name</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-dark">
          {rows.map((r) => (
            <tr key={r.nodeId} className="hover:bg-dark/40">
              <td className="px-4 py-2">
                <RepoName row={r} named={showName(r)} window={window} linkRepo={linkRepos} src={src} />
              </td>
              <td className="px-4 py-2 text-dim">{r.primaryLanguage ?? "—"}</td>
              <td className="px-4 py-2 text-right">{fmt(r.stargazerCount)}</td>
              <td className="px-4 py-2 text-right text-white font-bold">{fmt(r.commits)}</td>
              <td className="px-4 py-2 text-right text-green">+{fmt(r.additions)}</td>
              <td className="px-4 py-2 text-right text-alert">−{fmt(r.deletions)}</td>
              {owner && (
                <td className="px-4 py-2 text-right">
                  <NameToggle row={r} hidden={hiddenNames?.has(r.nodeId) ?? false} back={back ?? ""} />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
