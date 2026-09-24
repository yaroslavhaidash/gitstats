import type { ReactNode } from "react";
import { SiteNav } from "@/components/SiteNav";

/** The frame of the public handle pages, `/gh/<login>` and `/vs/<a>/<b>`. */
export function PublicShell({ children, where }: { children: ReactNode; where: string }) {
  return (
    <main className="flex-1">
      <SiteNav where={where} />
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">{children}</div>
    </main>
  );
}
