import Link from "next/link";
import { PRESETS, type Window } from "@/lib/window";

export function WindowTabs({ current, basePath, query = "" }: { current: Window; basePath: string; query?: string }) {
  return (
    <div className="flex font-mono text-xs border-2 border-dark divide-x-2 divide-dark">
      {PRESETS.map((w) => {
        const active = current.kind === "preset" && current.value === w;
        return (
          <Link
            key={w}
            href={`${basePath}?w=${w}${query}`}
            className={`px-4 py-2 uppercase transition-colors ${active ? "bg-silver text-void font-bold" : "hover:text-alert"}`}
          >
            {w}
          </Link>
        );
      })}
    </div>
  );
}
