import Image from "next/image";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { auth } from "@/auth";
import { CliBanner } from "@/components/CliBanner";
import { CrewSwitcher } from "@/components/CrewSwitcher";
import { Logo } from "@/components/Logo";
import { NavMenu } from "@/components/NavMenu";
import { NavSheet, SheetLabel, SheetLink, SheetLinks } from "@/components/NavSheet";
import { NoteOverlay, NoteStrip, UnreadOnly } from "@/components/NoteOverlay";
import { SignInButton } from "@/components/Tracked";
import { ViewLink } from "@/components/ViewLink";
import { signInWithGitHub, signOutAction } from "@/lib/actions";
import { isAdmin } from "@/lib/admin";
import { userCrews } from "@/lib/crews";
import { MESSAGE_MAX, unreadNotes, type Note } from "@/lib/messages";
import { collapses } from "@/lib/nav";
import { hasLinkedMachine } from "@/lib/stats";

type Crew = { id: number; name: string; code: string };
type NavUser = { login: string; image?: string | null };

const BAR = "max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4 sm:gap-6";

function Avatar({ user }: { user: NavUser }) {
  return user.image ? (
    <Image src={user.image} alt="" width={28} height={28} className="border border-dark shrink-0" unoptimized />
  ) : (
    // next/image throws on an empty src, and plenty of GitHub accounts have no avatar.
    <span className="w-7 h-7 shrink-0 bg-alert text-void font-mono font-bold text-xs grid place-items-center border-2 border-silver">{user.login.slice(0, 2)}</span>
  );
}

/**
 * A member's nav, the dashboard's and every public page's. From 1024px it is one row: crews, global,
 * compare, inbox, docs, admin, and an account menu (your page, settings, exit) that keeps the row short
 * enough for a long login and a long crew name. Narrower, it is the logo, the inbox with its dot and
 * `[MENU]`, which opens the full-height sheet holding everything. Under it: the strip and the overlay
 * for unread notes from the maintainer, and the link-your-computer banner until a machine is linked.
 */
export function MemberNav({ user, crews, admin, linked, notes }: { user: NavUser; crews: Crew[]; admin: boolean; linked: boolean; notes: Note[] }) {
  const newest = notes.at(-1)?.id;
  const dot = newest !== undefined && (
    <UnreadOnly key={newest}>
      <span aria-label="unread" className="inline-block w-2 h-2 bg-alert ml-1 align-middle" />
    </UnreadOnly>
  );
  const homePath = crews[0] ? `/dashboard/c/${crews[0].code}` : "/dashboard";
  return (
    <>
      <div className={BAR}>
        <Logo href={homePath} compact />
        <div className="hidden lg:flex items-center gap-5 xl:gap-6 font-mono text-sm min-w-0">
          <CrewSwitcher crews={crews} />
          <ViewLink href="/dashboard/global" className="hover:text-alert transition-colors">[GLOBAL]</ViewLink>
          <Link href="/vs" className="hover:text-alert transition-colors">[COMPARE]</Link>
          {/* Collapsed, `[+ CREW]` lives in the dropdown with the crews it makes. */}
          {!collapses(crews) && (
            <Link href="/dashboard/new" className="text-faint hover:text-alert transition-colors whitespace-nowrap">[+ CREW]</Link>
          )}
          <Link href="/dashboard/inbox" className="hover:text-alert transition-colors whitespace-nowrap">[INBOX]{dot}</Link>
          <Link href="/docs" className="hover:text-alert transition-colors">[DOCS]</Link>
          {admin && <Link href="/admin" className="hover:text-alert transition-colors">[ADMIN]</Link>}
        </div>
        <div className="flex items-center gap-2 sm:gap-3 font-mono text-sm">
          <Link href="/dashboard/inbox" className="lg:hidden h-11 px-2 flex items-center hover:text-alert transition-colors whitespace-nowrap">
            [INBOX]{dot}
          </Link>
          <NavSheet
            className="lg:hidden"
            title={
              <>
                <Avatar user={user} />
                <span className="truncate">{user.login}</span>
              </>
            }
          >
            <SheetLabel>crews</SheetLabel>
            {crews.map((c) => (
              <SheetLink key={c.id} href={`/dashboard/c/${c.code}`} view>
                <span className="truncate">[{c.name}]</span>
              </SheetLink>
            ))}
            <SheetLink href="/dashboard/new">
              <span className="text-faint">[+ NEW CREW]</span>
            </SheetLink>
            <SheetLabel>go</SheetLabel>
            <SheetLink href="/dashboard/global" view>[GLOBAL]</SheetLink>
            <SheetLink href="/vs">[COMPARE]</SheetLink>
            <SheetLink href="/dashboard/inbox">[INBOX]{dot}</SheetLink>
            <SheetLink href={`/dashboard/u/${user.login}`} view>[YOUR PAGE]</SheetLink>
            <SheetLink href="/dashboard/settings">[SETTINGS]</SheetLink>
            <SheetLink href="/docs">[DOCS]</SheetLink>
            {admin && <SheetLink href="/admin">[ADMIN]</SheetLink>}
            <div className="mt-auto p-4 border-t-2 border-dark">
              <form action={signOutAction}>
                <button className="btn-ghost w-full cursor-pointer">EXIT</button>
              </form>
            </div>
          </NavSheet>
          <NavMenu
            right
            className="hidden lg:block"
            label={
              <span className="flex items-center gap-2 h-11">
                <Avatar user={user} />
                <span className="hidden xl:inline text-xs max-w-40 truncate">{user.login}</span>
                <span className="text-xs">▾</span>
              </span>
            }
          >
            <ViewLink href={`/dashboard/u/${user.login}`} className="px-3 py-2.5 hover:text-alert transition-colors">[YOUR PAGE]</ViewLink>
            <Link href="/dashboard/settings" className="px-3 py-2.5 hover:text-alert transition-colors">[SETTINGS]</Link>
            <form action={signOutAction}>
              <button className="w-full text-left px-3 py-2.5 hover:text-alert transition-colors cursor-pointer">[EXIT]</button>
            </form>
          </NavMenu>
        </div>
      </div>
      {newest !== undefined && (
        <UnreadOnly key={newest}>
          <NoteStrip count={notes.length} />
          {notes.some((n) => !n.seenAt) && <NoteOverlay notes={notes} max={MESSAGE_MAX} />}
        </UnreadOnly>
      )}
      {!linked && <CliBanner />}
    </>
  );
}

