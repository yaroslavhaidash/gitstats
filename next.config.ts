import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [{ protocol: "https", hostname: "avatars.githubusercontent.com" }],
  },
  // /changelog and the blog read docs/ at request time; nothing imports those files, so tracing needs telling.
  outputFileTracingIncludes: {
    "/changelog": ["./docs/CHANGELOG.md"],
    "/": ["./docs/blog/*.md"],
    "/blog": ["./docs/blog/*.md"],
    "/blog/[slug]": ["./docs/blog/*.md"],
    "/blog/feed.xml": ["./docs/blog/*.md"],
  },
  // Boards and user pages are session-gated, so those routes render per request; the stats reads
  // behind them are `use cache: remote` (lib/cached.ts), one cache shared by every instance.
  cacheComponents: true,
};

export default nextConfig;
