import type { ReactNode } from "react";
import Link from "next/link";
import { SiteNav } from "@/components/SiteNav";

/** The same bar `/changelog` uses, shared by the index and every post. */
export default async function BlogLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex-1">
      <SiteNav
        where="blog_nav"
        links={
          <>
            <Link href="/blog" className="hover:text-alert transition-colors">[BLOG]</Link>
            <Link href="/docs" className="hover:text-alert transition-colors">[DOCS]</Link>
            <Link href="/changelog" className="hover:text-alert transition-colors">[CHANGELOG]</Link>
          </>
        }
      />
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-14">{children}</div>
    </main>
  );
}
