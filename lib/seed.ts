import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { crewMembers, crews, dailyContributions, dailyLocal, repos, users, weeklyStats } from "@/db/schema";
import { DEMO_CREW_CODE, DEMO_LOGINS, DEMO_REPO_PREFIX } from "./demo";

/**
 * The public demo crew behind `/demo`: four invented members with a year of invented numbers,
 * written into the real tables under `users.is_demo`, which keeps them out of the global board,
 * the footer counts, the admin totals and the nightly snapshot.
 *
 * Every figure is derived from a hash of `login:repo:date`, so a given calendar day always gets the
 * same numbers no matter when it runs. Re-running replaces the demo rows and nothing else. The dates
 * end today, so the nightly cron re-runs it (the snapshot skips demo users): without that the demo
 * has no "this week" a few days after a seed. `scripts/seed-demo.ts` runs it by hand.
 */

const DEMO_CREW_NAME = "DEMO CREW";
/** Two years, not one: the year window compares against the 365 days before it, and a demo whose
 *  first year has nothing to compare against shows every tile as ">999%". */
const DAYS = 742;

type Member = {
  login: (typeof DEMO_LOGINS)[number];
  name: string;
  /** Commits on a strong weekday, before the weekday and week-to-week wobble. */
  pace: number;
  /** Sunday first: how likely they are to show up that weekday, and how much they do when they do. */
  rhythm: number[];
};

type Repo = {
  slug: string;
  nameWithOwner: string;
  language: string;
  stars: number;
  isPrivate: boolean;
  /** Logins that commit to it, with each one's share of their own output. */
  members: Record<string, number>;
};

const MEMBERS: Member[] = [
  { login: "mara_vex", name: "Mara Vex", pace: 5, rhythm: [0.15, 1, 0.95, 1, 0.95, 0.85, 0.2] },
  { login: "kestrel_io", name: "Ada Kestrel", pace: 3.5, rhythm: [0.4, 0.85, 1, 0.95, 1, 0.9, 0.5] },
  { login: "nine_volt", name: "Tom Nine", pace: 2.5, rhythm: [0.65, 0.85, 0.9, 0.9, 0.95, 1, 0.8] },
  { login: "pilar_dev", name: "Pilar Ruiz", pace: 4, rhythm: [0.12, 1, 1, 0.95, 0.9, 0.85, 0.15] },
];

const REPOS: Repo[] = [
  { slug: "relay", nameWithOwner: "demo-crew/relay", language: "TypeScript", stars: 412, isPrivate: false, members: { "mara_vex": 0.4, "kestrel_io": 0.3 } },
  { slug: "pinlock", nameWithOwner: "demo-crew/pinlock", language: "Rust", stars: 96, isPrivate: false, members: { "kestrel_io": 0.35, "nine_volt": 0.4 } },
  { slug: "atlas-ui", nameWithOwner: "demo-crew/atlas-ui", language: "TypeScript", stars: 28, isPrivate: false, members: { "mara_vex": 0.25, "pilar_dev": 0.35 } },
  { slug: "dotfiles", nameWithOwner: "mara_vex/dotfiles", language: "Shell", stars: 7, isPrivate: false, members: { "mara_vex": 0.1 } },
  { slug: "ledger-core", nameWithOwner: "nine_volt/ledger-core", language: "Go", stars: 0, isPrivate: true, members: { "nine_volt": 0.6 } },
  { slug: "backoffice", nameWithOwner: "kestrel_io/backoffice", language: "Python", stars: 0, isPrivate: true, members: { "kestrel_io": 0.35 } },
  { slug: "mobile-shell", nameWithOwner: "pilar_dev/mobile-shell", language: "Kotlin", stars: 0, isPrivate: true, members: { "pilar_dev": 0.45, "mara_vex": 0.15 } },
  { slug: "paywall", nameWithOwner: "demo-crew/paywall", language: "TypeScript", stars: 0, isPrivate: true, members: { "mara_vex": 0.2, "pilar_dev": 0.2, "kestrel_io": 0.15 } },
];

