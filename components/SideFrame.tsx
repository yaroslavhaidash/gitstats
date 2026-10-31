"use client";

import { usePathname } from "next/navigation";
import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { ACCENT_NAMES, ACCENTS, DEFAULT_ACCENT, isAccent, sideOf, type AccentName } from "@/lib/side";

const KEY = "gs-claude-accent";
const OPEN_KEY = "gs-claude-accent-open";
const EVENT = "gs-claude-accent";

function read<T>(key: string, parse: (value: string | null) => T): T {
  try {
    return parse(localStorage.getItem(key));
  } catch {
    return parse(null);
  }
}

const readAccent = () => read(KEY, (v): AccentName => (isAccent(v) ? v : DEFAULT_ACCENT));
// Open until the admin folds it away, so the trial is the first thing they see.
const readOpen = () => read(OPEN_KEY, (v) => v !== "0");

function subscribe(onChange: () => void): () => void {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function store(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage blocked: the choice still applies until the page is left.
  }
  window.dispatchEvent(new Event(EVENT));
}

/**
 * Wraps nav, main and footer, and marks the claudestats pages with `data-side="claude"`, which is
 * what swaps alert red for the accent (the rules come from `accentCss`). It reads the path on the
 * server too, so the first paint is already in the right colour.
 */
export function SideFrame({ children }: { children: ReactNode }) {
  const claude = sideOf(usePathname()) === "claude";
  return (
    <div className="flex-1 flex flex-col" data-side={claude ? "claude" : undefined}>
      {children}
    </div>
  );
}

/**
 * The admin's accent trial, temporary until one accent is locked: a chip fixed to the bottom left of
 * every claudestats page, open by default and folded to one 44px swatch with a tap. It sets
 * `data-accent` on the page's claude frames, so everyone else always sees the default, whatever their
 * storage holds. It leaves a strip of its own height under the footer, so at the end of the page it
 * never sits on the footer's links.
 */
export function AccentPicker() {
  const claude = sideOf(usePathname()) === "claude";
  const accent = useSyncExternalStore(subscribe, readAccent, () => DEFAULT_ACCENT);
  const open = useSyncExternalStore(subscribe, readOpen, () => true);
  useEffect(() => {
    if (!claude) return;
    const frames = document.querySelectorAll<HTMLElement>('[data-side="claude"]');
    frames.forEach((f) => (accent === DEFAULT_ACCENT ? f.removeAttribute("data-accent") : f.setAttribute("data-accent", accent)));
    return () => frames.forEach((f) => f.removeAttribute("data-accent"));
  }, [claude, accent]);
  if (!claude) return null;
  const toggle = (
    <button
      type="button"
      onClick={() => store(OPEN_KEY, open ? "0" : "1")}
      aria-expanded={open}
      aria-label={open ? "fold the accent trial" : `accent trial, now ${ACCENTS[accent].label}`}
      className="flex items-center justify-center gap-2 min-w-11 min-h-11 px-2 text-dim hover:text-silver cursor-pointer transition-colors"
    >
      {open ? <span aria-hidden>×</span> : <span aria-hidden className="w-5 h-5 border-2 border-silver" style={{ backgroundColor: ACCENTS[accent].accent }} />}
    </button>
  );
  return (
    <>
      {/* As tall as the chip and its offset, so the end of the page scrolls clear of it. */}
      <div aria-hidden className={open ? "h-40 sm:h-20" : "h-16 sm:h-20"} />
      <div
        role="group"
        aria-label="claudestats accent trial"
        className="fixed left-2 bottom-2 sm:left-4 sm:bottom-4 z-30 max-w-[calc(100vw-16px)] bg-void border-2 border-alert shadow-brutal font-mono text-[11px]"
      >
        {open ? (
          <div className="flex flex-wrap sm:flex-nowrap items-center p-0.5 w-[248px] sm:w-auto">
            <span className="flex-1 sm:flex-none px-2 text-faint uppercase tracking-wide">accent trial</span>
            <span className="order-last sm:order-none w-full sm:w-auto grid grid-cols-4 sm:flex gap-0.5">
              {ACCENT_NAMES.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => store(KEY, name)}
                  aria-pressed={accent === name}
                  aria-label={ACCENTS[name].label}
                  title={`${ACCENTS[name].label} ${ACCENTS[name].accent}`}
                  className={`flex items-center justify-center gap-1.5 min-w-11 min-h-11 sm:min-w-0 sm:px-2 border-2 cursor-pointer transition-colors ${accent === name ? "border-silver text-white" : "border-transparent text-dim hover:text-silver"}`}
                >
                  <span className="w-4 h-4 inline-block" style={{ backgroundColor: ACCENTS[name].accent }} />
                  <span className="hidden lg:inline">{ACCENTS[name].label}</span>
                </button>
              ))}
            </span>
            {toggle}
          </div>
        ) : (
          toggle
        )}
      </div>
    </>
  );
}
