"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import { withView } from "@/lib/window";

/**
 * The narrow-screen nav: a `[MENU]` button that opens a full-height sheet from the right. It is a
 * modal `<dialog>`, so it sits above the sticky nav's backdrop filter, the page behind is inert
 * (focus stays in the sheet) and Esc closes it; a tap on a link or on the dimmed page closes it too.
 */
export function NavSheet({ label = "MENU", title, className = "", children }: { label?: ReactNode; title?: ReactNode; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const path = usePathname();

  // A link inside that stays on the same path (an anchor) does not change `path`, hence the click handler below as well.
  useEffect(() => ref.current?.close(), [path]);

  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.showModal()}
        aria-haspopup="dialog"
        className={`h-11 px-3 border-2 border-silver font-mono text-xs font-bold hover:bg-silver hover:text-void transition-colors cursor-pointer ${className}`}
      >
        {label}
      </button>
      <dialog
        ref={ref}
        aria-label="menu"
        onClick={(e) => {
          // The dialog element itself only receives a click on its backdrop; a link inside closes it as it navigates.
          if (e.target === e.currentTarget || (e.target as Element).closest("a")) ref.current?.close();
        }}
        className="m-0 ml-auto h-dvh max-h-dvh w-full max-w-sm bg-void text-silver border-l-2 border-silver p-0 backdrop:bg-void/80 motion-safe:animate-[sheet-in_180ms_ease-out]"
      >
        <div className="min-h-full flex flex-col font-mono">
          <div className="h-16 shrink-0 flex items-center justify-between px-4 border-b-2 border-dark">
            <span className="flex items-center gap-3 text-xs min-w-0">{title ?? <span className="text-faint">&gt; menu</span>}</span>
            <button
              type="button"
              onClick={() => ref.current?.close()}
              aria-label="close menu"
              className="h-11 w-11 grid place-items-center border-2 border-dark hover:border-silver hover:text-alert transition-colors cursor-pointer"
            >
              ✕
            </button>
          </div>
          {children}
        </div>
      </dialog>
    </>
  );
}

/** A heading inside the sheet. */
export function SheetLabel({ children }: { children: ReactNode }) {
  return <div className="px-4 pt-5 pb-2 text-[11px] text-faint uppercase tracking-wide">{children}</div>;
}

/**
 * One destination in the sheet: a 52px row, marked with the red bar when it is the page you are on.
 * `view` carries the reader's window and metric along, like `ViewLink` does for boards and profiles.
 */
export function SheetLink({ href, view = false, children }: { href: string; view?: boolean; children: ReactNode }) {
  const path = usePathname();
  const params = useSearchParams();
  const here = path === href || path.startsWith(`${href}/`);
  return (
    <Link
      href={view ? withView(href, params) : href}
      aria-current={here ? "page" : undefined}
      className={`flex items-center gap-2 min-h-13 px-4 border-l-4 text-sm uppercase transition-colors ${
        here ? "border-alert bg-alert/10 text-alert font-bold" : "border-transparent hover:bg-dark/60 hover:text-alert"
      }`}
    >
      {children}
    </Link>
  );
}

/**
 * A signed-out page's own links (plain `<a>`/`<Link>` elements written for the desktop row) laid out
 * as sheet rows, so each page keeps one list of links for both.
 */
export function SheetLinks({ children }: { children: ReactNode }) {
  return (
    <div className="grid [&>a]:flex [&>a]:items-center [&>a]:min-h-13 [&>a]:px-4 [&>a]:border-l-4 [&>a]:border-transparent [&>a]:text-sm [&>a:hover]:bg-dark/60">
      {children}
    </div>
  );
}
