"use client";

import { useState, useSyncExternalStore } from "react";
import { fmt } from "@/lib/format";

/** Hidden for this week once dismissed; a per-browser convenience, so storage failing only means it shows again. */
function dismissKey(week: string) {
  return `gs-recap-dismissed-${week}`;
}

function wasDismissed(week: string): boolean {
  try {
    return localStorage.getItem(dismissKey(week)) !== null;
  } catch {
    return false;
  }
}

function onStorage(change: () => void) {
  window.addEventListener("storage", change);
  return () => window.removeEventListener("storage", change);
}

/**
 * "Your week" on the owner's page, Monday to Wednesday: last Monday to Sunday in numbers, and the
 * crew board place for it. SHARE_ opens the share panel with the recap card; with several crews a
 * select picks which board the place comes from. Plain GET form, so it needs no JavaScript to work.
 */
export function RecapPanel({
  week,
  label,
  login,
  metric,
  stats,
  crews,
  crewId,
}: {
  /** Monday the recap week starts on. */
  week: string;
  label: string;
  login: string;
  metric: "lines" | "commits";
  stats: { additions: number; deletions: number; commits: number; activeDays: number; streak: number; topLanguage: string | null; placement: { rank: number; total: number; crew: string } | null };
  crews: { id: number; name: string }[];
  crewId: number | null;
}) {
  const [hidden, setHidden] = useState(false);
  // The server cannot see the browser's storage, so it renders the panel and the client hides it.
  const dismissed = useSyncExternalStore(onStorage, () => wasDismissed(week), () => false);
  if (hidden || dismissed) return null;
  const dismiss = () => {
    setHidden(true);
    try {
      localStorage.setItem(dismissKey(week), "1");
    } catch {
      // Hidden for this page view only.
    }
  };
  const { placement } = stats;
  return (
    <section className="panel p-6 mb-8">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <div className="tag mb-2">YOUR WEEK</div>
          <p className="font-mono text-xs text-dim">{label}</p>
        </div>
        <button type="button" onClick={dismiss} className="font-mono text-xs text-faint hover:text-alert transition-colors cursor-pointer">
          [DISMISS]
        </button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-[2px] bg-dark border-2 border-dark mb-3">
        {([
          ["lines", `+${fmt(stats.additions)} −${fmt(stats.deletions)}`],
          ["commits", fmt(stats.commits)],
          ["active days", `${stats.activeDays} of 7`],
          ["streak", `${stats.streak}d`],
          ["top language", stats.topLanguage ?? "none"],
        ] as const).map(([name, value]) => (
          <div key={name} className="bg-void px-4 py-3 min-w-0">
            <div className="font-mono text-xs text-faint uppercase">{name}</div>
            <div className="font-sans font-bold text-xl mt-1 text-white truncate">{value}</div>
          </div>
        ))}
      </div>
      {placement && (
        <p className="font-mono text-xs text-dim mb-4">
          &gt; #{placement.rank} of {placement.total} in {placement.crew} by {metric}
        </p>
      )}
      <form action={`/dashboard/u/${login}#share`} className="flex flex-wrap items-center gap-3 mt-4">
        <input type="hidden" name="share" value="recap" />
        <input type="hidden" name="m" value={metric} />
        {crews.length > 1 && (
          <select
            name="crew"
            defaultValue={crewId ?? undefined}
            aria-label="crew to place you in"
            className="bg-void border-2 border-dark px-3 py-2 font-mono text-xs focus:border-silver outline-none cursor-pointer"
          >
            {crews.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
        {crews.length === 1 && crewId !== null && <input type="hidden" name="crew" value={crewId} />}
        <button className="btn-ghost text-xs cursor-pointer">SHARE_</button>
      </form>
    </section>
  );
}
