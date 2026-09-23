import Image from "next/image";
import Link from "next/link";
import { after } from "next/server";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { auth } from "@/auth";
import { Hotkeys } from "@/components/Hotkeys";
import { CrewSwitcher } from "@/components/CrewSwitcher";
import { Logo } from "@/components/Logo";
import { NavMenu } from "@/components/NavMenu";
import { SyncNotice } from "@/components/SyncNotice";
import { ViewLink } from "@/components/ViewLink";
import { signOutAction } from "@/lib/actions";
import { isAdmin } from "@/lib/admin";
import { footerCounts } from "@/lib/cached";
import { crewmates, userCrews } from "@/lib/crews";
import { fmtDateTime } from "@/lib/format";
import { collapses } from "@/lib/nav";
import { claimFirstSnapshot, runFirstSnapshot } from "@/lib/snapshot";
import { countStep } from "@/lib/funnel";
import { syncWarnings } from "@/lib/stats";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session) redirect("/");
  const [crews, mates, counts, warnings, first, admin] = await Promise.all([
    userCrews(session.user.id),
    crewmates(session.user.id),
    footerCounts(),
    syncWarnings(session.user.id),
    claimFirstSnapshot(session.user.id),
    isAdmin(session.user.id),
  ]);
  // Every first sign-in lands under this layout, so the first page it renders starts the member's
  // first snapshot, once: the claim flips `last_snapshot_at` before the run is scheduled.
  if (first) after(() => Promise.all([countStep("first_dashboard"), runFirstSnapshot(session.user.id)]));
  const homePath = crews[0] ? `/dashboard/c/${crews[0].code}` : "/dashboard";
  return (
    <div className="flex-1 flex flex-col">
      <Hotkeys homePath={homePath} crews={crews} members={mates} />
      <nav className="sticky top-0 z-40 bg-void/90 backdrop-blur-sm border-b-2 border-dark">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4 sm:gap-6">
          <Logo href={homePath} compact />
          <div className="flex items-center gap-4 sm:gap-6 font-mono text-sm min-w-0">
            <NavMenu className="md:hidden" label="[MENU ▾]">
              {crews.map((c) => (
                <ViewLink key={c.id} href={`/dashboard/c/${c.code}`} className="px-3 py-2 uppercase truncate hover:text-alert transition-colors">
                  [{c.name}]
                </ViewLink>
              ))}
              <Link href="/dashboard/new" className="px-3 py-2 hover:text-alert transition-colors">[NEW CREW]</Link>
              <Link href="/dashboard/settings" className="px-3 py-2 hover:text-alert transition-colors">[SETTINGS]</Link>
              <Link href="/docs" className="px-3 py-2 hover:text-alert transition-colors">[DOCS]</Link>
              {admin && <Link href="/admin" className="px-3 py-2 hover:text-alert transition-colors">[ADMIN]</Link>}
            </NavMenu>
            <CrewSwitcher crews={crews} />
            <ViewLink href="/dashboard/global" className="hover:text-alert transition-colors">[GLOBAL]</ViewLink>
            {/* Collapsed, `[+ CREW]` lives in the dropdown with the crews it makes. */}
            {!collapses(crews) && (
              <Link href="/dashboard/new" className="hidden md:block text-faint hover:text-alert transition-colors whitespace-nowrap">[+ CREW]</Link>
            )}
            <Link href="/docs" className="hidden md:block hover:text-alert transition-colors">[DOCS]</Link>
            {admin && <Link href="/admin" className="hidden md:block hover:text-alert transition-colors">[ADMIN]</Link>}
          </div>
          <div className="flex items-center gap-3">
            <Link href="/dashboard/settings" title="settings" className="flex items-center gap-3 hover:text-alert transition-colors">
              {session.user.image ? (
                <Image src={session.user.image} alt="" width={28} height={28} className="border border-dark hidden sm:block" unoptimized />
              ) : (
                // next/image throws on an empty src, and plenty of GitHub accounts have no avatar.
                <span className="w-7 h-7 bg-alert text-void font-mono font-bold text-xs hidden sm:grid place-items-center border-2 border-silver">
                  {session.user.login.slice(0, 2)}
                </span>
              )}
              <span className="font-mono text-xs hidden sm:block">{session.user.login}</span>
              <span className="font-mono text-xs text-faint hidden md:block">[SETTINGS]</span>
            </Link>
            <form action={signOutAction}>
              <button className="font-mono text-xs border border-silver px-3 py-1 hover:bg-silver hover:text-void transition-colors">
                EXIT
              </button>
            </form>
          </div>
        </div>
      </nav>
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <SyncNotice warnings={warnings} />
        {children}
      </main>
      <footer className="border-t-2 border-dark">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 font-mono text-xs text-faint flex flex-wrap gap-x-6 gap-y-1">
          <span>
            &gt; {counts.members} {counts.members === 1 ? "member" : "members"} · {counts.repos} repos tracked
          </span>
          <span>&gt; last snapshot: {counts.lastSnapshotAt ? fmtDateTime(counts.lastSnapshotAt) : "never"}</span>
          <Link href="/docs" className="hover:text-alert">docs</Link>
          <span className="ml-auto hidden sm:inline">keys: / palette · 1/2/3 window · g global · h home</span>
        </div>
      </footer>
    </div>
  );
}
