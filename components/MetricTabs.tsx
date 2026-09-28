import Link from "next/link";
import { METRICS, type Metric } from "@/lib/window";

/**
 * What the comparison charts count. Lines is the default because a commit is whatever the person
 * making it decides a commit is — one per line for some people, one per project for others.
 * On a phone it is the first row of the view controls: full width, 44px tall.
 */
export function MetricTabs({ current, basePath, query }: { current: Metric; basePath: string; query: string }) {
  return (
    <div className="flex w-full sm:w-auto font-mono text-xs border-2 border-dark divide-x-2 divide-dark">
      {METRICS.map((m) => (
        <Link
          key={m}
          href={`${basePath}?${query}${m === "lines" ? "" : `&m=${m}`}`}
          className={`flex-1 sm:flex-none grid place-items-center min-h-11 sm:min-h-0 px-3 py-2 uppercase transition-colors ${current === m ? "bg-silver text-void font-bold" : "hover:text-alert"}`}
        >
          {m}
        </Link>
      ))}
    </div>
  );
}
