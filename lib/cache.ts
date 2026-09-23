import { revalidateTag } from "next/cache";
import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { crewMembers } from "@/db/schema";

/** The broad tag every cached read still carries, for the nightly chain and admin actions. */
export const STATS_TAG = "stats";

/** One member's own page. */
export function userTag(userId: number): string {
  return `stats:user:${userId}`;
}

/** One crew's board, timelines and overlaps. */
export function crewTag(crewId: number): string {
  return `stats:crew:${crewId}`;
}

/**
 * Everything whose answer any member's sync can change: the global board, the footer counts and a
 * repo page, none of which belong to one member or one crew.
 */
export const GLOBAL_TAG = "stats:global";

/** `npm run snapshot` runs the same job as a plain node script, outside Next: no cache to drop. */
function inNextRuntime(): boolean {
  return process.env.NEXT_RUNTIME !== undefined;
}

// `expire: 0` drops the entries instead of serving them stale once more: right after a snapshot
// or a sync the next viewer should see the new numbers, not the previous run's.
function drop(tag: string): void {
  revalidateTag(tag, { expire: 0 });
}

/** Drop every cached board and user page. The nightly chain touches everyone, so it uses this. */
export function revalidateStats(): void {
  if (!inNextRuntime()) return;
  drop(STATS_TAG);
}

/**
 * Drop only what these members' writes can have changed: their own pages, every crew board they
 * are on, and the reads that span everybody. A CLI sync runs every 6 hours per linked machine, so
 * at any size this is the difference between dropping one member's entries and the whole cache.
 */
export async function revalidateForUsers(userIds: number[]): Promise<void> {
  if (!inNextRuntime() || userIds.length === 0) return;
  const crews = await db
    .selectDistinct({ crewId: crewMembers.crewId })
    .from(crewMembers)
    .where(inArray(crewMembers.userId, userIds));
  for (const id of userIds) drop(userTag(id));
  for (const c of crews) drop(crewTag(c.crewId));
  drop(GLOBAL_TAG);
}
