import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/demo", "/docs", "/privacy", "/changelog", "/join/", "/gh/", "/blog", "/blog/feed.xml"],
      // Everything behind a sign-in, plus the API. None of it renders for a crawler anyway.
      disallow: ["/dashboard", "/admin", "/api", "/link"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
