import Link from "next/link";

/** The plain logo, a link home. `side` draws the claudestats mark, which takes its colour from the frame it sits in. */
export function Logo({ href = "/", compact = false, side = "git" }: { href?: string; compact?: boolean; side?: "git" | "claude" }) {
  return (
    <Link href={href} className="flex items-center gap-3">
      <span className="w-8 h-8 bg-alert text-void font-mono font-bold text-sm grid place-items-center border-2 border-silver">
        {side === "git" ? "gs" : "cs"}
      </span>
      <span className={`font-sans font-bold text-lg ${compact ? "hidden sm:inline" : ""}`}>
        {side === "git" ? "git" : "claude"}<span className="text-alert">stats</span>
      </span>
    </Link>
  );
}
