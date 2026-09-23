import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FEED_ALTERNATE, post, stamp } from "@/lib/blog";
import { openGraphFor } from "@/lib/site";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = post((await params).slug);
  if (!p) return {};
  return {
    title: p.title,
    description: p.description,
    alternates: { canonical: `/blog/${p.slug}`, types: FEED_ALTERNATE },
    openGraph: { ...openGraphFor(`/blog/${p.slug}`), type: "article", publishedTime: p.date },
  };
}

export default async function BlogPost({ params }: Props) {
  const p = post((await params).slug);
  if (!p) notFound();
  return (
    <article>
      <Link href="/blog" className="font-mono text-xs text-faint hover:text-alert transition-colors">← BLOG</Link>
      <div className="font-mono text-xs text-faint mt-8 mb-3">{stamp(p.date)}</div>
      <h1 className="font-sans font-bold text-4xl mb-10">{p.title}</h1>
      {/* The post's own Markdown, rendered from a file in this repo. */}
      <div className="post" dangerouslySetInnerHTML={{ __html: p.html }} />
    </article>
  );
}
