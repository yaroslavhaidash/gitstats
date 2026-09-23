import { posts } from "@/lib/blog";
import { SITE_URL } from "@/lib/site";

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Posts carry a date, not a time; noon UTC keeps the day the same in every reader's zone. */
const rfc3339 = (date: string) => `${date}T12:00:00Z`;

/**
 * Atom 1.0 with every post's full rendered HTML, newest first. Aggregators that rank on content
 * can only rank what they can read, so there is no excerpt. 404 while there are no posts, like
 * `/blog` itself.
 */
export function GET() {
  const all = posts();
  if (all.length === 0) return new Response("Not found", { status: 404 });
  const entries = all.map((p) => {
    const url = `${SITE_URL}/blog/${p.slug}`;
    return `  <entry>
    <id>${url}</id>
    <title>${escape(p.title)}</title>
    <updated>${rfc3339(p.date)}</updated>
    <published>${rfc3339(p.date)}</published>
    <link rel="alternate" type="text/html" href="${url}"/>
    <summary>${escape(p.description)}</summary>
    <content type="html">${escape(p.html)}</content>
  </entry>`;
  });
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <id>${SITE_URL}/blog</id>
  <title>gitstats blog</title>
  <subtitle>Notes from building gitstats.</subtitle>
  <updated>${rfc3339(all[0].date)}</updated>
  <author><name>gitstats</name><uri>${SITE_URL}</uri></author>
  <link rel="self" type="application/atom+xml" href="${SITE_URL}/blog/feed.xml"/>
  <link rel="alternate" type="text/html" href="${SITE_URL}/blog"/>
${entries.join("\n")}
</feed>
`;
  return new Response(xml, { headers: { "Content-Type": "application/atom+xml; charset=utf-8", "Cache-Control": "public, max-age=3600, s-maxage=3600" } });
}
