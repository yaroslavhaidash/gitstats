import { and, asc, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { messages, users } from "@/db/schema";

/** Longest message either side may send; the table's check constraint says the same. */
export const MESSAGE_MAX = 2000;
/** Messages a member may send per hour. The maintainer is not limited. */
const MEMBER_PER_HOUR = 20;

export type Message = { id: number; fromAdmin: boolean; body: string; createdAt: Date; readAt: Date | null };

/** One member's thread with the maintainer, oldest first. */
export function thread(userId: number): Promise<Message[]> {
  return db
    .select({ id: messages.id, fromAdmin: messages.fromAdmin, body: messages.body, createdAt: messages.createdAt, readAt: messages.readAt })
    .from(messages)
    .where(eq(messages.userId, userId))
    .orderBy(asc(messages.createdAt), asc(messages.id));
}

/** Whether the maintainer has written something this member has not opened yet: the nav's dot. */
export async function hasUnread(userId: number): Promise<boolean> {
  const [row] = await db
    .select({ id: messages.id })
    .from(messages)
    .where(and(eq(messages.userId, userId), eq(messages.fromAdmin, true), isNull(messages.readAt)))
    .limit(1);
  return row !== undefined;
}

/** Marks the other side's messages in a thread as read by `reader`. */
export async function markRead(userId: number, reader: "member" | "admin"): Promise<void> {
  await db
    .update(messages)
    .set({ readAt: new Date() })
    .where(and(eq(messages.userId, userId), eq(messages.fromAdmin, reader === "member"), isNull(messages.readAt)));
}

export type PostResult = "ok" | "empty" | "long" | "limit";

/** Adds a message to a member's thread, after the length and (for the member) rate checks. */
export async function postMessage(userId: number, fromAdmin: boolean, raw: unknown): Promise<PostResult> {
  const body = typeof raw === "string" ? raw.trim() : "";
  if (!body) return "empty";
  if (body.length > MESSAGE_MAX) return "long";
  if (!fromAdmin) {
    const [recent] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(messages)
      .where(and(eq(messages.userId, userId), eq(messages.fromAdmin, false), gt(messages.createdAt, sql`now() - interval '1 hour'`)));
    if (recent.n >= MEMBER_PER_HOUR) return "limit";
  }
  await db.insert(messages).values({ userId, fromAdmin, body });
  return "ok";
}

export type InboxThread = { userId: number; login: string; unread: number; total: number; lastAt: Date; last: string };

/** Every thread for `/admin`: those with replies the maintainer has not read first, then the most recent. */
export async function inbox(): Promise<InboxThread[]> {
  const rows = await db.execute<{ user_id: number; login: string; unread: number; total: number; last_at: string; last: string }>(sql`
    select m.user_id, u.github_login as login,
      count(*) filter (where not m.from_admin and m.read_at is null)::int as unread,
      count(*)::int as total,
      max(m.created_at) as last_at,
      (array_agg(m.body order by m.created_at desc, m.id desc))[1] as last
    from ${messages} m join ${users} u on u.id = m.user_id
    group by m.user_id, u.github_login
    order by (count(*) filter (where not m.from_admin and m.read_at is null) > 0) desc, max(m.created_at) desc
  `);
  return rows.rows.map((r) => ({ userId: r.user_id, login: r.login, unread: r.unread, total: r.total, lastAt: new Date(r.last_at), last: r.last }));
}