const DEFAULT_LINKS = (
  <>
    <Link href="/demo" className="hover:text-alert transition-colors">[DEMO]</Link>
    <Link href="/docs" className="hover:text-alert transition-colors">[DOCS]</Link>
  </>
);

/** The only part of a public page that reads the session, so everything around it stays cacheable. */
async function SessionBar({ where, links }: { where: string; links: ReactNode }) {
  const session = await auth();
  if (session) {
    const [crews, admin, linked, notes] = await Promise.all([userCrews(session.user.id), isAdmin(session.user.id), hasLinkedMachine(session.user.id), unreadNotes(session.user.id)]);
    return <MemberNav user={session.user} crews={crews} admin={admin} linked={linked} notes={notes} />;
  }
  return (
    <div className={BAR}>
      <Logo />
      <div className="hidden md:flex gap-6 font-mono text-sm">{links}</div>
      <div className="flex items-center gap-2">
        <form action={signInWithGitHub}>
          <SignInButton where={where} className="h-11 md:h-auto font-mono text-xs border border-silver px-3 md:py-1 hover:bg-silver hover:text-void transition-colors">
            SIGN_IN
          </SignInButton>
        </form>
        {/* Below 768px the page's own links would otherwise have nowhere to go. */}
        <NavSheet className="md:hidden">
          <SheetLinks>{links}</SheetLinks>
          <form action={signInWithGitHub} className="mt-auto p-4 border-t-2 border-dark">
            <SignInButton where={`${where}_menu`} className="btn-brutal w-full cursor-pointer">
              SIGN IN WITH GITHUB
            </SignInButton>
          </form>
        </NavSheet>
      </div>
    </div>
  );
}

/**
 * The top bar of every public page. `links` are the page's own links for a signed-out visitor; a
 * member gets the dashboard nav instead. While the session resolves only the logo shows, so a member
 * never sees a SIGN_IN flash.
 */
export function SiteNav({ where, links = DEFAULT_LINKS }: { where: string; links?: ReactNode }) {
  return (
    <nav className="sticky top-0 z-40 bg-void/90 backdrop-blur-sm border-b-2 border-dark">
      <Suspense fallback={<div className={BAR}><Logo /></div>}>
        <SessionBar where={where} links={links} />
      </Suspense>
    </nav>
  );
}

/** Renders its children only for a signed-out visitor: sign-in calls to action on public pages. */
async function SignedOutGate({ children }: { children: ReactNode }) {
  return (await auth()) ? null : children;
}

export function SignedOut({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={null}>
      <SignedOutGate>{children}</SignedOutGate>
    </Suspense>
  );
}
