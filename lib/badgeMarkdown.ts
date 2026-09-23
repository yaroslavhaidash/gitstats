import { SITE_URL } from "./site";
import { PRESETS, type Preset } from "./window";

/** `?w=week|month|year`; anything else is a rolling year, which never resets to +0 −0. */
export function badgeWindow(w: string | null | undefined): Preset {
  return (PRESETS as readonly string[]).includes(w ?? "") ? (w as Preset) : "year";
}

/** The badge's own path; year is the default, so it carries no query. */
export function badgePath(login: string, window: Preset): string {
  return `/badge/${login}${window === "year" ? "" : `?w=${window}`}`;
}

/** The Markdown a member pastes into their profile README. */
export function badgeMarkdown(login: string, window: Preset = "year"): string {
  return `[![gitstats](${SITE_URL}${badgePath(login, window)})](${SITE_URL}/gh/${login})`;
}
