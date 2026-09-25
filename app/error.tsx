"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { reportBoundary } from "@/lib/actions";

/**
 * Without a boundary here a failed render had nothing to fall back to: the shell had already been
 * flushed, so the response was cut off mid-stream and the browser showed its own "this page couldn't
 * load" page — dead, with no way back except a manual reload. `reset()` re-renders the segment, which
 * is all a transient failure needs.
 */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const path = usePathname();
  useEffect(() => {
    console.error(error);
    void reportBoundary(path, error.digest);
  }, [error, path]);
  return (
    <main className="flex-1 grid place-items-center px-4 py-20">
      <div className="text-center max-w-lg">
        <div className="tag mb-4">SOMETHING BROKE</div>
        <h1 className="font-sans font-bold text-4xl mb-4">That didn&apos;t load.</h1>
        <p className="font-mono text-sm text-dim mb-8">
          Usually a blip between here and the database. Try again, it normally works the second time.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button type="button" onClick={reset} className="btn-brutal">
            TRY AGAIN
          </button>
          {/* A full load: /dashboard redirects to the member's board, and a client navigation drops that redirect. */}
          <a href="/dashboard" className="btn-ghost inline-block">
            DASHBOARD_
          </a>
        </div>
        {error.digest && <p className="font-mono text-xs text-faint mt-8">ref {error.digest}</p>}
      </div>
    </main>
  );
}
