import { createHash, createHmac, randomBytes, randomInt } from "node:crypto";
import { and, eq, gte, lt, sql, type SQL } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { db } from "@/db";
import { cliTokens, dailyLocal, deviceCodes, repos, users, weeklyStats } from "@/db/schema";
import { revalidateForUsers } from "./cache";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const DEVICE_CODE_TTL_MS = 10 * 60_000;

/** The first version that updates itself and reports its version. Older ones still sync. */
export const MIN_CLI_VERSION = "0.3.0";

/** The version on npm now; bump it with each publish. Anything below can't be trusted to update
 *  itself (before 0.3.7 the scheduled update needed npm on the scheduler's PATH), so it is nudged. */
export const LATEST_CLI = "0.3.7";

/** The one command that brings any install to the latest, whatever it is running now. */
export const RELINK_COMMAND = "npx --yes @yaroslavhaidash/gitstats-cli@latest link";

/** Numeric semver compare, same rule as the CLI's own; pre-release suffixes are ignored. */
function parts(v: string): number[] {
  return v.split(/[-+]/)[0].split(".").map((n) => Number.parseInt(n, 10) || 0);
}

function olderThan(version: string, target: string): boolean {
  const a = parts(version);
  const b = parts(target);
  for (let i = 0; i < 3; i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) < (b[i] ?? 0);
  }
  return false;
}

/** A machine that never reported a version is running something older than 0.3.0. */
export function isOutdatedCli(version: string | null): boolean {
  return version === null || olderThan(version, MIN_CLI_VERSION);
}

export function behindLatestCli(version: string | null): boolean {
  return version === null || olderThan(version, LATEST_CLI);
}

const SELF_UPDATE_GRACE_MS = 2 * 24 * 60 * 60 * 1000;

/**
 * Whether to tell someone their machines are stuck on an old CLI: only when every one of them is
 * outdated *and* none has run for two days, which is long enough that the daily self-update would
 * have fixed it by itself. A machine linked minutes ago counts as fresh.
 */
export function cliUpdateStuck(machines: { cliVersion: string | null; lastSyncAt: Date | null; createdAt: Date }[], now = new Date()): boolean {
  if (machines.length === 0) return false;
  return machines.every((m) => isOutdatedCli(m.cliVersion) && now.getTime() - (m.lastSyncAt ?? m.createdAt).getTime() > SELF_UPDATE_GRACE_MS);
}

/** `cliVersion` from an ingest payload. Absent in payloads from CLIs before 0.3.0. */
export function parseCliVersion(value: unknown): string | null {
  return typeof value === "string" && /^\d{1,4}\.\d{1,4}\.\d{1,4}([-+][\w.]{1,16})?$/.test(value) ? value : null;
}

