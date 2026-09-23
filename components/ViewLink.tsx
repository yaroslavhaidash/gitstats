"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { withView } from "@/lib/window";

/**
 * A link to another board or profile that takes the reader's current window and metric with it. The
 * nav lives in a layout, which is never handed `searchParams`, so the view is read on the client.
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
  const view = withView(href, useSearchParams());
  return (
    <Link href={src ? `${view}${view.includes("?") ? "&" : "?"}src=${encodeURIComponent(src)}` : view} className={className}>
      {children}
    </Link>
  );
}
