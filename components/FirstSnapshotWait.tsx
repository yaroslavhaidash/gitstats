"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

const POLL_MS = 5_000;
const STOP_AFTER_MS = 5 * 60_000;

/**
 * Shown on a new member's pages while their first snapshot runs, in place of a page of zeros. Asks
 * every 5 s whether it has finished and re-renders the page with the real numbers when it has.
 */
export function FirstSnapshotWait() {
  const router = useRouter();
  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(async () => {
      if (Date.now() - started > STOP_AFTER_MS) return clearInterval(timer);
      try {
        const res = await fetch("/api/first-snapshot", { cache: "no-store" });
        const { running } = (await res.json()) as { running: boolean };
        if (running) return;
        clearInterval(timer);
        router.refresh();
      } catch {
        // A missed poll is retried on the next tick.
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [router]);
  return (
    <div role="status" className="border-2 border-amber mb-8 px-4 py-3 font-mono text-xs text-amber">
      &gt; counting your public repos, about a minute · this page fills in by itself
    </div>
  );
}