export function newDeviceCode(): string {
  const part = () => Array.from({ length: 4 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
  return `${part()}-${part()}`;
}

export function newSecret(): string {
  return randomBytes(32).toString("hex");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function purgeExpiredDeviceCodes(): Promise<void> {
  await db.delete(deviceCodes).where(lt(deviceCodes.expiresAt, new Date()));
}

/** The per-user HMAC key the CLI hashes remote URLs with. Created on first pairing. */
export async function userHashSalt(userId: number): Promise<string> {
  const [u] = await db.select({ salt: users.hashSalt }).from(users).where(eq(users.id, userId));
  if (u.salt) return u.salt;
  const salt = newSecret();
  await db.update(users).set({ hashSalt: salt }).where(eq(users.id, userId));
  return salt;
}

/** Same construction as the CLI: HMAC-SHA256(salt, "remote:github.com/owner/name"). */
export function remoteHmac(salt: string, normalisedRemote: string): string {
  return createHmac("sha256", salt).update(normalisedRemote).digest("hex");
}

export async function tokenOwner(rawToken: string) {
  const [row] = await db.select().from(cliTokens).where(eq(cliTokens.tokenHash, hashToken(rawToken))).limit(1);
  return row ?? null;
}

export type IngestWeek = { weekStart: string; additions: number; deletions: number; commits: number };
export type IngestDay = { date: string; additions: number; deletions: number; commits: number };
/** The same buckets counted over branches the default branch has not taken in yet. */
export type IngestPending = { weeks: IngestWeek[]; days: IngestDay[] };
export type IngestRepo = {
  /** HMAC-SHA256(user salt, normalised remote). Never the URL itself. */
  remoteHash: string;
  /** Only present when the user opted in with `gitstats names on`. */
  name: string | null;
  language: string | null;
  weeks: IngestWeek[];
  /** Commits and lines per UTC day, for the calendar and the daily charts. */
  days: IngestDay[];
  pending: IngestPending;
};

const EMPTY_PENDING: IngestPending = { weeks: [], days: [] };

function isWeek(w: unknown): w is IngestWeek {
  if (typeof w !== "object" || w === null) return false;
  const o = w as Record<string, unknown>;
  return (
    typeof o.weekStart === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.weekStart) &&
    typeof o.additions === "number" && typeof o.deletions === "number" && typeof o.commits === "number"
  );
}

function isDay(d: unknown): d is IngestDay {
  if (typeof d !== "object" || d === null) return false;
  const o = d as Record<string, unknown>;
  return (
    typeof o.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.date) &&
    typeof o.additions === "number" && typeof o.deletions === "number" && typeof o.commits === "number"
  );
}

/** `weeks` + `days` with the same bounds as the merged buckets; absent in payloads from older CLIs. */
function parsePending(value: unknown): IngestPending | null {
  if (value === undefined || value === null) return EMPTY_PENDING;
  if (typeof value !== "object") return null;
  const o = value as Record<string, unknown>;
  const weeks: unknown = o.weeks ?? [];
  const days: unknown = o.days ?? [];
  if (!Array.isArray(weeks) || weeks.length > 60 || !weeks.every(isWeek)) return null;
  if (!Array.isArray(days) || days.length > 400 || !days.every(isDay)) return null;
  return { weeks, days };
}

export function parseIngestRepos(input: unknown): IngestRepo[] | null {
  if (!Array.isArray(input) || input.length > 500) return null;
  const out: IngestRepo[] = [];
  for (const r of input) {
    if (typeof r !== "object" || r === null) return null;
    const o = r as Record<string, unknown>;
    if (typeof o.remoteHash !== "string" || !/^[a-f0-9]{64}$/.test(o.remoteHash)) return null;
    if (o.name !== null && (typeof o.name !== "string" || o.name.length > 200)) return null;
    if (o.language !== null && typeof o.language !== "string") return null;
    if (!Array.isArray(o.weeks) || o.weeks.length > 60 || !o.weeks.every(isWeek)) return null;
    const days: unknown = o.days ?? [];
    if (!Array.isArray(days) || days.length > 400 || !days.every(isDay)) return null;
    const pending = parsePending(o.pending);
    if (!pending) return null;
    out.push({ remoteHash: o.remoteHash, name: o.name, language: o.language, weeks: o.weeks, days, pending });
  }
  return out;
}

type Bucket = { additions: number; deletions: number; commits: number };
type Pending = { pendingAdditions: number; pendingDeletions: number; pendingCommits: number };

/**
 * One row per bucket carrying both halves. A bucket that only has pending work still gets a row
 * with zero merged commits, so branch-only work shows up without ever entering a ranking.
 */
function mergePending<K extends string, T extends Bucket & Record<K, string>>(merged: T[], pending: T[], key: K, since: string): (T & Pending)[] {
  const rows = new Map<string, T & Pending>();
  for (const m of merged) {
    if (m[key] < since) continue;
    rows.set(m[key], { ...m, pendingAdditions: 0, pendingDeletions: 0, pendingCommits: 0 });
  }
  for (const p of pending) {
    if (p[key] < since) continue;
    const row = rows.get(p[key]) ?? { ...p, additions: 0, deletions: 0, commits: 0, pendingAdditions: 0, pendingDeletions: 0, pendingCommits: 0 };
    row.pendingAdditions += p.additions;
    row.pendingDeletions += p.deletions;
    row.pendingCommits += p.commits;
    rows.set(p[key], row);
  }
  return [...rows.values()];
}

type Statement = BatchItem<"pg">;

/**
 * Repos per `db.batch()`. Each batch is one HTTP request and one transaction, so a chunk either
 * lands whole or not at all — the old shape deleted a repo's window and inserted the replacement in
 * separate requests, and a failure between them left the window empty until the next sync.
 */
const REPOS_PER_BATCH = 25;

/**
 * Recount semantics: the CLI sends the whole window each time, so we replace this user's rows for
 * that repo in the window and mark them `local`. Nothing shared between users is mutated: a repo
 * the GitHub path already knows is matched by HMAC of its github.com URL, and only this user's
 * rows for it switch source. Other users keep their GitHub-sourced rows for the same repo.
 */
export async function ingest(userId: number, since: string, incoming: IngestRepo[]): Promise<{ repos: number; weeks: number }> {
  const salt = await userHashSalt(userId);
  const known = await db
    .select({ id: repos.githubNodeId, name: repos.nameWithOwner })
    .from(repos)
    .where(sql`${repos.githubNodeId} not like 'local:%'`);
  const byHmac = new Map(known.map((r) => [remoteHmac(salt, `remote:github.com/${r.name.toLowerCase()}`), r.id]));
  let weeks = 0;
  let batch: Statement[] = [];
  let reposInBatch = 0;
  /** One HTTP request and one transaction, so a repo's delete and insert can never land apart. */
  async function flush(): Promise<void> {
    if (batch.length === 0) return;
    await db.batch([batch[0], ...batch.slice(1)]);
    batch = [];
    reposInBatch = 0;
  }
  for (const r of incoming) {
    let nodeId = byHmac.get(r.remoteHash);
    if (!nodeId) {
      nodeId = `local:${r.remoteHash}`;
      const label = r.name ?? `private-${r.remoteHash.slice(0, 8)}`;
      batch.push(
        db
          .insert(repos)
          .values({ githubNodeId: nodeId, nameWithOwner: label, isPrivate: true, primaryLanguage: r.language, lastSeenAt: new Date() })
          .onConflictDoUpdate({ target: repos.githubNodeId, set: { nameWithOwner: label, primaryLanguage: r.language, lastSeenAt: new Date() } }),
      );
    }
    batch.push(db.delete(weeklyStats).where(and(eq(weeklyStats.userId, userId), eq(weeklyStats.repoNodeId, nodeId), gte(weeklyStats.weekStart, since))));
    const rows = mergePending(r.weeks, r.pending.weeks, "weekStart", since).map((w) => ({ userId, repoNodeId: nodeId, source: "local" as const, ...w }));
    if (rows.length > 0) batch.push(db.insert(weeklyStats).values(rows));
    weeks += rows.length;
    batch.push(db.delete(dailyLocal).where(and(eq(dailyLocal.userId, userId), eq(dailyLocal.repoNodeId, nodeId), gte(dailyLocal.date, since))));
    const dayRows = mergePending(r.days, r.pending.days, "date", since).map((d) => ({ userId, repoNodeId: nodeId, ...d }));
    if (dayRows.length > 0) batch.push(db.insert(dailyLocal).values(dayRows));
    reposInBatch += 1;
    if (reposInBatch >= REPOS_PER_BATCH) await flush();
  }
  await flush();
  await revalidateForUsers([userId]);
  return { repos: incoming.length, weeks };
}

/** (userId, repoNodeId) pairs the CLI owns; the GitHub snapshot must not overwrite these. */
export async function locallyOwnedPairs(): Promise<Set<string>> {
  const rows = await db
    .selectDistinct({ userId: weeklyStats.userId, repoNodeId: weeklyStats.repoNodeId })
    .from(weeklyStats)
    .where(eq(weeklyStats.source, "local"));
  return new Set(rows.map((r) => `${r.userId}:${r.repoNodeId}`));
}

/** `(local:<hmac>, github node id)` for every discovered repo, as a SQL `values` list to join against. */
function localIdPairs(salt: string, discovered: { nodeId: string; nameWithOwner: string }[]): { local: string; node: string }[] {
  return discovered.map((r) => ({ local: `local:${remoteHmac(salt, `remote:github.com/${r.nameWithOwner.toLowerCase()}`)}`, node: r.nodeId }));
}

function valuesList(pairs: { local: string; node: string }[]): SQL {
  return sql.join(pairs.map((p) => sql`(${p.local}, ${p.node})`), sql`, `);
}

/**
 * A repo the CLI uploaded before the GitHub path knew it lives under `local:<hmac>`. Once GitHub
 * discovers it, move that user's rows onto the GitHub node id so it is one repo, not two.
 *
 * Three statements whatever the repo count: the old shape was one UPDATE per discovered repo per
 * user, which is the whole discovery set multiplied by the queue.
 */
export async function mergeLocalIntoGithub(userId: number, salt: string, discovered: { nodeId: string; nameWithOwner: string }[]): Promise<number> {
  if (discovered.length === 0) return 0;
  const pairs = localIdPairs(salt, discovered);
  const weekly = await db.execute<{ local: string }>(sql`
    update ${weeklyStats} set repo_node_id = m.node
    from (values ${valuesList(pairs)}) as m(local, node)
    where ${weeklyStats.userId} = ${userId} and ${weeklyStats.repoNodeId} = m.local
    returning m.local as local
  `);
  if (weekly.rows.length === 0) return 0;
  // Only the repos that actually moved, so a local id with no weekly rows is left exactly as before.
  const movedLocals = new Set(weekly.rows.map((r) => r.local));
  const moved = pairs.filter((p) => movedLocals.has(p.local));
  await db.execute(sql`
    update ${dailyLocal} set repo_node_id = m.node
    from (values ${valuesList(moved)}) as m(local, node)
    where ${dailyLocal.userId} = ${userId} and ${dailyLocal.repoNodeId} = m.local
  `);
  await db.execute(sql`
    delete from ${repos}
    where ${repos.githubNodeId} in ${moved.map((p) => p.local)}
      and not exists (select 1 from ${weeklyStats} w where w.repo_node_id = ${repos.githubNodeId})
  `);
  return weekly.rows.length;
}
