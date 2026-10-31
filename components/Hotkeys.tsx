"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Palette, type PaletteCrew, type PaletteMember } from "./Palette";
import { guardNavigation } from "./UnsavedGuard";
import { counterpart, sideOf } from "@/lib/side";
import { withMetric, withView } from "@/lib/window";

/**
 * 1/2/3/4 switch the time window, g jumps to the global board, h to your first crew, s to the same page
 * on the other side (gitstats or claudestats), / opens the palette. g and h stay on the side you are on.
 */
export function Hotkeys({ homePath, crews, members }: { homePath: string; crews: PaletteCrew[]; members: PaletteMember[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [palette, setPalette] = useState(false);
  useEffect(() => {
    const claude = sideOf(pathname) === "claude";
    const go = (href: string) => {
      if (!guardNavigation(() => router.push(href))) router.push(href);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target;
      if (target instanceof HTMLElement && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      const windows: Record<string, string> = { "1": "week", "2": "month", "3": "year", "4": "all" };
      if (e.key === "/") {
        e.preventDefault();
        setPalette(true);
      } else if (windows[e.key]) go(withMetric(`${pathname}?w=${windows[e.key]}`, params));
      else if (e.key === "g") go(withView(claude ? "/dashboard/claude/global" : "/dashboard/global", params));
      else if (e.key === "h") go(withView(claude ? counterpart(homePath) : homePath, params));
      else if (e.key === "s") go(counterpart(pathname, params));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, pathname, homePath, params]);
  return palette ? <Palette onClose={() => setPalette(false)} crews={crews} members={members} /> : null;
}
