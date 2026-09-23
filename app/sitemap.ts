import type { MetadataRoute } from "next";
import { posts } from "@/lib/blog";
import { changelog } from "@/lib/changelog";
import { DEMO_LOGINS } from "@/lib/demo";
import { SITE_URL } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  // The newest changelog entry is the last time anything on the public pages actually changed.
  const [newest] = changelog();
  const lastModified = new Date(`${newest.date}T00:00:00Z`);
  // The feed is for readers, not crawlers, so it is left out; the blog is listed only once it has posts.
  const blog = posts();
  // The demo board is the only public page whose numbers move on their own, hence `daily`.
  return [
    { url: SITE_URL, lastModified, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/demo`, lastModified, changeFrequency: "daily", priority: 0.9 },
    ...DEMO_LOGINS.map((login) => ({ url: `${SITE_URL}/demo/u/${login}`, lastModified, changeFrequency: "daily" as const, priority: 0.5 })),
    { url: `${SITE_URL}/docs`, lastModified, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/changelog`, lastModified, changeFrequency: "weekly", priority: 0.6 },
    { url: `${SITE_URL}/privacy`, lastModified, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/widget`, lastModified, changeFrequency: "monthly", priority: 0.7 },
    ...(blog.length > 0 ? [{ url: `${SITE_URL}/blog`, lastModified: new Date(`${blog[0].date}T00:00:00Z`), changeFrequency: "weekly" as const, priority: 0.6 }] : []),
    ...blog.map((p) => ({ url: `${SITE_URL}/blog/${p.slug}`, lastModified: new Date(`${p.date}T00:00:00Z`), changeFrequency: "yearly" as const, priority: 0.5 })),
  ];
}
