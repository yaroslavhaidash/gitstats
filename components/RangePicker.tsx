"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { fmtDate } from "@/lib/format";
import type { Window } from "@/lib/window";

const FIELD = "w-full bg-void border-2 border-dark px-2 py-1.5 font-mono text-xs text-silver [color-scheme:dark] focus:border-silver outline-none";

function CalendarIcon() {
  return (
    <svg viewBox="0 0 16 16" width={13} height={13} aria-hidden className="shrink-0">
      <rect x={1.5} y={3} width={13} height={11.5} fill="none" stroke="currentColor" strokeWidth={1.5} />
      <line x1={1.5} y1={6.5} x2={14.5} y2={6.5} stroke="currentColor" strokeWidth={1.5} />
      <line x1={5} y1={1.5} x2={5} y2={4} stroke="currentColor" strokeWidth={1.5} />
      <line x1={11} y1={1.5} x2={11} y2={4} stroke="currentColor" strokeWidth={1.5} />
    </svg>
  );
}

/**
 * Custom `?from=&to=` range, folded behind one button so it costs a line of the header rather than
 * half of it. Open it and the two dates are there; a range already in effect is written on the button.
 */
export function RangePicker({ current, basePath, query = "" }: { current: Window; basePath: string; query?: string }) {
  const router = useRouter();
  const box = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(current.kind === "range" ? current.from : "");
  const [to, setTo] = useState(current.kind === "range" ? current.to : "");
  const ready = from !== "" && to !== "" && from <= to;
  const active = current.kind === "range";

  // A click anywhere else closes it, the same as the nav menus elsewhere on the page.
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const escape = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <div className="relative" ref={box}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`flex items-center gap-2 font-mono text-xs uppercase border-2 px-3 py-2 transition-colors cursor-pointer ${
          active ? "bg-silver text-void border-silver font-bold" : "border-dark hover:text-alert"
        }`}
      >
        <CalendarIcon />
        {active && current.kind === "range" ? `${fmtDate(current.from)} – ${fmtDate(current.to)}` : "range"}
      </button>
      {open && (
        <form
          className="absolute right-0 top-full mt-2 z-50 panel bg-void p-3 grid gap-2 w-56"
          onSubmit={(e) => {
            e.preventDefault();
            if (!ready) return;
            setOpen(false);
            router.push(`${basePath}?from=${from}&to=${to}${query}`);
          }}
        >
          <label className="font-mono text-[11px] text-faint uppercase">
            from
            <input aria-label="range start" type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className={`${FIELD} mt-1`} />
          </label>
          <label className="font-mono text-[11px] text-faint uppercase">
            to
            <input aria-label="range end" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className={`${FIELD} mt-1`} />
          </label>
          <button
            type="submit"
            disabled={!ready}
            className="font-mono text-xs font-bold border-2 border-dark px-3 py-1.5 uppercase transition-colors enabled:hover:border-silver enabled:hover:text-alert enabled:cursor-pointer disabled:text-faint disabled:cursor-not-allowed"
          >
            apply
          </button>
        </form>
      )}
    </div>
  );
}
