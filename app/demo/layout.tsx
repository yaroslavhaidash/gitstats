import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/Logo";
import { SignInButton } from "@/components/Tracked";
import { signInWithGitHub } from "@/lib/actions";
import { DEMO_BANNER } from "@/lib/demo";

/**
 * The public shell for `/demo`. It deliberately does not reuse the dashboard layout: there is no
 * session here, so there is nothing to sign out of, no crews to list and no settings to open.
 */
export default function DemoLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex-1 flex flex-col">
      <nav className="sticky top-0 z-40 bg-void/90 backdrop-blur-sm border-b-2 border-dark">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <Logo href="/" compact />
          <div className="flex items-center gap-4 sm:gap-6 font-mono text-sm">
            <Link href="/demo" className="hover:text-alert transition-colors">[DEMO]</Link>
            <Link href="/docs" className="hidden sm:block hover:text-alert transition-colors">[DOCS]</Link>
            <form action={signInWithGitHub}>
              <SignInButton where="demo_nav" className="font-mono text-xs border border-silver px-3 py-1 hover:bg-silver hover:text-void transition-colors whitespace-nowrap">
                SIGN_IN
              </SignInButton>
            </form>
          </div>
        </div>
      </nav>
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="border-2 border-alert px-4 py-3 mb-8 font-mono text-xs flex flex-wrap items-center justify-between gap-3">
          <span>&gt; {DEMO_BANNER}</span>
          <form action={signInWithGitHub}>
            <SignInButton where="demo_banner" className="font-bold hover:text-alert transition-colors cursor-pointer">SIGN IN WITH GITHUB →</SignInButton>
          </form>
        </div>
        {children}
      </main>
      <footer className="border-t-2 border-dark">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 font-mono text-xs text-faint flex flex-wrap gap-x-6 gap-y-1">
          <span>&gt; every number on this page is generated · no real person is on this board</span>
          <Link href="/" className="hover:text-alert">home</Link>
          <Link href="/docs" className="hover:text-alert">docs</Link>
          <Link href="/privacy" className="hover:text-alert">privacy</Link>
        </div>
      </footer>
    </div>
  );
}
