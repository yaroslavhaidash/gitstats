import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { demoMembers } from "./demo";
import { fmt } from "./format";
import { boardRows } from "./stats";
import type { Preset } from "./window";

/**
 * The profile README badge. It reads Postgres like every page and shows what a stranger opening the
 * member's page would see over the chosen window — the `global` column of the visibility matrix — or nothing at
 * all when that page is not open to everyone.
 */

export type BadgeStats = { login: string; window: Preset; additions: number; deletions: number; streak: number; topLanguage: string | null };

export async function badgeStats(login: string, window: Preset): Promise<BadgeStats | null> {
  const [user] = await db
    .select({ id: users.id, login: users.githubLogin, visibility: users.profileVisibility })
    .from(users)
    .where(and(sql`lower(${users.githubLogin}) = ${login.toLowerCase()}`, eq(users.isDemo, false)))
    .limit(1);
  if (!user || user.visibility !== "everyone") return null;
  return windowStats(user.id, user.login, window);
}

/** The first demo member's numbers, drawn inline on /widget. `/badge/<login>` never serves a demo
 *  member: the seeded logins may belong to real GitHub accounts, and the badge links to theirs. */
export async function demoBadgeStats(window: Preset): Promise<BadgeStats | null> {
  const [first] = await demoMembers();
  return first ? windowStats(first.id, first.login, window) : null;
}

async function windowStats(id: number, login: string, window: Preset): Promise<BadgeStats | null> {
  const [row] = await boardRows([id], { kind: "preset", value: window }, "global");
  if (!row) return null;
  return { login, window, additions: row.additions, deletions: row.deletions, streak: row.streak, topLanguage: row.topLanguage };
}

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// A README image cannot load web fonts, so JetBrains Mono is asked for first and the system mono
// stack catches every reader who does not have it installed.
const MONO = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
const W = 420;
const H = 120;

function frame(label: string, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${escape(label)}">
<title>${escape(label)}</title>
<rect x="1" y="1" width="${W - 2}" height="${H - 2}" fill="#050505" stroke="#1a1a1a" stroke-width="2"/>
<rect x="18" y="18" width="30" height="30" fill="#ff3333" stroke="#e0e2e5" stroke-width="2"/>
<text x="33" y="38" text-anchor="middle" font-family="${MONO}" font-size="13" font-weight="700" fill="#050505">gs</text>
${body}
</svg>`;
}

/** Neutral badge: a non-member, or a member whose page is not open to everyone. No numbers. */
export function neutralBadge(): string {
  return frame(
    "gitstats",
    `<text x="60" y="38" font-family="${MONO}" font-size="16" font-weight="700" fill="#e0e2e5">git<tspan fill="#ff3333">stats</tspan></text>
<text x="18" y="84" font-family="${MONO}" font-size="13" fill="#8b93a4">git stats for friends</text>
<text x="18" y="104" font-family="${MONO}" font-size="12" fill="#8b93a4">gitstats.org</text>`,
  );
}

export function statsBadge(s: BadgeStats): string {
  const add = `+${fmt(s.additions)}`;
  const del = `−${fmt(s.deletions)}`;
  const label = `${s.login} on gitstats: ${add} ${del} lines this ${s.window}, ${s.streak} day streak${s.topLanguage ? `, top language ${s.topLanguage}` : ""}`;
  // Mono glyphs are 0.6em wide, so the deletions start right after the additions whatever their length.
  const delX = 18 + (add.length + 1) * 0.6 * 22;
  return frame(
    label,
    `<text x="60" y="38" font-family="${MONO}" font-size="16" font-weight="700" fill="#e0e2e5">${escape(s.login)}</text>
<text x="${W - 18}" y="38" text-anchor="end" font-family="${MONO}" font-size="11" fill="#8b93a4">gitstats.org</text>
<text x="18" y="84" font-family="${MONO}" font-size="22" font-weight="700" fill="#22c55e">${escape(add)}</text>
<text x="${delX}" y="84" font-family="${MONO}" font-size="22" font-weight="700" fill="#ff3333">${escape(del)}</text>
<text x="${W - 18}" y="84" text-anchor="end" font-family="${MONO}" font-size="12" fill="#8b93a4">lines this ${s.window}</text>
<text x="18" y="104" font-family="${MONO}" font-size="12" fill="#e0e2e5">${s.streak}d streak${s.topLanguage ? ` · ${escape(s.topLanguage)}` : ""}</text>`,
  );
}
