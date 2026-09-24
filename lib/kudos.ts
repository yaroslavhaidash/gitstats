import { and, count, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { kudos, users } from "@/db/schema";
import { sharesCrew } from "./crews";
import { weekStart } from "./window";

type Profile = { id: number; profileVisibility: "crew" | "everyone"; isDemo: boolean };

/** Whether `viewerId` may open this member's page: the gate `/dashboard/u/<login>` applies, and what giving kudos checks again. */
export async function canViewProfile(viewerId: number, user: Profile): Promise<boolean> {
  if (user.isDemo) return false;
  return viewerId === user.id || user.profileVisibility === "everyone" || sharesCrew(viewerId, user.id);
}

export type KudosView = {
  week: number;
  allTime: number;
  /** Whether the viewer has given one this week, so the button can offer to take it back. */
  given: boolean;
  /** Who gave, newest first: only ever filled in for the receiver reading their own page. */
  givers: { login: string; total: number; thisWeek: boolean }[] | null;
};

export async function kudosView(receiverId: number, viewerId: number, now = new Date()): Promise<KudosView> {
  const week = weekStart(now);
  const [[totals], [mine], givers] = await Promise.all([
    db
      .select({ allTime: count(), week: sql<number>`count(*) filter (where ${kudos.weekStart} = ${week})::int` })
      .from(kudos)
      .where(eq(kudos.receiverId, receiverId)),
    db
      .select({ n: count() })
      .from(kudos)
      .where(and(eq(kudos.giverId, viewerId), eq(kudos.receiverId, receiverId), eq(kudos.weekStart, week))),
    viewerId === receiverId
      ? db
          .select({
            login: users.githubLogin,
            total: sql<number>`count(*)::int`,
            thisWeek: sql<boolean>`bool_or(${kudos.weekStart} = ${week})`,
          })
          .from(kudos)
          .innerJoin(users, eq(users.id, kudos.giverId))
          .where(eq(kudos.receiverId, receiverId))
          .groupBy(users.githubLogin)
          .orderBy(desc(sql`max(${kudos.createdAt})`))
      : null,
  ]);
  return { week: totals.week, allTime: totals.allTime, given: mine.n > 0, givers };
}

/** Give one kudos this week, or take this week's back. Returns whether one is now given. */
export async function toggleKudos(giverId: number, receiverId: number, now = new Date()): Promise<boolean> {
  const week = weekStart(now);
  const removed = await db
    .delete(kudos)
    .where(and(eq(kudos.giverId, giverId), eq(kudos.receiverId, receiverId), eq(kudos.weekStart, week)))
    .returning({ week: kudos.weekStart });
  if (removed.length > 0) return false;
  // The primary key is the one-per-week rule; a double submit lands on it and changes nothing.
  await db.insert(kudos).values({ giverId, receiverId, weekStart: week }).onConflictDoNothing();
  return true;
}
