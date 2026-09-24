import { and, count, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { props, users } from "@/db/schema";
import { sharesCrew } from "./crews";
import { weekStart } from "./window";

type Profile = { id: number; profileVisibility: "crew" | "everyone"; isDemo: boolean };

/** Whether `viewerId` may open this member's page: the gate `/dashboard/u/<login>` applies, and what giving props checks again. */
export async function canViewProfile(viewerId: number, user: Profile): Promise<boolean> {
  if (user.isDemo) return false;
  return viewerId === user.id || user.profileVisibility === "everyone" || sharesCrew(viewerId, user.id);
}

export type PropsView = {
  week: number;
  allTime: number;
  /** Whether the viewer has given one this week, so the button can offer to take it back. */
  given: boolean;
  /** Who gave, newest first: only ever filled in for the receiver reading their own page. */
  givers: { login: string; total: number; thisWeek: boolean }[] | null;
};

export async function propsView(receiverId: number, viewerId: number, now = new Date()): Promise<PropsView> {
  const week = weekStart(now);
  const [[totals], [mine], givers] = await Promise.all([
    db
      .select({ allTime: count(), week: sql<number>`count(*) filter (where ${props.weekStart} = ${week})::int` })
      .from(props)
      .where(eq(props.receiverId, receiverId)),
    db
      .select({ n: count() })
      .from(props)
      .where(and(eq(props.giverId, viewerId), eq(props.receiverId, receiverId), eq(props.weekStart, week))),
    viewerId === receiverId
      ? db
          .select({
            login: users.githubLogin,
            total: sql<number>`count(*)::int`,
            thisWeek: sql<boolean>`bool_or(${props.weekStart} = ${week})`,
          })
          .from(props)
          .innerJoin(users, eq(users.id, props.giverId))
          .where(eq(props.receiverId, receiverId))
          .groupBy(users.githubLogin)
          .orderBy(desc(sql`max(${props.createdAt})`))
      : null,
  ]);
  return { week: totals.week, allTime: totals.allTime, given: mine.n > 0, givers };
}

/** Give props this week, or take this week's back. Returns whether they are now given. */
export async function toggleProps(giverId: number, receiverId: number, now = new Date()): Promise<boolean> {
  const week = weekStart(now);
  const removed = await db
    .delete(props)
    .where(and(eq(props.giverId, giverId), eq(props.receiverId, receiverId), eq(props.weekStart, week)))
    .returning({ week: props.weekStart });
  if (removed.length > 0) return false;
  // The primary key is the one-per-week rule; a double submit lands on it and changes nothing.
  await db.insert(props).values({ giverId, receiverId, weekStart: week }).onConflictDoNothing();
  return true;
}
