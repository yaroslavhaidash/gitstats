import { and, asc, between, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { dailyContributions, repos, snapshotRuns, userTokens, users, weeklyStats, type FirstSnapshot, type SnapshotError, type SnapshotKind } from "@/db/schema";
import { purgeExpiredArchives } from "./account";
import { purgeExpiredOAuth } from "./oauth";
import { purgeOldVisits } from "./visits";
import { revalidateForUsers, revalidateStats } from "./cache";
import { locallyOwnedPairs, mergeLocalIntoGithub } from "./cli";
import { decrypt } from "./crypto";
import {
  fetchAccessibleRepos,
  fetchContributions,
  fetchContributorStats,
  GitHubAuthError,
  serverToken,
  type ActiveRepo,
  type RateLimit,
} from "./github";

const BACKFILL_DAYS = 365;
/**
 * Discovery (one GraphQL call per user) gets this share of the budget; whatever is left goes to
 * `stats/contributors`. Without the split a long queue of users would leave no time to write any
 * stats at all, and every chained run would repeat that.
 */
const DISCOVERY_SHARE = 0.4;
/** Below this many calls left, stop asking GitHub anything and let the next night's chain resume. */
export const QUOTA_FLOOR = 300;
/**
 * GitHub answers 202 while it computes a repo's contributor stats. The run records it so the
 * history stays honest, but it means "ask again next run", not "a human is needed" — so neither
 * `/api/health` nor the alert treats it as a failure.
 */
export const PENDING_MESSAGE = "stats pending (GitHub returned 202); will retry next run";

export function realFailures(errors: SnapshotError[]): SnapshotError[] {
  return errors.filter((e) => e.message !== PENDING_MESSAGE);
}

const RETRY_DELAYS_MS = [2_000, 4_000, 8_000, 16_000, 30_000, 30_000];
/**
 * How much of an invocation may be spent asleep waiting for GitHub to finish computing a repo's
 * contributor stats. The full ladder is 90 s — 37% of the budget, and the real history shows runs
 * that slept most of that and processed nothing. Repos still pending when the cap is reached roll
 * to the next chained invocation, which starts with them.
 */
const MAX_RETRY_SLEEP_MS = 60_000;

export type SnapshotSummary = {
  runId: number;
  chainId: string | null;
  usersProcessed: number;
  /** Users this chain has not reached yet. Greater than zero is what makes the cron route chain another run. */
  usersPending: number;
  reposProcessed: number;
  reposSkipped: number;
  reposPending: number;
  quotaExhausted: boolean;
  /** `x-ratelimit-remaining` from the last GitHub call, or null when this run made none. */
  quotaRemaining: number | null;
  errors: SnapshotError[];
  rateLimit: { graphql: RateLimit | null; rest: RateLimit | null };
  durationMs: number;
};

export type SnapshotOptions = {
  /** Snapshot only these users, ignoring the chain queue: first sign-in and "snapshot now". */
  onlyUserIds?: number[];
  /** Ties this run to the other invocations of tonight's chain. */
  chainId?: string;
  /** Recorded on the run so `/api/health` and `/admin` can read the sign-in rate off the history. */
  kind?: SnapshotKind;
};

/**
 * How long a first sign-in's full run may take, out of the page's 300 s. A member with 30 public
 * repos took 40 s; repos GitHub is still computing when it runs out are finished by the nightly run.
 */
const FIRST_SNAPSHOT_BUDGET_MS = 240_000;
/** Past this, a run still marked `running` died with its function; the page stops saying "counting". */
const FIRST_SNAPSHOT_GIVE_UP_MS = 5 * 60_000;

/**
 * True exactly once per member: for the request whose update marks the first snapshot `running`.
 * Marking before the run starts is what keeps two tabs opened at once from starting two runs.
 */
export async function claimFirstSnapshot(userId: number): Promise<boolean> {
  const claimed = await db
    .update(users)
    .set({ firstSnapshot: "running" })
    .where(and(eq(users.id, userId), isNull(users.lastSnapshotAt), isNull(users.firstSnapshot), eq(users.isDemo, false)))
    .returning({ id: users.id });
  return claimed.length > 0;
}

/**
 * A new member's calendar, repos and lines right away instead of at the nightly cron: the full run,
 * for this one member. The quota floor still applies inside it, so when GitHub's hourly quota is low
 * it stops after discovery and the rest is left, like any unfinished repo, to the nightly run.
 */
export async function runFirstSnapshot(userId: number): Promise<SnapshotSummary> {
  let left = true;
  try {
    const summary = await runSnapshot(new Date(Date.now() + FIRST_SNAPSHOT_BUDGET_MS), { onlyUserIds: [userId], kind: "signin" });
    left = summary.reposPending > 0 || summary.quotaExhausted;
    return summary;
  } finally {
    await db.update(users).set({ firstSnapshot: left ? "pending" : "done" }).where(eq(users.id, userId));
    await revalidateForUsers([userId]);
  }
}

/**
 * Whether this member's first snapshot is under way, so their pages say "counting" instead of zeros.
 * A new account nobody has claimed yet counts too: the first page reads the row in the same breath as
 * the layout claims it, and would otherwise render a page of zeros under the "counting" line.
 */
export function firstSnapshotRunning(user: { firstSnapshot: FirstSnapshot | null; lastSnapshotAt: Date | null; createdAt: Date }): boolean {
  const waiting = user.firstSnapshot === "running" || (user.firstSnapshot === null && user.lastSnapshotAt === null);
  return waiting && Date.now() - user.createdAt.getTime() < FIRST_SNAPSHOT_GIVE_UP_MS;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function log(message: string): void {
  console.log(`[snapshot] ${message}`);
}

/**
 * One run erroring is normal — GitHub 202s, a revoked token, a repo that went private. Two in a
 * row means something needs a human, so say so once, loudly. `ALERT_WEBHOOK_URL` is a plain POST
 * target: Slack and Discord both take this shape, and anything else gets JSON it can read.
 */
export async function alertOnRepeatedFailure(runId: number, errors: SnapshotError[]): Promise<void> {
  const failures = realFailures(errors);
  if (failures.length === 0) return;
  const [previous] = await db
    .select({ errors: snapshotRuns.errors })
    .from(snapshotRuns)
    .where(lt(snapshotRuns.id, runId))
    .orderBy(desc(snapshotRuns.id))
    .limit(1);
  if (!previous || realFailures(previous.errors).length === 0) return;
  const text = `[alert] snapshot run ${runId} failed with ${failures.length} errors, and so did the run before it: ${failures[0].scope} — ${failures[0].message}`;
  console.error(text);
  const url = process.env.ALERT_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, runId, errors: failures.length, first: failures[0] }),
      signal: AbortSignal.timeout(5_000),
    });
  } catch (error) {
    // A broken webhook must never fail the snapshot that was trying to report through it.
    console.error(`[alert] could not reach ALERT_WEBHOOK_URL: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Walks the users this chain has not reached yet, oldest `last_snapshot_at` first, and writes
 * their public GitHub activity into Postgres until the budget runs out. What is left over is
 * reported as `usersPending` so the caller can chain another run.
 */
export async function runSnapshot(deadline: Date, options: SnapshotOptions = {}): Promise<SnapshotSummary> {
  const { onlyUserIds, chainId = null, kind = "nightly" } = options;
  const startedAt = Date.now();
  const [run] = await db.insert(snapshotRuns).values({ chainId, kind }).returning({ id: snapshotRuns.id, startedAt: snapshotRuns.startedAt });
  const errors: SnapshotError[] = [];
  const rateLimit: SnapshotSummary["rateLimit"] = { graphql: null, rest: null };
  let quotaExhausted = false;
  let quotaRemaining: number | null = null;

  /** One place decides "GitHub has had enough", so every loop can just check the flag. */
  function note(api: "graphql" | "rest", rl: RateLimit | null): void {
    rateLimit[api] = rl;
    if (rl !== null) quotaRemaining = rl.remaining;
    if (rl === null || rl.remaining >= QUOTA_FLOOR || quotaExhausted) return;
    quotaExhausted = true;
    errors.push({ scope: "quota", message: `GitHub ${api} quota down to ${rl.remaining}; stopping here, the chain resumes next night` });
    log(`quota guard: ${api} remaining ${rl.remaining} < ${QUOTA_FLOOR}, stopping`);
  }

  const to = new Date();
  const from = new Date(to.getTime() - BACKFILL_DAYS * 86_400_000);
  const fromDate = from.toISOString().slice(0, 10);
  const toDate = to.toISOString().slice(0, 10);

  // The seeded demo crew has no GitHub identity behind it; the nightly job never visits it.
  const allUsers = await db.select().from(users).where(eq(users.isDemo, false));
  const userIdByNodeId = new Map(allUsers.map((u) => [u.githubNodeId, u.id]));
  // A chain covers everyone once: the queue is whoever was last snapshotted before the chain began.
  const chainStartedAt = chainId ? await chainStart(chainId, run.startedAt) : run.startedAt;
  const targetUsers = onlyUserIds
    ? allUsers.filter((u) => onlyUserIds.includes(u.id))
    : await db
        .select()
        .from(users)
        .where(and(eq(users.isDemo, false), or(isNull(users.lastSnapshotAt), lt(users.lastSnapshotAt, chainStartedAt))))
        .orderBy(sql`${users.lastSnapshotAt} asc nulls first`, asc(users.id));
  const activeRepos = new Map<string, ActiveRepo>();
  /** Which token can read each repo: a member's own PAT for private repos, the server token otherwise. */
  const tokenForRepo = new Map<string, string>();
  const server = serverToken();
  const discoveryDeadline = Math.min(deadline.getTime(), startedAt + (deadline.getTime() - startedAt) * DISCOVERY_SHARE);
  const reached: number[] = [];
  let usersProcessed = 0;

  for (const user of targetUsers) {
    if (quotaExhausted || Date.now() > discoveryDeadline) break;
    reached.push(user.id);
    try {
      const { contributions, rateLimit: rl } = await fetchContributions(server, user.githubLogin, from, to);
      note("graphql", rl);
      // Only the days that say something. GitHub's calendar returns every day of the year and 86%
      // of them are zero; every reader already treats a missing day as zero. The window is replaced
      // rather than upserted, in one transaction, so a day that has gone back to zero is removed
      // instead of leaving a stale non-zero row behind.
      if (contributions.days.length > 0) {
        const active = contributions.days.filter((d) => d.contributionCount > 0);
        const clear = db
          .delete(dailyContributions)
          .where(and(eq(dailyContributions.userId, user.id), between(dailyContributions.date, fromDate, toDate)));
        await db.batch(
          active.length > 0
            ? [clear, db.insert(dailyContributions).values(active.map((d) => ({ userId: user.id, date: d.date, contributionCount: d.contributionCount })))]
            : [clear],
        );
      }
      for (const repo of contributions.repos) {
        activeRepos.set(repo.nodeId, repo);
        tokenForRepo.set(repo.nodeId, server);
      }
      let privateCount = 0;
      const tokens = await db.select().from(userTokens).where(eq(userTokens.userId, user.id));
      for (const t of tokens) {
        try {
          const plain = decrypt(t.token);
          const { repos: mine, rateLimit: prl } = await fetchAccessibleRepos(plain, from);
          note("rest", prl);
          for (const repo of mine) {
            if (!activeRepos.has(repo.nodeId)) activeRepos.set(repo.nodeId, repo);
            if (repo.isPrivate) {
              tokenForRepo.set(repo.nodeId, plain);
              privateCount += 1;
            }
          }
          if (t.lastError) await db.update(userTokens).set({ lastError: null }).where(eq(userTokens.id, t.id));
        } catch (error) {
          const message = error instanceof GitHubAuthError ? "token rejected by GitHub (expired or revoked?)" : String(error);
          await db.update(userTokens).set({ lastError: message }).where(eq(userTokens.id, t.id));
          errors.push({ scope: `token:${user.githubLogin}/${t.label}`, message });
        }
      }
      usersProcessed += 1;
      log(`${user.githubLogin}: ${contributions.repos.length} public + ${privateCount} private repos, ${contributions.totalCommitContributions} public commits in window`);
    } catch (error) {
      errors.push({ scope: `user:${user.githubLogin}`, message: error instanceof Error ? error.message : String(error) });
    }
  }

  // Stamped for everyone reached, not only the successes: a user GitHub keeps erroring on must
  // still move to the back of the queue, or the chain would spend every run on them. A targeted run
  // stamps too — it reached only the members it names, and `/admin` reads this as "last snapshot".
  if (reached.length > 0) {
    await db.update(users).set({ lastSnapshotAt: new Date() }).where(inArray(users.id, reached));
    // The nightly run is what a first snapshot's leftovers were waiting for.
    if (!onlyUserIds) await db.update(users).set({ firstSnapshot: "done" }).where(and(inArray(users.id, reached), eq(users.firstSnapshot, "pending")));
  }
  const usersPending = onlyUserIds ? 0 : targetUsers.length - reached.length;

  const nodeIds = [...activeRepos.keys()];
  const known = nodeIds.length > 0
    ? await db.select({ id: repos.githubNodeId, statsFetchedFor: repos.statsFetchedFor }).from(repos).where(inArray(repos.githubNodeId, nodeIds))
    : [];
  const statsFetchedFor = new Map(known.map((r) => [r.id, r.statsFetchedFor]));

  if (activeRepos.size > 0) {
    await db
      .insert(repos)
      .values(
        [...activeRepos.values()].map((r) => ({
          githubNodeId: r.nodeId,
          nameWithOwner: r.nameWithOwner,
          isFork: r.isFork,
          isPrivate: r.isPrivate,
          primaryLanguage: r.primaryLanguage,
          stargazerCount: r.stargazerCount,
          pushedAt: r.pushedAt === null ? null : new Date(r.pushedAt),
          lastSeenAt: to,
        })),
      )
      .onConflictDoUpdate({
        target: repos.githubNodeId,
        set: {
          nameWithOwner: sql`excluded.name_with_owner`,
          isFork: sql`excluded.is_fork`,
          isPrivate: sql`excluded.is_private`,
          primaryLanguage: sql`excluded.primary_language`,
          stargazerCount: sql`excluded.stargazer_count`,
          pushedAt: sql`excluded.pushed_at`,
          lastSeenAt: sql`excluded.last_seen_at`,
        },
      });
  }

  // Repos a member's machine uploaded before GitHub knew them get folded into the GitHub identity.
  // Only the users this invocation reached: a user it never discovered has nothing to merge. Three
  // statements per user, but the deadline still guards it — nothing after discovery is free.
  const reachedUsers = new Set(reached);
  const discovered = [...activeRepos.values()];
  const toMerge = targetUsers.flatMap((u) =>
    u.hashSalt !== null && reachedUsers.has(u.id) ? [{ id: u.id, login: u.githubLogin, salt: u.hashSalt }] : [],
  );
  for (const [i, user] of toMerge.entries()) {
    if (Date.now() > deadline.getTime()) {
      log(`merge: out of budget, ${toMerge.length - i} users left for the next run`);
      break;
    }
    const moved = await mergeLocalIntoGithub(user.id, user.salt, discovered);
    if (moved > 0) log(`${user.login}: merged ${moved} CLI rows into GitHub repo ids`);
  }

  // A repo nobody has pushed to since the last successful fetch would answer with the same numbers,
  // so it is not asked. A targeted run always asks: it exists because a user is new to this repo's
  // rows, and their rows are exactly what a cached answer would be missing.
  const local = await locallyOwnedPairs();
  let pending: ActiveRepo[] = [];
  let reposSkipped = 0;
  for (const repo of activeRepos.values()) {
    const last = statsFetchedFor.get(repo.nodeId);
    if (!onlyUserIds && repo.pushedAt !== null && last && last.getTime() === new Date(repo.pushedAt).getTime()) {
      reposSkipped += 1;
      continue;
    }
    pending.push(repo);
  }
  // Repos an earlier invocation of this chain left at 202. Their owner is already stamped, so
  // discovery will not surface them again and the backlog would be forgotten until tomorrow.
  // Private ones are left out: reading them needs their owner's PAT, which only discovery loads.
  const carried = onlyUserIds ? [] : await carriedPending(new Set(activeRepos.keys()));
  pending.push(...carried);
  log(`stats: ${pending.length} repos to fetch (${carried.length} carried from an earlier run), skipped ${reposSkipped} with unchanged pushed_at`);

  // Pass 0 hits every repo once (which makes GitHub start computing); later
  // passes retry only the ones that answered 202, with growing delays.
  let reposProcessed = 0;
  let sleptMs = 0;
  for (let attempt = 0; pending.length > 0 && !quotaExhausted && attempt <= RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) {
      const delay = RETRY_DELAYS_MS[attempt - 1];
      if (sleptMs + delay > MAX_RETRY_SLEEP_MS) {
        log(`${pending.length} repos still computing after ${sleptMs / 1000}s of waiting; leaving them to the next run`);
        break;
      }
      if (Date.now() + delay > deadline.getTime()) break;
      log(`${pending.length} repos still computing, retry ${attempt} in ${delay / 1000}s`);
      await sleep(delay);
      sleptMs += delay;
    }
    const stillPending: ActiveRepo[] = [];
    for (const repo of pending) {
      if (quotaExhausted || Date.now() > deadline.getTime()) {
        stillPending.push(repo);
        continue;
      }
      try {
        const { result, rateLimit: rl } = await fetchContributorStats(tokenForRepo.get(repo.nodeId) ?? server, repo.nameWithOwner);
        note("rest", rl);
        if (result.status === "pending") {
          stillPending.push(repo);
          continue;
        }
        if (result.status === "gone") {
          errors.push({ scope: `repo:${repo.nameWithOwner}`, message: "repository not reachable (deleted or blocked)" });
          continue;
        }
        const rows = result.stats.flatMap((stat) => {
          const userId = userIdByNodeId.get(stat.authorNodeId);
          // A member whose own machine counts this repo keeps those rows; GitHub's view is not written over them.
          if (userId === undefined || local.has(`${userId}:${repo.nodeId}`)) return [];
          return stat.weeks
            .filter((w) => w.weekStart >= fromDate)
            .map((w) => ({ userId, repoNodeId: repo.nodeId, weekStart: w.weekStart, additions: w.additions, deletions: w.deletions, commits: w.commits, source: "github" as const }));
        });
        if (rows.length > 0) {
          await db
            .insert(weeklyStats)
            .values(rows)
            .onConflictDoUpdate({
              target: [weeklyStats.userId, weeklyStats.repoNodeId, weeklyStats.weekStart],
              set: { additions: sql`excluded.additions`, deletions: sql`excluded.deletions`, commits: sql`excluded.commits`, source: sql`excluded.source` },
            });
        }
        await db
          .update(repos)
          .set({ statsPending: false, statsFetchedFor: repo.pushedAt === null ? null : new Date(repo.pushedAt) })
          .where(eq(repos.githubNodeId, repo.nodeId));
        reposProcessed += 1;
      } catch (error) {
        errors.push({ scope: `repo:${repo.nameWithOwner}`, message: error instanceof Error ? error.message : String(error) });
      }
    }
    pending = stillPending;
  }

  for (const repo of pending) {
    await db.update(repos).set({ statsPending: true }).where(eq(repos.githubNodeId, repo.nodeId));
    errors.push({ scope: `repo:${repo.nameWithOwner}`, message: PENDING_MESSAGE });
  }

  await db
    .update(snapshotRuns)
    .set({ finishedAt: new Date(), usersProcessed, usersPending, reposProcessed, errors, quotaRemaining })
    .where(eq(snapshotRuns.id, run.id));
  // A targeted run only touched these members; the chain touched everyone, so it drops the lot.
  if (onlyUserIds) await revalidateForUsers(onlyUserIds);
  else revalidateStats();
  const purged = await purgeExpiredArchives();
  if (purged > 0) log(`purged ${purged} deleted-member archive${purged === 1 ? "" : "s"} past retention`);
  await purgeExpiredOAuth();
  const expiredVisits = await purgeOldVisits();
  if (expiredVisits > 0) log(`deleted ${expiredVisits} visitor-day${expiredVisits === 1 ? "" : "s"} past retention`);
  await alertOnRepeatedFailure(run.id, errors);

  const summary: SnapshotSummary = {
    runId: run.id,
    chainId,
    usersProcessed,
    usersPending,
    reposProcessed,
    reposSkipped,
    reposPending: pending.length,
    quotaExhausted,
    quotaRemaining,
    errors,
    rateLimit,
    durationMs: Date.now() - startedAt,
  };
  log(
    `run ${run.id}${chainId ? ` (chain ${chainId})` : ""} done in ${summary.durationMs}ms: ${usersProcessed} users, ${usersPending} users pending, ` +
      `${reposProcessed} repos, ${reposSkipped} skipped, ${pending.length} pending, ${errors.length} errors. ` +
      `quota graphql=${rateLimit.graphql?.remaining ?? "?"}/${rateLimit.graphql?.limit ?? "?"} rest=${rateLimit.rest?.remaining ?? "?"}/${rateLimit.rest?.limit ?? "?"}`,
  );
  return summary;
}

/** Public repos still marked `stats_pending`, minus the ones this invocation just discovered. */
async function carriedPending(discovered: Set<string>): Promise<ActiveRepo[]> {
  const rows = await db
    .select({ nodeId: repos.githubNodeId, nameWithOwner: repos.nameWithOwner, isFork: repos.isFork, primaryLanguage: repos.primaryLanguage, stargazerCount: repos.stargazerCount, pushedAt: repos.pushedAt })
    .from(repos)
    .where(and(eq(repos.statsPending, true), eq(repos.isPrivate, false)));
  return rows
    .filter((r) => !discovered.has(r.nodeId))
    .map((r) => ({ ...r, isPrivate: false, pushedAt: r.pushedAt === null ? null : r.pushedAt.toISOString() }));
}

/** When tonight's chain began. Every run of it uses the same cut-off, so each user is visited once. */
async function chainStart(chainId: string, fallback: Date): Promise<Date> {
  const [first] = await db
    .select({ startedAt: snapshotRuns.startedAt })
    .from(snapshotRuns)
    .where(eq(snapshotRuns.chainId, chainId))
    .orderBy(asc(snapshotRuns.id))
    .limit(1);
  return first?.startedAt ?? fallback;
}
