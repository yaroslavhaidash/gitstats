import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FEED_ALTERNATE, posts, stamp } from "@/lib/blog";
import { openGraphFor } from "@/lib/site";

export const metadata: Metadata = {
  title: "Blog",
  description: "Notes from building gitstats: how private repos get counted, what GitHub will and will not tell you, and what the numbers mean.",
  alternates: { canonical: "/blog", types: FEED_ALTERNATE },
  openGraph: openGraphFor("/blog"),
};

export default function Blog() {
  const all = posts();
  // No empty page ships: until the first post exists, /blog is a 404 like any other unknown path.
  if (all.length === 0) notFound();
  return (
    <>
      <div className="tag mb-4">BLOG</div>
      <h1 className="font-sans font-bold text-4xl mb-3">Notes from building gitstats.</h1>
      <p className="font-mono text-sm text-dim leading-relaxed mb-12">
        Newest first. Also as a feed: <a href="/blog/feed.xml" className="text-silver underline hover:text-alert">/blog/feed.xml</a>
      </p>
      <ul className="flex flex-col gap-8">
        {all.map((p) => (
          <li key={p.slug} className="border-l-2 border-alert pl-5">
            <div className="font-mono text-xs text-faint mb-1">{stamp(p.date)}</div>
            <h2 className="font-sans font-bold text-xl mb-1">
              <Link href={`/blog/${p.slug}`} className="hover:text-alert transition-colors">{p.title}</Link>
            </h2>
            <p className="font-mono text-xs text-dim leading-relaxed">{p.description}</p>
          </li>
        ))}
      </ul>
    </>
  );
}
