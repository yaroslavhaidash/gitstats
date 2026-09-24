import Link from "next/link";

const TAB = "px-3 py-2 uppercase transition-colors cursor-pointer";

/**
 * A README badge option (WEEK/MONTH/YEAR, LINES/COMMITS) in the MetricTabs style. Buttons when the
 * caller keeps the choice in state (`onPick`), links built by `href` when the page reads it from the URL.
 */
export function BadgeTabs<T extends string>({ options, current, onPick, href }: { options: readonly T[]; current: T; onPick?: (v: T) => void; href?: (v: T) => string }) {
  return (
    <div className="inline-flex font-mono text-xs border-2 border-dark divide-x-2 divide-dark">
      {options.map((v) => {
        const className = `${TAB} ${current === v ? "bg-silver text-void font-bold" : "hover:text-alert"}`;
        return onPick ? (
          <button key={v} type="button" onClick={() => onPick(v)} aria-pressed={current === v} className={className}>
            {v}
          </button>
        ) : (
          <Link key={v} href={href?.(v) ?? "#"} scroll={false} aria-current={current === v ? "true" : undefined} className={className}>
            {v}
          </Link>
        );
      })}
    </div>
  );
}
