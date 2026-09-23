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
  // Boards and user pages are session-gated, so the whole route can never be prerendered; the
  // `use cache` directive lets the Postgres reads behind them be cached and tagged anyway.
  experimental: { useCache: true },
};

export default nextConfig;
