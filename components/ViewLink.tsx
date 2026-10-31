"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { onSide, sideOf } from "@/lib/side";
import { withView } from "@/lib/window";

/** A gitstats path as it reads on the side the reader is on (`onSide`): a claudestats page keeps its links on claudestats. */
export function useSideHref(href: string): string {
  return onSide(href, sideOf(usePathname()));
}

/** A plain link that stays on the reader's side, for nav links that carry no window. */
export function SideLink({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  return (
    <Link href={useSideHref(href)} className={className}>
      {children}
    </Link>
  );
}

/**
 * A link to another board or profile that takes the reader's current window and metric with it, and
 * stays on the side they are on. The nav lives in a layout, which is never handed `searchParams`, so
 * the view is read on the client.
 */
export function ViewLink({
  href,
  className,
  src,
  children,
}: {
  href: string;
  className?: string;
  /** Tags the destination with the board it was opened from, which is what its back link reads. */
  src?: string;
  children: ReactNode;
}) {
  const view = withView(useSideHref(href), useSearchParams());
  return (
    <Link href={src ? `${view}${view.includes("?") ? "&" : "?"}src=${encodeURIComponent(src)}` : view} className={className}>
      {children}
    </Link>
  );
}
