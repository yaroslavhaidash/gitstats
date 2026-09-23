import Link from "next/link";
import { fmtDateTime } from "@/lib/format";
import type { SyncWarning } from "@/lib/stats";

function line(w: SyncWarning): string {
  if (w.kind === "token") return `your GitHub token "${w.name}" stopped working · private repos are not being counted`;
  return w.last ? `${w.name} has not synced since ${fmtDateTime(w.last)}` : `${w.name} was linked but has never synced`;
}

/** Amber, one line per problem, only ever rendered for the member it is about. */
export function SyncNotice({ warnings }: { warnings: SyncWarning[] }) {
  if (warnings.length === 0) return null;
  return (
    <div className="border-2 border-amber mb-8 divide-y divide-dark">
      {warnings.map((w) => (
        <Link
          key={`${w.kind}:${w.name}`}
          href="/dashboard/settings"
          className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 font-mono text-xs text-amber hover:bg-amber hover:text-void transition-colors"
        >
          <span>&gt; {line(w)}</span>
          <span className="font-bold whitespace-nowrap">SETTINGS →</span>
        </Link>
      ))}
    </div>
  );
}
