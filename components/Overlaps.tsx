import Image from "next/image";
import Link from "next/link";
import { fmt } from "@/lib/format";
import { nameVisible, type OverlapRow } from "@/lib/stats";
import { windowQuery, type Window } from "@/lib/window";

/**
 * Repos more than one crewmate pushed to in the window. A repo whose name nobody here shows stays
 * anonymous and gets no page link — the same masking rule as the repo tables.
 */
export function Overlaps({
  rows,
  viewerId,
  window,
  linkRepos = true,
  src,
}: {
  rows: OverlapRow[];
  viewerId: number;
  window: Window;
  /** Off on the public demo, where a repo page would ask the reader to sign in. */
  linkRepos?: boolean;
  /** The board this panel is on, so each repo page can offer the way back to it. */
  src?: string;
}) {
  if (rows.length === 0) return null;
  return (
    <section className="panel mt-8">
      <div className="flex justify-between items-center px-4 py-3 border-b-2 border-dark">
        <h2 className="font-sans font-bold text-lg">Overlaps</h2>
        <span className="font-mono text-xs text-faint">{rows.length} shared {rows.length === 1 ? "repo" : "repos"}</span>
      </div>
      <ul className="divide-y divide-dark font-mono text-sm">
        {rows.map((r) => {
          const named = r.members.some((m) => m.userId === viewerId || nameVisible(m, r));
          return (
            <li key={r.nodeId} className="px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
              <span className="min-w-0 flex-1 break-all">
                {named && linkRepos ? (
                  <Link href={`/dashboard/r/${encodeURIComponent(r.nodeId)}?${windowQuery(window)}${src ? `&src=${encodeURIComponent(src)}` : ""}`} className="text-white hover:text-alert">
                    {r.nameWithOwner}
                  </Link>
                ) : named ? (
                  <span className="text-white">{r.nameWithOwner}</span>
                ) : (
                  <span className="text-dim">{r.isPrivate ? "private repo" : "repo"}</span>
                )}
                {r.isPrivate && <span className="text-faint text-xs ml-2">private</span>}
              </span>
              <span className="flex -space-x-2">
                {r.members.map((m) => (
                  <Image key={m.userId} src={m.avatarUrl} alt={m.login} title={m.login} width={24} height={24} className="border border-dark bg-void" unoptimized />
                ))}
              </span>
              <span className="text-white font-bold whitespace-nowrap">{fmt(r.commits)} commits</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
