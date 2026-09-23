"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { reportBoundary } from "@/lib/actions";

/** Same as the root boundary, but inside the dashboard shell so the nav stays usable. */
export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const path = usePathname();
  useEffect(() => {
    void reportBoundary(path, error.digest);
  }, [error, path]);
  return (
    <div className="panel p-8 text-center">
      <div className="tag mb-4">SOMETHING BROKE</div>
      <h2 className="font-sans font-bold text-2xl mb-3">That didn&apos;t load.</h2>
      <p className="font-mono text-sm text-dim mb-6">Usually a blip between here and the database.</p>
      <button type="button" onClick={reset} className="btn-brutal">
        TRY AGAIN
      </button>
      {error.digest && <p className="font-mono text-xs text-faint mt-6">ref {error.digest}</p>}
    </div>
  );
}
