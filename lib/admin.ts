import { asc, desc, eq, isNotNull, like, ne, not, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { adminLog, cliTokens, crewMembers, crews, deletedUsersArchive, repos, snapshotRuns, userTokens, users, weeklyStats, type AdminAction, type SnapshotKind } from "@/db/schema";
import { auth } from "@/auth";
import { DEMO_CREW_CODE, DEMO_REPO_PREFIX } from "./demo";
import { requireEnv } from "./env";
import { realFailures } from "./snapshot";

/**
 * `ADMIN_GITHUB_IDS`: comma-separated numeric GitHub account ids. Not logins: a renamed login is free
 * for anyone to register, and they would sign in with it; the account id never changes hands. Empty
 * or unset means nobody is an admin.
 */
export async function isAdmin(userId: number): Promise<boolean> {
  const allowed = (process.env.ADMIN_GITHUB_IDS ?? "").split(",").map((id) => id.trim()).filter(Boolean);
  if (allowed.length === 0) return false;
  const [row] = await db.select({ githubId: users.githubId }).from(users).where(eq(users.id, userId)).limit(1);
  return row?.githubId != null && allowed.includes(String(row.githubId));
}

/**
 * Admin pages and actions both start here. A non-admin gets the 404 a stranger gets, so the page
 * never confirms that it exists.
 */
export async function requireAdmin(): Promise<{ id: number; login: string }> {
  const session = await auth();
  if (!session || !(await isAdmin(session.user.id))) notFound();
  return { id: session.user.id, login: session.user.login };
}

export type AdminTotals = { members: number; repos: number; weeklyRows: number; crews: number };
export type AdminRun = {
  id: number;
  chainId: string | null;
  kind: SnapshotKind;
  quotaRemaining: number | null;
  startedAt: Date;
  finishedAt: Date | null;
  usersProcessed: number;
  usersPending: number;
  reposProcessed: number;
  errors: number;
  retrying: number;
};
export type AdminMachine = { id: number; machine: string; cliVersion: string | null; lastSyncAt: Date | null; lastSyncError: string | null };
export type AdminUser = {
  id: number;
  login: string;
  name: string | null;
  createdAt: Date;
  lastSnapshotAt: Date | null;
  crews: number;
  machines: AdminMachine[];
  tokenWarnings: { label: string; lastError: string }[];
};
export type AdminCrew = { id: number; name: string; code: string; createdBy: string; members: number };
export type AdminArchive = { id: number; login: string; userId: number; deletedAt: Date; rows: number };
export type AdminLogRow = { id: number; who: string; action: AdminAction; target: string; at: Date };

/** How fast people are arriving and how much GitHub quota is left for them; one sign-in = one call. */
export type AdminCapacity = { signinsLastHour: number; signinsLast24h: number; quotaRemaining: number | null };

export type AdminOverview = {
  totals: AdminTotals;
  capacity: AdminCapacity;
  runs: AdminRun[];
  members: AdminUser[];
  crewList: AdminCrew[];
  archives: AdminArchive[];
  log: AdminLogRow[];
};

/** Every admin mutation leaves one of these. Called after the change, so a failure logs nothing. */
export async function logAdmin(who: string, action: AdminAction, target: string): Promise<void> {
  await db.insert(adminLog).values({ who, action, target });
}

/**
 * `/admin` is the view of the real site. The seeded demo crew is fixture data owned by
 * `scripts/seed-demo.ts` — its members, its repos and the crew itself are left out of every total
 * and every list here, so the numbers on this page mean what they used to mean.
 */
const notDemo = eq(users.isDemo, false);
const notDemoRepo = not(like(repos.githubNodeId, `${DEMO_REPO_PREFIX}%`));
const notDemoCrew = ne(crews.code, DEMO_CREW_CODE);

/** Everything `/admin` shows, in one round of queries. Stitched in JS: the tables are small. */
export async function adminOverview(): Promise<AdminOverview> {
  const [memberCount, repoCount, weeklyCount, crewCount, signinRows, quotaRows, runRows, userRows, machineRows, crewCounts, tokenRows, crewList, archiveRows, logRows] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(users).where(notDemo),
    db.select({ n: sql<number>`count(*)::int` }).from(repos).where(notDemoRepo),
    db.select({ n: sql<number>`count(*)::int` }).from(weeklyStats).innerJoin(users, eq(users.id, weeklyStats.userId)).where(notDemo),
    db.select({ n: sql<number>`count(*)::int` }).from(crews).where(notDemoCrew),
    db
      .select({
        lastHour: sql<number>`count(*) filter (where ${snapshotRuns.startedAt} > now() - interval '1 hour')::int`,
        last24h: sql<number>`count(*) filter (where ${snapshotRuns.startedAt} > now() - interval '24 hours')::int`,
      })
      .from(snapshotRuns)
      .where(eq(snapshotRuns.kind, "signin")),
    db
      .select({ remaining: snapshotRuns.quotaRemaining })
      .from(snapshotRuns)
      .where(isNotNull(snapshotRuns.quotaRemaining))
      .orderBy(desc(snapshotRuns.id))
      .limit(1),
    db
      .select({
        id: snapshotRuns.id,
        chainId: snapshotRuns.chainId,
        kind: snapshotRuns.kind,
        quotaRemaining: snapshotRuns.quotaRemaining,
        startedAt: snapshotRuns.startedAt,
        finishedAt: snapshotRuns.finishedAt,
        usersProcessed: snapshotRuns.usersProcessed,
        usersPending: snapshotRuns.usersPending,
        reposProcessed: snapshotRuns.reposProcessed,
        errors: snapshotRuns.errors,
      })
      .from(snapshotRuns)
      .orderBy(desc(snapshotRuns.id))
      .limit(10),
    db
      .select({ id: users.id, login: users.githubLogin, name: users.name, createdAt: users.createdAt, lastSnapshotAt: users.lastSnapshotAt })
      .from(users)
      .where(notDemo)
      .orderBy(asc(users.id)),
    db
      .select({
        id: cliTokens.id,
        userId: cliTokens.userId,
        machine: cliTokens.machine,
        cliVersion: cliTokens.cliVersion,
        lastSyncAt: cliTokens.lastSyncAt,
        lastSyncError: cliTokens.lastSyncError,
      })
      .from(cliTokens)
      .orderBy(asc(cliTokens.id)),
    db.select({ userId: crewMembers.userId, n: sql<number>`count(*)::int` }).from(crewMembers).groupBy(crewMembers.userId),
    db
      .select({ userId: userTokens.userId, label: userTokens.label, lastError: userTokens.lastError })
      .from(userTokens)
      .where(isNotNull(userTokens.lastError)),
    db
      .select({ id: crews.id, name: crews.name, code: crews.code, createdBy: users.githubLogin, members: sql<number>`count(${crewMembers.userId})::int` })
      .from(crews)
      .innerJoin(users, eq(users.id, crews.createdBy))
      .leftJoin(crewMembers, eq(crewMembers.crewId, crews.id))
      .where(notDemoCrew)
      .groupBy(crews.id, crews.name, crews.code, users.githubLogin)
      .orderBy(asc(crews.id)),
    db
      .select({ id: deletedUsersArchive.id, login: deletedUsersArchive.login, userId: deletedUsersArchive.userId, deletedAt: deletedUsersArchive.deletedAt, data: deletedUsersArchive.data })
      .from(deletedUsersArchive)
      .orderBy(desc(deletedUsersArchive.id)),
    db
      .select({ id: adminLog.id, who: adminLog.who, action: adminLog.action, target: adminLog.target, at: adminLog.at })
      .from(adminLog)
      .orderBy(desc(adminLog.id))
      .limit(50),
  ]);
  const crewsByUser = new Map(crewCounts.map((c) => [c.userId, c.n]));
  return {
    totals: { members: memberCount[0].n, repos: repoCount[0].n, weeklyRows: weeklyCount[0].n, crews: crewCount[0].n },
    capacity: { signinsLastHour: signinRows[0].lastHour, signinsLast24h: signinRows[0].last24h, quotaRemaining: quotaRows[0]?.remaining ?? null },
    runs: runRows.map((r) => {
      const failures = realFailures(r.errors).length;
      return { ...r, errors: failures, retrying: r.errors.length - failures };
    }),
    members: userRows.map((u) => ({
      ...u,
      crews: crewsByUser.get(u.id) ?? 0,
      machines: machineRows
        .filter((m) => m.userId === u.id)
        .map((m) => ({ id: m.id, machine: m.machine, cliVersion: m.cliVersion, lastSyncAt: m.lastSyncAt, lastSyncError: m.lastSyncError })),
      tokenWarnings: tokenRows.filter((t) => t.userId === u.id).map((t) => ({ label: t.label, lastError: t.lastError ?? "" })),
    })),
    crewList,
    archives: archiveRows.map((a) => ({
      id: a.id,
      login: a.login,
      userId: a.userId,
      deletedAt: a.deletedAt,
      rows:
        1 +
        a.data.crewMembers.length +
        a.data.cliTokens.length +
        a.data.userTokens.length +
        a.data.weeklyStats.length +
        a.data.dailyContributions.length +
        a.data.dailyLocal.length +
        a.data.repoNameOverrides.length,
    })),
    log: logRows,
  };
}

/** The cron route's absolute URL, resolved from the incoming request. Call it in request scope. */
export async function snapshotChainUrl(): Promise<string | null> {
  const h = await headers();
  const host = h.get("host");
  if (!host) return null;
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}/api/cron/snapshot`;
}

/**
 * Kicks off a full chain through the cron route rather than calling `runSnapshot` directly, so the
 * manual run behaves exactly like the nightly one, chaining included.
 */
export async function triggerSnapshotChain(url: string): Promise<void> {
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${requireEnv("CRON_SECRET")}` }, cache: "no-store" });
    if (!res.ok) console.error(`[admin] manual chain returned ${res.status}`);
  } catch (error) {
    console.error(`[admin] manual chain failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}
