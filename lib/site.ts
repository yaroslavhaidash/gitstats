import type { Metadata } from "next";

/** One source for the canonical origin and the sentence every page's metadata starts from. */
export const SITE_URL = "https://gitstats.org";

export const SITE_NAME = "gitstats";

export const SITE_DESCRIPTION =
  "Git stats for friends: a GitHub commit leaderboard for your crew. Commits, lines of code per day, streaks and stars — private repo commits counted without a token.";

/**
 * A page's `openGraph` replaces the layout's rather than merging into it, so every page that sets
 * its own URL restates the three fields that are the same everywhere. Title and description are
 * left out on purpose: Next fills them from the page's own `title`/`description`.
 */
export function openGraphFor(path: string): Metadata["openGraph"] {
  return { type: "website", siteName: SITE_NAME, locale: "en_US", url: path };
}
