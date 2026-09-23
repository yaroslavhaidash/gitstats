import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { marked } from "marked";

export type BlogPost = { slug: string; title: string; date: string; description: string; html: string };

const DIR = join(process.cwd(), "docs", "blog");
const FRONTMATTER = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** `key: value` lines; a value may be wrapped in quotes so it can hold a colon. */
function fields(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of block.split("\n")) {
    const i = line.indexOf(":");
    if (i < 1) continue;
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^(["'])(.*)\1$/, "$2");
  }
  return out;
}

/**
 * `docs/blog/*.md`, newest first, each with frontmatter `title`, `date`, `description` and `slug`.
 * Mirrors `lib/changelog.ts`: the repo is the CMS. A file missing a field is skipped rather than
 * half-published.
 */
export function posts(): BlogPost[] {
  if (!existsSync(DIR)) return [];
  const out: BlogPost[] = [];
  for (const file of readdirSync(DIR)) {
    if (!file.endsWith(".md")) continue;
    const match = FRONTMATTER.exec(readFileSync(join(DIR, file), "utf8").replace(/\r\n/g, "\n"));
    if (!match) continue;
    const { title, date, description, slug } = fields(match[1]);
    if (!title || !description || !DATE.test(date ?? "") || !SLUG.test(slug ?? "")) continue;
    // Posts are written by hand in this repo, so their markup is trusted as it stands.
    out.push({ slug, title, date, description, html: marked.parse(match[2], { async: false }) });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));
}

export function post(slug: string): BlogPost | null {
  return posts().find((p) => p.slug === slug) ?? null;
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/** `2026-09-22` → `22 SEP 2026`, the changelog's date style. */
export function stamp(date: string): string {
  const [y, m, d] = date.split("-");
  return `${d} ${MONTHS[Number(m) - 1]} ${y}`;
}

/** Autodiscovery for feed readers: every blog page declares the feed in its `<head>`. */
export const FEED_ALTERNATE = { "application/atom+xml": [{ url: "/blog/feed.xml", title: "gitstats blog" }] };
