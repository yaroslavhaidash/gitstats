import type { ReactNode } from "react";
import Link from "next/link";
import { auth } from "@/auth";
import { Logo } from "@/components/Logo";

/** The same bar `/changelog` uses, shared by the index and every post. */
export default async function BlogLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  return (
    <main className="flex-1">
      <nav className="sticky top-0 z-40 bg-void/90 backdrop-blur-sm border-b-2 border-dark">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Logo href={session ? "/dashboard" : "/"} />
          <div className="hidden md:flex gap-6 font-mono text-sm">
            <Link href="/blog" className="hover:text-alert transition-colors">[BLOG]</Link>
            <Link href="/docs" className="hover:text-alert transition-colors">[DOCS]</Link>
            <Link href="/changelog" className="hover:text-alert transition-colors">[CHANGELOG]</Link>
          </div>
          <Link href={session ? "/dashboard" : "/"} className="font-mono text-xs border border-silver px-3 py-1 hover:bg-silver hover:text-void transition-colors">
            {session ? "BOARD" : "HOME"}
          </Link>
        </div>
      </nav>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-14">{children}</div>
    </main>
  );
}
