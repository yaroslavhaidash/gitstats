import Link from "next/link";
import { METRICS, type Metric } from "@/lib/window";

/**
 * What the comparison charts count. Lines is the default because a commit is whatever the person
 * making it decides a commit is — one per line for some people, one per project for others.
 */
export function MetricTabs({ current, basePath, query }: { current: Metric; basePath: string; query: string }) {
  return (
    <div className="flex font-mono text-xs border-2 border-dark divide-x-2 divide-dark">
      {METRICS.map((m) => (
        <Link
          key={m}
          href={`${basePath}?${query}${m === "lines" ? "" : `&m=${m}`}`}
          className={`px-3 py-2 uppercase transition-colors ${current === m ? "bg-silver text-void font-bold" : "hover:text-alert"}`}
        >
          {m}
        </Link>
      ))}
    </div>
  );
}
