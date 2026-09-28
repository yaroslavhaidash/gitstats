import Link from "next/link";
import { PRESETS, type Window } from "@/lib/window";

/** On a phone the week/month/year row shares the second row of the view controls with RANGE, 44px tall. */
export function WindowTabs({ current, basePath, query = "" }: { current: Window; basePath: string; query?: string }) {
  return (
    <div className="flex flex-1 sm:flex-none font-mono text-xs border-2 border-dark divide-x-2 divide-dark">
      {PRESETS.map((w) => {
        const active = current.kind === "preset" && current.value === w;
        return (
          <Link
            key={w}
            href={`${basePath}?w=${w}${query}`}
            className={`flex-1 sm:flex-none grid place-items-center min-h-11 sm:min-h-0 px-4 py-2 uppercase transition-colors ${active ? "bg-silver text-void font-bold" : "hover:text-alert"}`}
          >
            {w}
          </Link>
        );
      })}
    </div>
  );
}
