"use client";

import { usePathname } from "next/navigation";
import { useSyncExternalStore, type ReactNode } from "react";
import { ACCENT_NAMES, ACCENTS, DEFAULT_ACCENT, isAccent, sideOf, type AccentName } from "@/lib/side";

const KEY = "gs-claude-accent";
const EVENT = "gs-claude-accent";

function readAccent(): AccentName {
  try {
    const value = localStorage.getItem(KEY);
    return isAccent(value) ? value : DEFAULT_ACCENT;
  } catch {
    return DEFAULT_ACCENT;
  }
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function chooseAccent(name: AccentName): void {
  try {
    localStorage.setItem(KEY, name);
  } catch {
    // Storage blocked: the choice still applies until the page is left.
  }
  window.dispatchEvent(new Event(EVENT));
}

/**
 * Wraps nav, main and footer, and marks the claudestats pages with `data-side="claude"`, which is
 * what swaps alert red for the accent (the rules come from `accentCss`). It reads the path on the
 * server too, so the first paint is already in the right colour. `picker` is the admin's accent
 * trial: everyone else always sees the default, whatever their storage holds.
 */
export function SideFrame({ picker, children }: { picker: boolean; children: ReactNode }) {
  const claude = sideOf(usePathname()) === "claude";
  const stored = useSyncExternalStore(subscribe, readAccent, () => DEFAULT_ACCENT);
  const accent = picker ? stored : DEFAULT_ACCENT;
  return (
    <div className="flex-1 flex flex-col" data-side={claude ? "claude" : undefined} data-accent={claude && accent !== DEFAULT_ACCENT ? accent : undefined}>
      {children}
      {claude && picker && <AccentPicker current={accent} />}
    </div>
  );
}

/** A small fixed chip with the candidate accents; temporary, until one is locked. */
function AccentPicker({ current }: { current: AccentName }) {
  return (
    <div role="group" aria-label="claudestats accent trial" className="fixed bottom-4 right-4 z-50 panel bg-void flex items-center gap-1 p-1 font-mono text-[11px]">
      <span className="px-2 text-faint hidden sm:inline">accent</span>
      {ACCENT_NAMES.map((name) => (
        <button
          key={name}
          type="button"
          onClick={() => chooseAccent(name)}
          aria-pressed={current === name}
          aria-label={ACCENTS[name].label}
          className={`flex items-center justify-center gap-1.5 min-w-11 min-h-11 sm:min-w-0 sm:min-h-0 px-2 py-1.5 border-2 cursor-pointer transition-colors ${current === name ? "border-silver text-white" : "border-transparent text-dim hover:text-silver"}`}
        >
          <span className="w-3 h-3 inline-block" style={{ backgroundColor: ACCENTS[name].accent }} />
          <span className="hidden sm:inline">{ACCENTS[name].label}</span>
        </button>
      ))}
    </div>
  );
}
