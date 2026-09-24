import type { ReactNode } from "react";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { SignInButton } from "@/components/Tracked";
import { signInWithGitHub } from "@/lib/actions";

/** The signed-out frame of the public handle pages, `/gh/<login>` and `/vs/<a>/<b>`. */
export function PublicShell({ children, where }: { children: ReactNode; where: string }) {
  return (
    <main className="flex-1">
      <nav className="sticky top-0 z-40 bg-void/90 backdrop-blur-sm border-b-2 border-dark">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Logo />
          <div className="hidden md:flex gap-6 font-mono text-sm">
            <Link href="/demo" className="hover:text-alert transition-colors">[DEMO]</Link>
            <Link href="/docs" className="hover:text-alert transition-colors">[DOCS]</Link>
          </div>
          <form action={signInWithGitHub}>
            <SignInButton where={where} className="font-mono text-xs border border-silver px-3 py-1 hover:bg-silver hover:text-void transition-colors">
              SIGN_IN
            </SignInButton>
          </form>
        </div>
      </nav>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">{children}</div>
    </main>
  );
}
