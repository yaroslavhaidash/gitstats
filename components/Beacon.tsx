"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/** One event to `/api/t`. `sendBeacon` survives the page unloading, which a sign-in click does. */
export function beacon(body: { kind: "view" | "signin_click"; from?: string }): void {
  try {
    navigator.sendBeacon("/api/t", JSON.stringify({ ...body, path: window.location.pathname + window.location.search, ref: document.referrer }));
  } catch {
    // No beacon, no count; the page carries on.
  }
}

/** Sends a page view on every route change; see `lib/visits.ts` for what is kept. */
export function Beacon() {
  const pathname = usePathname();
  useEffect(() => {
    beacon({ kind: "view" });
  }, [pathname]);
  return null;
}
