"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * The nav's one dropdown: `[MENU ▾]` on a phone, `[<CREW> ▾]` on a desktop with several crews.
 *
 * A bare `<details>` stays open until its own summary is clicked again, so opening it and then
 * clicking anywhere else leaves a panel hanging over the page. The open state is held here instead,
 * and while it is open a document-level `pointerdown` listener closes it on the first click that
 * lands outside — attached only while open, so a closed menu costs nothing.
 */
export function NavMenu({ label, className = "", children }: { label: ReactNode; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <details ref={ref} open={open} onToggle={(e) => setOpen(e.currentTarget.open)} className={`relative ${className}`}>
      <summary className="list-none cursor-pointer hover:text-alert transition-colors whitespace-nowrap">{label}</summary>
      {/* Wide enough for the longest item it holds, never narrower than the trigger and never wider
          than the viewport, so a long crew name reads in full on a desktop and truncates on a phone. */}
      <div
        onClick={() => setOpen(false)}
        className="absolute left-0 top-full mt-2 z-50 panel bg-void grid divide-y divide-dark w-max min-w-[max(14rem,100%)] max-w-[calc(100vw-2rem)]"
      >
        {children}
      </div>
    </details>
  );
}
