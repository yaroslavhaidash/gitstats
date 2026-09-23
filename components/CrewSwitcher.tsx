"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { collapses, type NavCrew } from "@/lib/nav";
import { NavMenu } from "./NavMenu";
import { ViewLink } from "./ViewLink";

/**
 * The crews in the desktop nav. One crew with a short name is its own link, as it always was — a
 * dropdown to reach the only place you can go is a click for nothing. Past that they collapse into
 * one trigger carrying the crew you are on, and `[+ CREW]` moves inside with them, because a row of
 * long names pushes GLOBAL and DOCS off the end of the bar.
 */
export function CrewSwitcher({ crews }: { crews: NavCrew[] }) {
  const path = usePathname();
  if (!collapses(crews)) {
    return crews.length === 0 ? null : (
      <ViewLink href={`/dashboard/c/${crews[0].code}`} className="hidden md:block hover:text-alert transition-colors whitespace-nowrap uppercase">
        [{crews[0].name}]
      </ViewLink>
    );
  }
  const current = crews.find((c) => path.startsWith(`/dashboard/c/${c.code}`));
  return (
    <NavMenu
      className="hidden md:block"
      label={
        <>
          [<span className="inline-block max-w-40 truncate align-bottom uppercase">{current ? current.name : "crews"}</span> ▾]
        </>
      }
    >
      {crews.map((c) => (
        <ViewLink
          key={c.id}
          href={`/dashboard/c/${c.code}`}
          className={`px-3 py-2 uppercase truncate hover:text-alert transition-colors ${c === current ? "text-alert" : ""}`}
        >
          [{c.name}]
        </ViewLink>
      ))}
      <Link href="/dashboard/new" className="px-3 py-2 text-faint hover:text-alert transition-colors">[+ CREW]</Link>
    </NavMenu>
  );
}
