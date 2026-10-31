"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { CLAUDE_ACCENT, counterpart, sideOf, type Side } from "@/lib/side";
import { NavMenu } from "./NavMenu";

const NO_PARAMS = new URLSearchParams();

/** Each side's own colour, wherever its mark or wordmark is drawn, not the colour of the side you are on. */
const COLOUR: Record<Side, string> = { git: "#ff3333", claude: CLAUDE_ACCENT.accent };

/** The mark of each side, in that side's colour. */
function Mark({ side }: { side: Side }) {
  return (
    <span
      className="w-8 h-8 shrink-0 text-void font-mono font-bold text-sm grid place-items-center border-2 border-silver"
      style={{ backgroundColor: COLOUR[side] }}
    >
      {side === "git" ? "gs" : "cs"}
    </span>
  );
}

function Wordmark({ side }: { side: Side }) {
  return (
    <>
      {side === "git" ? "git" : "claude"}
      <span style={{ color: COLOUR[side] }}>stats</span>
    </>
  );
}

const ROWS: { side: Side; note: string }[] = [
  { side: "git", note: "commits and lines" },
  { side: "claude", note: "Claude Code tokens" },
];

function Switch({ homes, compact, params }: { homes: Record<Side, string>; compact: boolean; params: { get(key: string): string | null } }) {
  const pathname = usePathname();
  const here = sideOf(pathname);
  const other = counterpart(pathname, params);
  return (
    <NavMenu
      panel="w-[min(260px,calc(100vw-32px))]"
      label={
        <span className="flex items-center gap-3 h-11">
          <span className="sr-only">switch site, now {here === "git" ? "gitstats" : "claudestats"}</span>
          <span aria-hidden className="flex items-center gap-3">
            <Mark side={here} />
            <span className={`font-sans font-bold text-lg text-silver ${compact ? "hidden sm:inline" : ""}`}>
              <Wordmark side={here} />
            </span>
            <span className="text-xs">▾</span>
          </span>
        </span>
      }
    >
      {ROWS.map(({ side, note }) => (
        <Link
          key={side}
          href={side === here ? homes[side] : other}
          aria-current={side === here ? "true" : undefined}
          className={`flex items-center gap-3 min-h-11 px-3 py-1.5 border-l-4 hover:text-alert transition-colors ${side === here ? "border-l-silver" : "border-l-transparent"}`}
        >
          <Mark side={side} />
          <span className="min-w-0 font-mono text-xs">
            <span className="block font-sans font-bold text-sm text-silver">
              <Wordmark side={side} />
            </span>
            <span className="block text-faint truncate">{note}</span>
          </span>
        </Link>
      ))}
    </NavMenu>
  );
}

/**
 * The logo, which is also the switch between gitstats and claudestats: the mark and wordmark show
 * the side you are on, and the menu takes you to the same page on the other one (`counterpart`) or
 * home on this one. The window is read on the client, under its own Suspense so a prerendered page
 * only waits for this, not for the bar around it.
 */
export function SideSwitch({ homes, compact = false }: { homes: Record<Side, string>; compact?: boolean }) {
  return (
    <Suspense fallback={<Switch homes={homes} compact={compact} params={NO_PARAMS} />}>
      <WithParams homes={homes} compact={compact} />
    </Suspense>
  );
}

function WithParams({ homes, compact }: { homes: Record<Side, string>; compact: boolean }) {
  return <Switch homes={homes} compact={compact} params={useSearchParams()} />;
}
