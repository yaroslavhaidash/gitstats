import Link from "next/link";
import { after } from "next/server";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { auth } from "@/auth";
import { Hotkeys } from "@/components/Hotkeys";
import { MemberNav } from "@/components/SiteNav";
import { FirstSnapshotWait } from "@/components/FirstSnapshotWait";
import { SyncNotice } from "@/components/SyncNotice";
import { isAdmin } from "@/lib/admin";
import { footerCounts } from "@/lib/cached";
import { crewmates, userCrews } from "@/lib/crews";
import { fmtDateTime } from "@/lib/format";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { claimFirstSnapshot, firstSnapshotRunning, runFirstSnapshot } from "@/lib/snapshot";
import { countStep } from "@/lib/funnel";
import { syncWarnings } from "@/lib/stats";

/** Per request: it reads the session. The stats behind it are cached in lib/cached.ts. */
export const instant = false;

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session) redirect("/");
  const [crews, mates, counts, warnings, first, admin, [me]] = await Promise.all([
    userCrews(session.user.id),
    crewmates(session.user.id),
    footerCounts(),
    syncWarnings(session.user.id),
    claimFirstSnapshot(session.user.id),
    isAdmin(session.user.id),
    db.select({ firstSnapshot: users.firstSnapshot, createdAt: users.createdAt }).from(users).where(eq(users.id, session.user.id)),
  ]);
  // Every first sign-in lands under this layout, so the first page it renders starts the member's
  // first snapshot, once: the claim marks it `running` before the run is scheduled.
  if (first) after(() => Promise.all([countStep("first_dashboard"), runFirstSnapshot(session.user.id)]));
  const homePath = crews[0] ? `/dashboard/c/${crews[0].code}` : "/dashboard";
  return (
    <div className="flex-1 flex flex-col">
      <Hotkeys homePath={homePath} crews={crews} members={mates} />
      <nav className="sticky top-0 z-40 bg-void/90 backdrop-blur-sm border-b-2 border-dark">
        <MemberNav user={session.user} crews={crews} admin={admin} />
      </nav>
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <SyncNotice warnings={warnings} />
        {(first || (me && firstSnapshotRunning(me))) && <FirstSnapshotWait />}
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
