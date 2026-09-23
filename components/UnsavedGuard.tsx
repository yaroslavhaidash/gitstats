"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * Leaving a settings form with unsaved changes. The browser only offers the native prompt for a
 * tab close or a refresh; in-app navigation has no such hook, so every way out of the page is
 * caught here instead: link clicks in the capture phase, `router.push` from the palette and the
 * hotkeys through `guardNavigation`, and the back button through a duplicate history entry.
 */

type Guard = { dirty: () => boolean; ask: (go: () => void) => void };

const guards = new Set<Guard>();

/**
 * Where the user was heading when they chose SAVE. The save action redirects back to the settings
 * page, which remounts the form, so the trip has to be remembered outside the component and picked
 * up by whichever guard mounts next.
 */
let resume: (() => void) | null = null;

/** Router-driven navigation asks first: the answer is true when a dirty form took the click over. */
export function guardNavigation(go: () => void): boolean {
  for (const guard of guards) {
    if (guard.dirty()) {
      guard.ask(go);
      return true;
    }
  }
  return false;
}

export type UnsavedGuard = {
  /** Set once the user has chosen; render the modal only while it is not null. */
  pending: boolean;
  /** Run the save, then go where the user was heading. */
  onSave: () => void;
  /** Drop the changes and go. */
  onDiscard: () => void;
};

export function useUnsavedGuard(dirty: boolean, save: () => void): UnsavedGuard {
  const router = useRouter();
  const [pending, setPending] = useState<{ go: () => void } | null>(null);
  // Handlers are installed once per dirty spell; they read the live values through this ref.
  const live = useRef({ dirty, save });
  useEffect(() => {
    live.current = { dirty, save };
  });
  // Set the moment the user chooses, so the handlers stop firing while we navigate away.
  const leaving = useRef(false);

  useEffect(() => {
    const guard: Guard = {
      dirty: () => live.current.dirty && !leaving.current,
      ask: (go) => setPending({ go }),
    };
    guards.add(guard);
    if (resume) {
      const go = resume;
      resume = null;
      go();
    }
    return () => {
      guards.delete(guard);
    };
  }, []);

  useEffect(() => {
    if (!dirty) return;
    leaving.current = false;

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (leaving.current) return;
      e.preventDefault();
    };

    const onClick = (e: MouseEvent) => {
      if (leaving.current || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = e.target instanceof Element ? e.target.closest("a[href]") : null;
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href);
      if (url.origin !== window.location.origin || url.href === window.location.href) return;
      e.preventDefault();
      e.stopPropagation();
      setPending({ go: () => router.push(`${url.pathname}${url.search}${url.hash}`) });
    };

    // A duplicate of the current entry, so the first Back lands here instead of leaving the page.
    // The router's own state travels with it, and `history.back()` then goes where the user meant.
    window.history.pushState(window.history.state, "", window.location.href);
    const onPopState = () => {
      if (leaving.current) return;
      setPending({ go: () => window.history.back() });
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPopState);
    };
  }, [dirty, router]);

  const leave = (go: () => void) => {
    leaving.current = true;
    setPending(null);
    go();
  };

  return {
    pending: pending !== null,
    onSave: () => {
      if (!pending) return;
      resume = pending.go;
      leaving.current = true;
      setPending(null);
      live.current.save();
    },
    onDiscard: () => {
      if (pending) leave(pending.go);
    },
  };
}

/** The site-style replacement for the browser prompt the App Router does not give us. */
export function UnsavedModal({ onSave, onDiscard }: { onSave: () => void; onDiscard: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-void/80 flex items-center justify-center px-4">
      <div className="panel border-silver w-full max-w-md p-6">
        <h2 className="font-sans font-bold text-xl mb-2">You have unsaved changes</h2>
        <p className="font-mono text-xs text-dim mb-6 leading-relaxed">
          Save them before you go, or leave them behind — this page will not keep them.
        </p>
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={onSave} className="btn-brutal">
            SAVE
          </button>
          <button type="button" onClick={onDiscard} className="btn-ghost">
            DISCARD
          </button>
        </div>
      </div>
    </div>
  );
}
