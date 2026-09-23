"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { withMetric, withView } from "@/lib/window";
import { guardNavigation } from "./UnsavedGuard";

export type PaletteCrew = { id: number; name: string; code: string };
export type PaletteMember = { login: string; name: string | null };

type Item = { kind: string; label: string; hint?: string; href: string };

/**
 * Subsequence match, the way editors do it: every letter of the query has to appear in order.
 * The score rewards early and adjacent hits so "gl" puts "global board" above "settings · login".
 */
function score(label: string, query: string): number | null {
  if (query === "") return 0;
  let at = 0;
  let total = 0;
  let previous = -2;
  for (const ch of query) {
    const found = label.indexOf(ch, at);
    if (found < 0) return null;
    total += found === previous + 1 ? 0 : found + 4;
    previous = found;
    at = found + 1;
  }
  return total;
}

/** Mounted only while open, so the query and the cursor reset themselves every time. */
export function Palette({
  onClose,
  crews,
  members,
}: {
  onClose: () => void;
  crews: PaletteCrew[];
  members: PaletteMember[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const items = useMemo<Item[]>(() => {
    // Everything that lands on a board or a profile takes the reader's window and metric with it.
    const windows: Item[] = ["week", "month", "year"].map((w) => ({
      kind: "window",
      label: w,
      hint: "this page",
      href: withMetric(`${pathname}?w=${w}`, params),
    }));
    return [
      ...crews.map((c) => ({ kind: "crew", label: c.name, hint: c.code, href: withView(`/dashboard/c/${c.code}`, params) })),
      { kind: "board", label: "global board", href: withView("/dashboard/global", params) },
      ...windows,
      { kind: "page", label: "settings", href: "/dashboard/settings" },
      { kind: "page", label: "setup", href: "/dashboard/setup" },
      { kind: "page", label: "new crew", href: "/dashboard/new" },
      { kind: "page", label: "docs", href: "/docs" },
      ...members.map((m) => ({ kind: "dev", label: m.login, hint: m.name ?? undefined, href: withView(`/dashboard/u/${m.login}`, params) })),
    ];
  }, [crews, members, pathname, params]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items
      .map((item) => ({ item, rank: score(`${item.label} ${item.hint ?? ""}`.toLowerCase(), q) }))
      .filter((r): r is { item: Item; rank: number } => r.rank !== null)
      .sort((a, b) => a.rank - b.rank)
      .map((r) => r.item);
  }, [items, query]);

  useEffect(() => {
    listRef.current?.children[cursor]?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  const go = (item: Item | undefined) => {
    if (!item) return;
    onClose();
    if (!guardNavigation(() => router.push(item.href))) router.push(item.href);
  };

  return (
    <div className="fixed inset-0 z-50 bg-void/80 flex items-start justify-center pt-[12vh] px-4" onClick={onClose}>
      <div className="panel border-silver w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <input
          autoFocus
          value={query}
          placeholder="jump to…"
          aria-label="command palette"
          onChange={(e) => {
            setQuery(e.target.value);
            setCursor(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setCursor((c) => Math.min(c + 1, matches.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setCursor((c) => Math.max(c - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              go(matches[cursor]);
            } else if (e.key === "Escape") {
              onClose();
            }
          }}
          className="w-full bg-void border-b-2 border-dark px-4 py-3 font-mono text-sm text-silver outline-none placeholder:text-faint"
        />
        {matches.length === 0 ? (
          <p className="px-4 py-3 font-mono text-xs text-faint">&gt; nothing matches_</p>
        ) : (
          <ul ref={listRef} className="max-h-80 overflow-y-auto font-mono text-sm">
            {matches.map((item, i) => (
              <li key={`${item.kind}:${item.href}:${item.label}`}>
                <button
                  type="button"
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => go(item)}
                  className={`w-full text-left flex items-center gap-3 px-4 py-2 ${i === cursor ? "bg-dark text-white" : "text-dim"}`}
                >
                  <span className="text-faint text-xs w-14 shrink-0 uppercase">{item.kind}</span>
                  <span className="truncate">{item.label}</span>
                  {item.hint && <span className="text-faint text-xs truncate ml-auto">{item.hint}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="border-t-2 border-dark px-4 py-2 font-mono text-xs text-faint">↑↓ move · ⏎ open · esc close</p>
      </div>
    </div>
  );
}
