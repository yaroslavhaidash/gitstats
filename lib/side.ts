import { REPLY_STEPS, type HeatScale } from "./palette";

/**
 * gitstats and claudestats are two sides of one site. A path says which side it is on, and every
 * page that has a twin on the other side maps to it here, so the logo switch, the `s` key and the
 * palette always agree on where "the same page over there" is.
 */

export type Side = "git" | "claude";

export function sideOf(pathname: string): Side {
  return /^\/(dashboard\/claude|demo\/claude|claude)(\/|$)/.test(pathname) ? "claude" : "git";
}

/** Each side's twin pages, as gitstats prefix → claudestats prefix. The rest of the path carries over. */
const TWINS: [git: RegExp, claude: RegExp, toClaude: (m: RegExpExecArray) => string, toGit: (m: RegExpExecArray) => string][] = [
  [/^\/dashboard\/(c|u)\/([^/]+)$/, /^\/dashboard\/claude\/(c|u)\/([^/]+)$/, (m) => `/dashboard/claude/${m[1]}/${m[2]}`, (m) => `/dashboard/${m[1]}/${m[2]}`],
  [/^\/dashboard\/global$/, /^\/dashboard\/claude\/global$/, () => "/dashboard/claude/global", () => "/dashboard/global"],
  [/^\/demo\/u\/([^/]+)$/, /^\/demo\/claude\/u\/([^/]+)$/, (m) => `/demo/claude/u/${m[1]}`, (m) => `/demo/u/${m[1]}`],
  [/^\/demo$/, /^\/demo\/claude$/, () => "/demo/claude", () => "/demo"],
  [/^\/$/, /^\/claude$/, () => "/claude", () => "/"],
];

/** Where each side starts for a member: the dashboard index, which sends them to their first crew. */
export const SIDE_HOME: Record<Side, string> = { git: "/dashboard", claude: "/dashboard/claude" };

/** The window keys a switch keeps. The metric is dropped: each side opens on its own default. */
const WINDOW_KEYS = ["w", "from", "to"] as const;

type Params = { get(key: string): string | null };

/**
 * The same page on the other side, with the reader's window: a crew board, a member, the global
 * board, the demo and the landing have twins; any other page goes to the other side's home.
 */
export function counterpart(pathname: string, search: Params | string = ""): string {
  const params: Params = typeof search === "string" ? new URLSearchParams(search) : search;
  const kept = new URLSearchParams();
  for (const key of WINDOW_KEYS) {
    const value = params.get(key);
    if (value) kept.set(key, value);
  }
  const query = kept.toString();
  const path = pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname;
  const toClaude = sideOf(path) === "git";
  let target = toClaude ? SIDE_HOME.claude : SIDE_HOME.git;
  for (const [git, claude, intoClaude, intoGit] of TWINS) {
    const m = (toClaude ? git : claude).exec(path);
    if (m) {
      target = toClaude ? intoClaude(m) : intoGit(m);
      break;
    }
  }
  return query ? `${target}?${query}` : target;
}

/**
 * A link written as a gitstats path, as it reads on `side`: on claudestats a page with a twin (a
 * crew, a member, the global board, the demo, the landing, the dashboard index) goes to the twin with
 * its query kept. Shared pages (settings, inbox, docs, compare, new crew, admin) and anything already
 * on the claude side are unchanged, so every nav link can go through this without a list of its own.
 */
