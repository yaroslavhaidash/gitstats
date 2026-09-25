import Image from "next/image";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { auth } from "@/auth";
import { CrewSwitcher } from "@/components/CrewSwitcher";
import { Logo } from "@/components/Logo";
import { NavMenu } from "@/components/NavMenu";
import { SignInButton } from "@/components/Tracked";
import { ViewLink } from "@/components/ViewLink";
import { signInWithGitHub, signOutAction } from "@/lib/actions";
import { isAdmin } from "@/lib/admin";
import { userCrews } from "@/lib/crews";
import { collapses } from "@/lib/nav";

type Crew = { id: number; name: string; code: string };
type NavUser = { login: string; image?: string | null };

const BAR = "max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4 sm:gap-6";

/** A member's nav: crews, global, compare, docs, avatar and settings, exit. The dashboard and every public page share it. */
export function MemberNav({ user, crews, admin }: { user: NavUser; crews: Crew[]; admin: boolean }) {
  const homePath = crews[0] ? `/dashboard/c/${crews[0].code}` : "/dashboard";
  return (
    <div className={BAR}>
      <Logo href={homePath} compact />
      <div className="flex items-center gap-4 sm:gap-6 font-mono text-sm min-w-0">
        <NavMenu className="md:hidden" label="[MENU ▾]">
          {crews.map((c) => (
            <ViewLink key={c.id} href={`/dashboard/c/${c.code}`} className="px-3 py-2 uppercase truncate hover:text-alert transition-colors">
              [{c.name}]
            </ViewLink>
          ))}
          <Link href="/vs" className="px-3 py-2 hover:text-alert transition-colors">[COMPARE]</Link>
          <Link href="/dashboard/new" className="px-3 py-2 hover:text-alert transition-colors">[NEW CREW]</Link>
          <Link href="/dashboard/settings" className="px-3 py-2 hover:text-alert transition-colors">[SETTINGS]</Link>
          <Link href="/docs" className="px-3 py-2 hover:text-alert transition-colors">[DOCS]</Link>
          {admin && <Link href="/admin" className="px-3 py-2 hover:text-alert transition-colors">[ADMIN]</Link>}
        </NavMenu>
        <CrewSwitcher crews={crews} />
        <ViewLink href="/dashboard/global" className="hover:text-alert transition-colors">[GLOBAL]</ViewLink>
        <Link href="/vs" className="hidden md:block hover:text-alert transition-colors">[COMPARE]</Link>
        {/* Collapsed, `[+ CREW]` lives in the dropdown with the crews it makes. */}
        {!collapses(crews) && (
          <Link href="/dashboard/new" className="hidden md:block text-faint hover:text-alert transition-colors whitespace-nowrap">[+ CREW]</Link>
        )}
        <Link href="/docs" className="hidden md:block hover:text-alert transition-colors">[DOCS]</Link>
        {admin && <Link href="/admin" className="hidden md:block hover:text-alert transition-colors">[ADMIN]</Link>}
      </div>
      <div className="flex items-center gap-3">
        <Link href="/dashboard/settings" title="settings" className="flex items-center gap-3 hover:text-alert transition-colors">
          {user.image ? (
            <Image src={user.image} alt="" width={28} height={28} className="border border-dark hidden sm:block" unoptimized />
          ) : (
            // next/image throws on an empty src, and plenty of GitHub accounts have no avatar.
            <span className="w-7 h-7 bg-alert text-void font-mono font-bold text-xs hidden sm:grid place-items-center border-2 border-silver">
              {user.login.slice(0, 2)}
            </span>
          )}
          <span className="font-mono text-xs hidden sm:block">{user.login}</span>
          <span className="font-mono text-xs text-faint hidden md:block">[SETTINGS]</span>
        </Link>
        <form action={signOutAction}>
          <button className="font-mono text-xs border border-silver px-3 py-1 hover:bg-silver hover:text-void transition-colors">
            EXIT
          </button>
        </form>
      </div>
    </div>
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
    const [crews, admin] = await Promise.all([userCrews(session.user.id), isAdmin(session.user.id)]);
    return <MemberNav user={session.user} crews={crews} admin={admin} />;
  }
  return (
    <div className={BAR}>
      <Logo />
      <div className="hidden md:flex gap-6 font-mono text-sm">{links}</div>
      <form action={signInWithGitHub}>
        <SignInButton where={where} className="font-mono text-xs border border-silver px-3 py-1 hover:bg-silver hover:text-void transition-colors">
          SIGN_IN
        </SignInButton>
      </form>
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
