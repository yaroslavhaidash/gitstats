"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { sideOf } from "@/lib/side";

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