export function onSide(href: string, side: Side): string {
  if (side === "git") return href;
  const cut = href.search(/[?#]/);
  const path = cut < 0 ? href : href.slice(0, cut);
  const rest = cut < 0 ? "" : href.slice(cut);
  if (path === SIDE_HOME.git) return SIDE_HOME.claude + rest;
  for (const [git, , intoClaude] of TWINS) {
    const m = git.exec(path);
    if (m) return intoClaude(m) + rest;
  }
  return href;
}

/**
 * The claudestats theme colour, with the candidates the admin flips between on production before
 * one is locked (each clears 4.5:1 on the void both ways). Each holds what the side needs that CSS cannot derive from the colour alone: the heat
 * ramp (validated as an ordinal ramp against the void, light end above 2:1), the own-row tint (the
 * accent at 8.5% over the void, the same mix `#1a0909` is of alert red) and the model colours it
 * replaces when one sits within reach of the accent's hue. The brutal shadows read `--color-alert`
 * directly, so they follow without an entry.
 */
export const ACCENTS = {
  violet: { label: "violet", accent: "#a66cff", heat: ["#222222", "#4d3e6b", "#7258a1", "#9a74db", "#bd8bff"], own: "#130e1a", models: {} },
  green: { label: "green", accent: "#c6f24a", heat: ["#222222", "#404e1c", "#5d731b", "#7b9a12", "#b7e139"], own: "#15190b", models: {} },
  yellow: { label: "yellow", accent: "#f2f24f", heat: ["#222222", "#4b4b1b", "#6e6d19", "#93920d", "#e7e64b"], own: "#19190b", models: {} },
  // Opus blue is 21° from this accent, so Opus takes the palette violet instead.
  blue: { label: "blue", accent: "#4cc3ff", heat: ["#222222", "#294d5f", "#35708f", "#4096c1", "#59cbff"], own: "#0b151a", models: { opus: "#9085e9" } },
  // Fable pink is 23° from this accent, so Fable takes the palette violet.
  magenta: { label: "magenta", accent: "#ff4fd8", heat: ["#222222", "#623055", "#933e7e", "#ca4fad", "#ff61df"], own: "#1a0b17", models: { fable: "#9085e9" } },
  // Sonnet green is 15° from this accent: Sonnet takes Fable's pink and Fable the palette violet.
  teal: { label: "teal", accent: "#2ee6c8", heat: ["#222222", "#234e45", "#227263", "#1a9b86", "#4fefd2"], own: "#081816", models: { sonnet: "#d55181", fable: "#9085e9" } },
  // Haiku amber is 9° from this accent, so Haiku takes the palette violet.
  orange: { label: "orange", accent: "#ffa94d", heat: ["#222222", "#583f27", "#83592e", "#b37737", "#ffb45f"], own: "#1a130b", models: { haiku: "#9085e9" } },
  // Opus blue is 25° from this accent, so Opus takes the commits orange (no commits on this side).
  indigo: { label: "indigo", accent: "#7c7cff", heat: ["#222222", "#3e4168", "#585b9d", "#767ad9", "#9799ff"], own: "#0f0f1a", models: { opus: "#d95926" } },
} as const satisfies Record<string, { label: string; accent: string; heat: readonly string[]; own: string; models: Record<string, string> }>;

export type AccentName = keyof typeof ACCENTS;
export const DEFAULT_ACCENT: AccentName = "violet";
export const ACCENT_NAMES = Object.keys(ACCENTS) as AccentName[];

export function isAccent(value: unknown): value is AccentName {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(ACCENTS, value);
}

/** The heat ramp as CSS variables, so a cell follows whichever accent the frame carries. */
export const CLAUDE_HEAT = [0, 1, 2, 3, 4].map((i) => `var(--heat-${i})`);

/**
 * The claudestats frame's variables, one rule for the default and one per candidate, all from
 * `ACCENTS`. `models` are the default model colours by family; an accent's own entries override them.
 */
export function accentCss(models: Record<string, string>): string {
  const rule = (selector: string, a: (typeof ACCENTS)[AccentName]) => {
    const vars = [
      `--color-alert:${a.accent}`,
      `--color-own:${a.own}`,
      `--claude-accent:${a.accent}`,
      ...a.heat.map((c, i) => `--heat-${i}:${c}`),
      ...Object.entries({ ...models, ...a.models }).map(([family, c]) => `--model-${family}:${c}`),
    ];
    return `${selector}{${vars.join(";")}}`;
  };
  return [
    rule(`[data-side="claude"]`, ACCENTS[DEFAULT_ACCENT]),
    ...ACCENT_NAMES.filter((n) => n !== DEFAULT_ACCENT).map((n) => rule(`[data-side="claude"][data-accent="${n}"]`, ACCENTS[n])),
  ].join("\n");
}

/** The claudestats day grids: replies per day on the accent's ramp. */
export const CLAUDE_HEAT_SCALE: HeatScale = { ramp: CLAUDE_HEAT, steps: REPLY_STEPS, unit: ["reply", "replies"] };
