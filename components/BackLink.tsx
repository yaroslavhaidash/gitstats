"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * The way back to the board a profile or repo page was opened from. Escape does the same thing: these
 * pages are read one after another off a board, and reaching for the mouse between each one is the
 * part that gets tiring.
 */
export function BackLink({ href, label }: { href: string; label: string }) {
  const router = useRouter();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.metaKey || e.ctrlKey || e.altKey) return;
      // The palette and the range picker are both Escape's first owner while they are open.
      const target = e.target;
      if (target instanceof HTMLElement && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (document.querySelector("details[open]")) return;
      router.push(href);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, href]);
  return (
    <Link href={href} className="font-mono text-xs text-faint hover:text-alert transition-colors inline-block mb-4">
      ← <span className="uppercase">{label}</span>
    </Link>
  );
}
