import { asc, desc, eq, lt, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { PgTable } from "drizzle-orm/pg-core";
import { db } from "@/db";
import {
  cliTokens,
  crewMembers,
  crews,
  dailyContributions,
  dailyLocal,
  deviceCodes,
  repoNameOverrides,
  repos,
  userTokens,
  users,
  weeklyStats,
  deletedUsersArchive,
  mcpTokens,
  messages,
  props,
  oauthCodes,
  oauthGrants,
  type ArchivedAccount,
} from "@/db/schema";
import { handOffCrews } from "./crews";

/**
 * Everything the server holds about one member, for the settings export: every table that carries
 * their user id, every column of it. Left out on purpose, and only these: the secrets themselves —
 * `users.hash_salt`, `cli_tokens.token_hash`, `mcp_tokens.token_hash`, the OAuth token hashes, the encrypted PATs in `user_tokens.token` — and
 * `device_codes` and `oauth_codes`, pairings in flight that are nothing but secrets and expire in ten minutes.
 */
export async function exportAccount(userId: number) {
  const giver = alias(users, "giver");
  const receiver = alias(users, "receiver");
  const [[user], memberships, machines, tokens, weeks, github, local, nameOverrides, assistants, propsRows, apps, thread] = await Promise.all([
    db
      .select({
        id: users.id,
        githubLogin: users.githubLogin,
        githubNodeId: users.githubNodeId,
        githubId: users.githubId,
        avatarUrl: users.avatarUrl,
        name: users.name,
        profileVisibility: users.profileVisibility,
        repoNames: users.repoNames,
        repoNamesGlobal: users.repoNamesGlobal,
        sharePrivate: users.sharePrivate,
        sharePrivateGlobal: users.sharePrivateGlobal,
        streakMode: users.streakMode,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, userId)),
    db
      .select({ crewId: crews.id, name: crews.name, code: crews.code, joinedAt: crewMembers.joinedAt, isAdmin: eq(crews.createdBy, userId) })
      .from(crewMembers)
      .innerJoin(crews, eq(crews.id, crewMembers.crewId))
      .where(eq(crewMembers.userId, userId))
      .orderBy(crews.id),
    db
      .select({
        machine: cliTokens.machine,
        createdAt: cliTokens.createdAt,
        lastSyncAt: cliTokens.lastSyncAt,
        lastSyncRepos: cliTokens.lastSyncRepos,
        lastSyncError: cliTokens.lastSyncError,
        cliVersion: cliTokens.cliVersion,
      })
      .from(cliTokens)
      .where(eq(cliTokens.userId, userId))
      .orderBy(cliTokens.id),
    db
      .select({ label: userTokens.label, lastError: userTokens.lastError, createdAt: userTokens.createdAt })
      .from(userTokens)
      .where(eq(userTokens.userId, userId))
      .orderBy(userTokens.id),
    db
      .select({
        repoNodeId: weeklyStats.repoNodeId,
        repo: repos.nameWithOwner,
        isPrivate: repos.isPrivate,
        weekStart: weeklyStats.weekStart,
        additions: weeklyStats.additions,
        deletions: weeklyStats.deletions,
        commits: weeklyStats.commits,
        pendingAdditions: weeklyStats.pendingAdditions,
        pendingDeletions: weeklyStats.pendingDeletions,
        pendingCommits: weeklyStats.pendingCommits,
        source: weeklyStats.source,
      })
      .from(weeklyStats)
      .innerJoin(repos, eq(repos.githubNodeId, weeklyStats.repoNodeId))
      .where(eq(weeklyStats.userId, userId))
      .orderBy(desc(weeklyStats.weekStart)),
    db
      .select({ date: dailyContributions.date, contributionCount: dailyContributions.contributionCount })
      .from(dailyContributions)
      .where(eq(dailyContributions.userId, userId))
      .orderBy(desc(dailyContributions.date)),
    db
      .select({
        repoNodeId: dailyLocal.repoNodeId,
        repo: repos.nameWithOwner,
        date: dailyLocal.date,
        additions: dailyLocal.additions,
        deletions: dailyLocal.deletions,
        commits: dailyLocal.commits,
        pendingAdditions: dailyLocal.pendingAdditions,
        pendingDeletions: dailyLocal.pendingDeletions,
        pendingCommits: dailyLocal.pendingCommits,
      })
      .from(dailyLocal)
      .innerJoin(repos, eq(repos.githubNodeId, dailyLocal.repoNodeId))
      .where(eq(dailyLocal.userId, userId))
      .orderBy(desc(dailyLocal.date)),
    db
      .select({ repoNodeId: repoNameOverrides.repoNodeId, repo: repos.nameWithOwner, hidden: repoNameOverrides.hidden })
      .from(repoNameOverrides)
      .innerJoin(repos, eq(repos.githubNodeId, repoNameOverrides.repoNodeId))
      .where(eq(repoNameOverrides.userId, userId))
      .orderBy(repoNameOverrides.repoNodeId),
    db
      .select({ label: mcpTokens.label, createdAt: mcpTokens.createdAt, lastUsedAt: mcpTokens.lastUsedAt })
      .from(mcpTokens)
      .where(eq(mcpTokens.userId, userId))
      .orderBy(mcpTokens.id),
    db
      .select({ from: giver.githubLogin, to: receiver.githubLogin, weekStart: props.weekStart, createdAt: props.createdAt })
      .from(props)
      .innerJoin(giver, eq(giver.id, props.giverId))
      .innerJoin(receiver, eq(receiver.id, props.receiverId))
      .where(or(eq(props.giverId, userId), eq(props.receiverId, userId)))
      .orderBy(desc(props.createdAt)),
    db
      .select({ app: oauthGrants.clientName, redirectHost: oauthGrants.redirectHost, scope: oauthGrants.scope, createdAt: oauthGrants.createdAt, lastUsedAt: oauthGrants.lastUsedAt })
      .from(oauthGrants)
      .where(eq(oauthGrants.userId, userId))
      .orderBy(oauthGrants.id),
    db
      .select({ fromAdmin: messages.fromAdmin, body: messages.body, createdAt: messages.createdAt, readAt: messages.readAt })
      .from(messages)
      .where(eq(messages.userId, userId))
      .orderBy(asc(messages.createdAt)),
  ]);
  if (!user) return null;
  return {
    exportedAt: new Date().toISOString(),
    user,
    crews: memberships,
    machines,
    githubTokens: tokens,
    weeklyStats: weeks,
    dailyContributions: github,
    dailyLocal: local,
    repoNameOverrides: nameOverrides,
    mcpTokens: assistants,
    props: propsRows,
    oauthApps: apps,
    messages: thread,
  };
}

/** How long a deleted member stays restorable. The nightly job purges the archive past this. */
export const ARCHIVE_DAYS = 30;

/**
 * Whole rows as jsonb. `to_jsonb`/`jsonb_populate_recordset` round-trip a row exactly, so the
 * archive never falls behind a schema change the way a hand-written column list would.
 */
async function rowsAsJson(table: PgTable, userId: number): Promise<Record<string, unknown>[]> {
  const res = await db.execute<{ rows: Record<string, unknown>[] }>(
    sql`select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) as rows from ${table} t where t.user_id = ${userId}`,
  );
  return res.rows[0].rows;
}

/**
 * Copy a member into `deleted_users_archive` before the deletes run, so the wipe is undoable for
 * `ARCHIVE_DAYS`. Secrets travel with it: a restore has to give back a working account.
 */
export async function archiveAccount(userId: number): Promise<void> {
  const found = await db.execute<{ row: Record<string, unknown> }>(sql`select to_jsonb(t) as row from ${users} t where t.id = ${userId}`);
  const user = found.rows[0]?.row;
  if (!user) return;
  const [memberships, machines, tokens, weeks, github, local, nameOverrides, assistants, propsRows, apps, thread] = await Promise.all([
    rowsAsJson(crewMembers, userId),
    rowsAsJson(cliTokens, userId),
    rowsAsJson(userTokens, userId),
    rowsAsJson(weeklyStats, userId),
    rowsAsJson(dailyContributions, userId),
    rowsAsJson(dailyLocal, userId),
    rowsAsJson(repoNameOverrides, userId),
    rowsAsJson(mcpTokens, userId),
    // Props carry two user ids, not one, so they are read both ways here instead of by `user_id`.
    db
      .execute<{ rows: Record<string, unknown>[] }>(
        sql`select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) as rows from ${props} t where t.giver_id = ${userId} or t.receiver_id = ${userId}`,
      )
      .then((res) => res.rows[0].rows),
    rowsAsJson(oauthGrants, userId),
    rowsAsJson(messages, userId),
  ]);
  const data: ArchivedAccount = {
    user,
    crewMembers: memberships,
    cliTokens: machines,
    userTokens: tokens,
    weeklyStats: weeks,
    dailyContributions: github,
    dailyLocal: local,
    repoNameOverrides: nameOverrides,
    mcpTokens: assistants,
    props: propsRows,
    oauthGrants: apps,
    messages: thread,
  };
  await db.insert(deletedUsersArchive).values({ userId, login: String(user.github_login), data });
}

/** One archived table back into place. `on conflict do nothing` keeps a repeated restore harmless. */
async function restoreRows(table: PgTable, rows: Record<string, unknown>[]): Promise<void> {
  if (rows.length === 0) return;
  await db.execute(sql`insert into ${table} select * from jsonb_populate_recordset(null::${table}, ${JSON.stringify(rows)}::jsonb) on conflict do nothing`);
}

/**
 * Put an archived member back and drop the archive row. Crew memberships only return for crews
 * that still exist — one the member was the last of was deleted on the way out and is not theirs
 * to resurrect. Returns the login, or null if the archive row is gone (purged, or already used).
 */
export async function restoreAccount(archiveId: number): Promise<string | null> {
  const [row] = await db.select().from(deletedUsersArchive).where(eq(deletedUsersArchive.id, archiveId));
  if (!row) return null;
  const { data } = row;
  await db.execute(sql`insert into ${users} select * from jsonb_populate_record(null::${users}, ${JSON.stringify(data.user)}::jsonb) on conflict do nothing`);
  // The id came back with the row, so the serial has to be pushed past it or the next signup collides.
  await db.execute(sql`select setval(pg_get_serial_sequence('users', 'id'), (select max(id) from ${users}))`);
  if (data.crewMembers.length > 0) {
    await db.execute(sql`
      insert into ${crewMembers}
      select r.* from jsonb_populate_recordset(null::${crewMembers}, ${JSON.stringify(data.crewMembers)}::jsonb) r
      where exists (select 1 from ${crews} c where c.id = r.crew_id)
      on conflict do nothing
    `);
  }
  await restoreRows(cliTokens, data.cliTokens);
  await restoreRows(userTokens, data.userTokens);
  await restoreRows(weeklyStats, data.weeklyStats);
  await restoreRows(dailyContributions, data.dailyContributions);
  await restoreRows(dailyLocal, data.dailyLocal);
  await restoreRows(repoNameOverrides, data.repoNameOverrides);
  await restoreRows(mcpTokens, data.mcpTokens ?? []);
  await restoreRows(oauthGrants, data.oauthGrants ?? []);
  await restoreRows(messages, data.messages ?? []);
  // Only props whose other member is still here can come back.
  if (data.props && data.props.length > 0) {
    await db.execute(sql`
      insert into ${props}
      select r.* from jsonb_populate_recordset(null::${props}, ${JSON.stringify(data.props)}::jsonb) r
      where exists (select 1 from ${users} u where u.id = r.giver_id) and exists (select 1 from ${users} u where u.id = r.receiver_id)
      on conflict do nothing
    `);
  }
  await db.delete(deletedUsersArchive).where(eq(deletedUsersArchive.id, archiveId));
  return row.login;
}

/** Drops archives past their retention. Called at the end of every snapshot run. */
export async function purgeExpiredArchives(): Promise<number> {
  const cutoff = new Date(Date.now() - ARCHIVE_DAYS * 86_400_000);
  const gone = await db
    .delete(deletedUsersArchive)
    .where(lt(deletedUsersArchive.deletedAt, cutoff))
    .returning({ id: deletedUsersArchive.id });
  return gone.length;
}

/**
 * Wipe a member: every row that points at them, in FK order, crews last. Crews follow the leave
 * rule — the earliest remaining member inherits one they created, an empty one is deleted. The
 * archive is written first, so the whole thing is undoable for `ARCHIVE_DAYS`.
 */
export async function deleteAccount(userId: number): Promise<void> {
  await archiveAccount(userId);
  await db.delete(weeklyStats).where(eq(weeklyStats.userId, userId));
  await db.delete(dailyLocal).where(eq(dailyLocal.userId, userId));
  await db.delete(dailyContributions).where(eq(dailyContributions.userId, userId));
  await db.delete(repoNameOverrides).where(eq(repoNameOverrides.userId, userId));
  await db.delete(cliTokens).where(eq(cliTokens.userId, userId));
  await db.delete(mcpTokens).where(eq(mcpTokens.userId, userId));
  await db.delete(oauthGrants).where(eq(oauthGrants.userId, userId));
  await db.delete(oauthCodes).where(eq(oauthCodes.userId, userId));
  await db.delete(messages).where(eq(messages.userId, userId));
  await db.delete(props).where(or(eq(props.giverId, userId), eq(props.receiverId, userId)));
  await db.delete(userTokens).where(eq(userTokens.userId, userId));
  await db.delete(deviceCodes).where(eq(deviceCodes.userId, userId));
  await handOffCrews(userId);
  await db.delete(users).where(eq(users.id, userId));
}
