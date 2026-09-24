import { gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { funnelDaily } from "@/db/schema";

/** Funnel order, as /admin shows the columns. */
export const FUNNEL_STEPS = ["signin_start", "signin_new", "signin_returning", "signin_error", "first_dashboard", "cli_linked", "invite_copy", "invite_join", "mcp_call"] as const;
export type FunnelStep = (typeof FUNNEL_STEPS)[number] | `signin_error:${string}`;

/** One more of `step` today (UTC). Never throws: a counter must not break the sign-in it counts. */
export async function countStep(step: FunnelStep): Promise<void> {
  try {
    await db
      .insert(funnelDaily)
      .values({ day: sql`(now() at time zone 'utc')::date`, step, n: 1 })
      .onConflictDoUpdate({ target: [funnelDaily.day, funnelDaily.step], set: { n: sql`${funnelDaily.n} + 1` } });
  } catch (e) {
    console.error(`[funnel] could not count ${step}:`, e);
  }
}

export type FunnelDay = { day: string; counts: Record<string, number> };

/** The last `days` UTC days, newest first, including days nothing happened. */
export async function funnelDays(days = 14): Promise<FunnelDay[]> {
  const rows = await db
    .select({ day: funnelDaily.day, step: funnelDaily.step, n: funnelDaily.n })
    .from(funnelDaily)
    .where(gte(funnelDaily.day, sql`(now() at time zone 'utc')::date - ${days - 1}::int`));
  const today = new Date();
  return Array.from({ length: days }, (_, i) => {
    const day = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - i)).toISOString().slice(0, 10);
    const counts: Record<string, number> = {};
    for (const r of rows) if (r.day === day) counts[r.step] = r.n;
    return { day, counts };
  });
}
