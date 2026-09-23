import Link from "next/link";

export function Logo({ href = "/", compact = false }: { href?: string; compact?: boolean }) {
  return (
    <Link href={href} className="flex items-center gap-3">
      <span className="w-8 h-8 bg-alert text-void font-mono font-bold text-sm grid place-items-center border-2 border-silver">
        gs
      </span>
      <span className={`font-sans font-bold text-lg ${compact ? "hidden sm:inline" : ""}`}>
        git<span className="text-alert">stats</span>
      </span>
    </Link>
  );
}
