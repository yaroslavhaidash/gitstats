import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { crewMembers, crews, users } from "@/db/schema";
import { DEMO_CREW_CODE } from "./demo";

export async function userCrews(userId: number) {
  return db
    .select({ id: crews.id, name: crews.name, code: crews.code })
    .from(crewMembers)
    .innerJoin(crews, eq(crews.id, crewMembers.crewId))
    .where(eq(crewMembers.userId, userId))
    .orderBy(crews.id);
}

/** A crew by invite code. The demo crew's code is in the source, so it never resolves here: nobody
 *  can join it, open its board or manage it; `/demo` reads it through `demoCrew()` instead. */
export async function crewByCode(code: string) {
  if (code === DEMO_CREW_CODE) return null;
  const [crew] = await db.select().from(crews).where(eq(crews.code, code)).limit(1);
  return crew ?? null;
}

export async function crewMemberIds(crewId: number): Promise<number[]> {
  const rows = await db.select({ userId: crewMembers.userId }).from(crewMembers).where(eq(crewMembers.crewId, crewId));
  return rows.map((r) => r.userId);
}

export async function isMember(crewId: number, userId: number): Promise<boolean> {
  const [row] = await db
    .select({ userId: crewMembers.userId })
    .from(crewMembers)
    .where(and(eq(crewMembers.crewId, crewId), eq(crewMembers.userId, userId)))
    .limit(1);
  return row !== undefined;
}

export async function sharesCrew(a: number, b: number): Promise<boolean> {
  if (a === b) return true;
  const [mine, theirs] = await Promise.all([userCrews(a), userCrews(b)]);
  const theirIds = new Set(theirs.map((c) => c.id));
  return mine.some((c) => theirIds.has(c.id));
}

export async function userByLogin(login: string) {
  const [user] = await db.select().from(users).where(eq(users.githubLogin, login)).limit(1);
  return user ?? null;
}

/** Everyone in any crew the user belongs to, deduped — what the command palette searches. */
export async function crewmates(userId: number) {
  const mine = db.select({ crewId: crewMembers.crewId }).from(crewMembers).where(eq(crewMembers.userId, userId));
  return db
    .selectDistinct({ login: users.githubLogin, name: users.name })
    .from(crewMembers)
    .innerJoin(users, eq(users.id, crewMembers.userId))
    .where(inArray(crewMembers.crewId, mine))
    .orderBy(users.githubLogin);
}

export type AdminResult = { ok: true; code: string } | { ok: false; reason: "missing" | "forbidden" | "name" };

/** The crew, if `userId` created it. Every admin mutation goes through this check. */
async function ownedCrew(code: string, userId: number) {
  const crew = await crewByCode(code);
  if (!crew) return { crew: null, reason: "missing" as const };
  if (crew.createdBy !== userId) return { crew: null, reason: "forbidden" as const };
  return { crew, reason: null };
}

export async function renameCrew(code: string, userId: number, rawName: string): Promise<AdminResult> {
  const { crew, reason } = await ownedCrew(code, userId);
  if (!crew) return { ok: false, reason };
  const name = rawName.trim().slice(0, 40);
  if (!name) return { ok: false, reason: "name" };
  await db.update(crews).set({ name }).where(eq(crews.id, crew.id));
  return { ok: true, code: crew.code };
}

export async function regenerateCode(code: string, userId: number, newCode: string): Promise<AdminResult> {
  const { crew, reason } = await ownedCrew(code, userId);
  if (!crew) return { ok: false, reason };
  await db.update(crews).set({ code: newCode }).where(eq(crews.id, crew.id));
  return { ok: true, code: newCode };
}

export async function removeMember(code: string, userId: number, memberId: number): Promise<AdminResult> {
  const { crew, reason } = await ownedCrew(code, userId);
  if (!crew) return { ok: false, reason };
  // The creator leaves through `leaveCrew`, which hands ownership on; removing yourself here would orphan the crew.
  if (memberId === userId) return { ok: false, reason: "forbidden" };
  await db.delete(crewMembers).where(and(eq(crewMembers.crewId, crew.id), eq(crewMembers.userId, memberId)));
  return { ok: true, code: crew.code };
}

/**
 * Anyone may leave. The creator leaving hands the crew to whoever joined earliest; the last member
 * leaving takes the crew with them.
 */
export async function leaveCrew(code: string, userId: number): Promise<"left" | "deleted" | "missing"> {
  const crew = await crewByCode(code);
  if (!crew) return "missing";
  await db.delete(crewMembers).where(and(eq(crewMembers.crewId, crew.id), eq(crewMembers.userId, userId)));
  const [next] = await db
    .select({ userId: crewMembers.userId })
    .from(crewMembers)
    .where(eq(crewMembers.crewId, crew.id))
    .orderBy(crewMembers.joinedAt, crewMembers.userId)
    .limit(1);
  if (!next) {
    await db.delete(crews).where(eq(crews.id, crew.id));
    return "deleted";
  }
  if (crew.createdBy === userId) await db.update(crews).set({ createdBy: next.userId }).where(eq(crews.id, crew.id));
  return "left";
}

/** Take the user out of every crew they are in or created, each one handed on by the leave rule. */
export async function handOffCrews(userId: number): Promise<void> {
  const [mine, created] = await Promise.all([
    userCrews(userId),
    db.select({ code: crews.code }).from(crews).where(eq(crews.createdBy, userId)),
  ]);
  for (const code of new Set([...mine, ...created].map((c) => c.code))) await leaveCrew(code, userId);
}

/** Everyone who shares a crew with the user, the user included: the scope a repo page may show. */
export async function crewmateIds(userId: number): Promise<number[]> {
  const mine = db.select({ crewId: crewMembers.crewId }).from(crewMembers).where(eq(crewMembers.userId, userId));
  const rows = await db.selectDistinct({ userId: crewMembers.userId }).from(crewMembers).where(inArray(crewMembers.crewId, mine));
  return [...new Set([userId, ...rows.map((r) => r.userId)])].sort((a, b) => a - b);
}

export type BackTarget = { href: string; label: string };

/**
 * Where "← …" goes on a profile or repo page. Boards tag their links with `src` — `c:<code>` or
 * `global` — and the reader's window and metric ride along in `view`, so going back lands on the board
 * they left rather than on this week. An unknown code, or a crew this reader is not in, falls back to
 * their own home board: the nav's logo already means that, and it is never a name they may not see.
 *
 * `src` rather than `from`, because `?from=` on both these pages is already the start of a custom date
 * range and one key cannot hold both without silently dropping the range.
 */
export async function backTarget(userId: number, src: string | undefined, view: string): Promise<BackTarget> {
  const query = view ? `?${view}` : "";
  if (src?.startsWith("c:")) {
    const crew = await crewByCode(src.slice(2).toUpperCase());
    if (crew && (await isMember(crew.id, userId))) return { href: `/dashboard/c/${crew.code}${query}`, label: crew.name };
  }
  if (src === "global") return { href: `/dashboard/global${query}`, label: "global" };
  const [first] = await userCrews(userId);
  return { href: first ? `/dashboard/c/${first.code}${query}` : `/dashboard/global${query}`, label: "board" };
}
