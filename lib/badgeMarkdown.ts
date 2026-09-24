import { SITE_URL } from "./site";
import { PRESETS, type Metric, type Preset } from "./window";

/** `?w=week|month|year`; anything else is a rolling year, which never resets to +0 −0. */
export function badgeWindow(w: string | null | undefined): Preset {
  return (PRESETS as readonly string[]).includes(w ?? "") ? (w as Preset) : "year";
}

/** The query a badge option set needs: lines and year are the defaults, so they carry nothing. */
export function badgeQuery(window: Preset, metric: Metric): string {
  const parts = [metric === "lines" ? "" : `m=${metric}`, window === "year" ? "" : `w=${window}`].filter(Boolean);
  return parts.length > 0 ? `?${parts.join("&")}` : "";
}

/** The badge's own path. */
export function badgePath(login: string, window: Preset, metric: Metric = "lines"): string {
  return `/badge/${login}${badgeQuery(window, metric)}`;
}

/** The Markdown a member pastes into their profile README. */
export function badgeMarkdown(login: string, window: Preset = "year", metric: Metric = "lines"): string {
  return `[![gitstats](${SITE_URL}${badgePath(login, window, metric)})](${SITE_URL}/gh/${login})`;
}
