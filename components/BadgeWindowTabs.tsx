import Link from "next/link";
import { PRESETS, type Preset } from "@/lib/window";

const TAB = "px-3 py-2 uppercase transition-colors cursor-pointer";

/**
 * WEEK/MONTH/YEAR for the README badge, in the MetricTabs style. Buttons when the caller keeps the
 * choice in state (`onPick`), links to `basePath?w=` when the page reads it from the URL.
 */
export function BadgeWindowTabs({ current, onPick, basePath }: { current: Preset; onPick?: (w: Preset) => void; basePath?: string }) {
  return (
    <div className="inline-flex font-mono text-xs border-2 border-dark divide-x-2 divide-dark">
      {PRESETS.map((w) => {
        const className = `${TAB} ${current === w ? "bg-silver text-void font-bold" : "hover:text-alert"}`;
        return onPick ? (
          <button key={w} type="button" onClick={() => onPick(w)} aria-pressed={current === w} className={className}>
            {w}
          </button>
        ) : (
          <Link key={w} href={`${basePath}${w === "year" ? "" : `?w=${w}`}`} scroll={false} aria-current={current === w ? "true" : undefined} className={className}>
            {w}
          </Link>
        );
      })}
    </div>
  );
}