const nodeId = (slug: string) => `${DEMO_REPO_PREFIX}${slug}`;

/** Every share each member holds, so "their main repo" is a lookup rather than a scan per day. */
const MEMBER_SHARES: Record<string, number[]> = Object.fromEntries(
  MEMBERS.map((m) => [m.login, REPOS.map((r) => r.members[m.login]).filter((s): s is number => s !== undefined)]),
);

/** FNV-1a over the key, then one xorshift round: a stable number in [0, 1) for any string. */
function rand(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 15;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function sundayOf(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return isoDate(d);
}

type DayFigures = { commits: number; additions: number; deletions: number };

/** How busy the year is around this day: one slow wave, offset per member. */
function season(member: Member, dayIndex: number): number {
  return 0.7 + 0.3 * Math.sin((dayIndex / 155) * Math.PI + rand(member.login) * 6);
}

/**
 * Whether this member worked at all today. Decided once per day rather than per repo, so a weekday
 * they show up for is a weekday every one of their repos can see — which is what makes a streak a
 * streak instead of a coin toss repeated per repo.
 */
function workedToday(member: Member, date: string): boolean {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  // Showing up is more certain than the rhythm alone: a weekday they mostly work is a weekday they
  // almost always work, and it is the volume, below, that carries the shape of their week.
  return rand(`${member.login}:${date}:worked`) < Math.min(1, member.rhythm[weekday] * 1.08);
}

/** One member's work on one repo on a day they worked. */
function dayFigures(member: Member, repo: Repo, date: string, dayIndex: number): DayFigures {
  const share = repo.members[member.login];
  const idle = { commits: 0, additions: 0, deletions: 0 };
  if (share === undefined) return idle;
  const wave = season(member, dayIndex);
  // Their main repo gets touched whenever they work; a side repo has to win its own roll.
  const main = Object.entries(repo.members).length > 0 && share === Math.max(...MEMBER_SHARES[member.login]);
  if (!main && rand(`${member.login}:${repo.slug}:${date}:touch`) > 0.4 + share) return idle;
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  const commits = Math.max(1, Math.round(member.pace * share * wave * member.rhythm[weekday] * (0.7 + rand(`${member.login}:${repo.slug}:${date}:c`))));
  const perCommit = 60 + Math.round(700 * rand(`${member.login}:${repo.slug}:${date}:a`) ** 2);
  const additions = commits * perCommit;
  const deletions = Math.round(additions * (0.15 + 0.5 * rand(`${member.login}:${repo.slug}:${date}:d`)));
  return { commits, additions, deletions };
}

async function insertChunked<T>(rows: T[], write: (chunk: T[]) => Promise<unknown>): Promise<void> {
  for (let i = 0; i < rows.length; i += 400) await write(rows.slice(i, i + 400));
}

export type DemoSeedSummary = { crewId: number; members: number; repos: number; weeklyRows: number; dailyRows: number; calendarRows: number };

export async function seedDemo(): Promise<DemoSeedSummary> {
  const today = new Date();
  const dates: string[] = [];
  for (let i = DAYS - 1; i >= 0; i--) dates.push(isoDate(new Date(today.getTime() - i * 86_400_000)));

  // Members first: everything else hangs off their ids.
  const seeded: { member: Member; userId: number }[] = [];
  for (const m of MEMBERS) {
    const [row] = await db
      .insert(users)
      .values({
        githubLogin: m.login,
        githubNodeId: `demo:${m.login}`,
        avatarUrl: `/demo/${m.login}.svg`,
        name: m.name,
        isDemo: true,
        // Names on, private numbers shared with crewmates: a crew that turned `gitstats names on`.
        repoNames: "all",
        sharePrivate: true,
        // They barely commit at weekends, which is exactly what this setting exists for.
        streakMode: "weekdays",
      })
      .onConflictDoUpdate({
        target: users.githubNodeId,
        set: { githubLogin: m.login, avatarUrl: `/demo/${m.login}.svg`, name: m.name, isDemo: true, repoNames: "all", streakMode: "weekdays" },
      })
      .returning({ id: users.id });
    seeded.push({ member: m, userId: row.id });
  }
  const ids = seeded.map((s) => s.userId);

  for (const r of REPOS) {
    await db
      .insert(repos)
      .values({
        githubNodeId: nodeId(r.slug),
        nameWithOwner: r.nameWithOwner,
        isPrivate: r.isPrivate,
        primaryLanguage: r.language,
        stargazerCount: r.stars,
        pushedAt: today,
      })
      .onConflictDoUpdate({
        target: repos.githubNodeId,
        set: { nameWithOwner: r.nameWithOwner, isPrivate: r.isPrivate, primaryLanguage: r.language, stargazerCount: r.stars, pushedAt: today },
      });
  }

  // Replace, never merge: a re-run must leave exactly one year of rows behind.
  await db.delete(weeklyStats).where(inArray(weeklyStats.userId, ids));
  await db.delete(dailyLocal).where(inArray(dailyLocal.userId, ids));
  await db.delete(dailyContributions).where(inArray(dailyContributions.userId, ids));

  const dailyRows: (typeof dailyLocal.$inferInsert)[] = [];
  const weekRows: (typeof weeklyStats.$inferInsert)[] = [];
  const calendarRows: (typeof dailyContributions.$inferInsert)[] = [];

  for (const { member: m, userId } of seeded) {
    const publicPerDay = new Map<string, number>();
    for (const r of REPOS) {
      if (r.members[m.login] === undefined) continue;
      const weeks = new Map<string, DayFigures>();
      dates.forEach((date, dayIndex) => {
        const f = workedToday(m, date) ? dayFigures(m, r, date, dayIndex) : { commits: 0, additions: 0, deletions: 0 };
        if (f.commits === 0) return;
        dailyRows.push({ userId, repoNodeId: nodeId(r.slug), date, ...f });
        const week = sundayOf(date);
        const acc = weeks.get(week) ?? { commits: 0, additions: 0, deletions: 0 };
        weeks.set(week, { commits: acc.commits + f.commits, additions: acc.additions + f.additions, deletions: acc.deletions + f.deletions });
        if (!r.isPrivate) publicPerDay.set(date, (publicPerDay.get(date) ?? 0) + f.commits);
      });
      for (const [weekStart, f] of weeks) {
        weekRows.push({ userId, repoNodeId: nodeId(r.slug), weekStart, ...f, source: r.isPrivate ? "local" : "github" });
      }
    }
    // GitHub's public calendar: public commits, plus the reviews and issues it also counts.
    for (const [date, commits] of publicPerDay) {
      calendarRows.push({ userId, date, contributionCount: commits + Math.round(rand(`${m.login}:${date}:extra`) * 3) });
    }
  }

  await insertChunked(weekRows, (chunk) => db.insert(weeklyStats).values(chunk));
  await insertChunked(dailyRows, (chunk) => db.insert(dailyLocal).values(chunk));
  await insertChunked(calendarRows, (chunk) => db.insert(dailyContributions).values(chunk));

  const owner = ids[0];
  const [crew] = await db
    .insert(crews)
    .values({ name: DEMO_CREW_NAME, code: DEMO_CREW_CODE, createdBy: owner })
    .onConflictDoUpdate({ target: crews.code, set: { name: DEMO_CREW_NAME, createdBy: owner } })
    .returning({ id: crews.id });
  for (const userId of ids) {
    await db.insert(crewMembers).values({ crewId: crew.id, userId }).onConflictDoNothing();
  }

  return { crewId: crew.id, members: ids.length, repos: REPOS.length, weeklyRows: weekRows.length, dailyRows: dailyRows.length, calendarRows: calendarRows.length };
}
