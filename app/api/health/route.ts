import { asc, desc, eq, isNotNull, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { snapshotRuns } from "@/db/schema";
import { realFailures } from "@/lib/snapshot";

/** Unauthenticated liveness check: is Postgres answering, and did the last snapshot finish clean. */
export async function GET() {
  try {
    const [run] = await db
      .select({
        id: snapshotRuns.id,
        finishedAt: snapshotRuns.finishedAt,
        errors: snapshotRuns.errors,
        chainId: snapshotRuns.chainId,
      })
      .from(snapshotRuns)
      .orderBy(desc(snapshotRuns.id))
      .limit(1);
    // How far the last night's chain of invocations got: how many ran, how many users they
    // covered, and how many the chain stopped short of.
    let chain: { runs: number; usersDone: number; usersPending: number } | null = null;
    if (run?.chainId) {
      const runs = await db
        .select({ usersProcessed: snapshotRuns.usersProcessed, usersPending: snapshotRuns.usersPending })
        .from(snapshotRuns)
        .where(eq(snapshotRuns.chainId, run.chainId))
        .orderBy(asc(snapshotRuns.id));
      chain = {
        runs: runs.length,
        usersDone: runs.reduce((sum, r) => sum + r.usersProcessed, 0),
        usersPending: runs[runs.length - 1].usersPending,
      };
    }
    // How fast people are arriving, and how much GitHub quota is left for them. One first sign-in
    // costs one GraphQL call, so the rate and the remaining quota read together.
    const [signins] = await db
      .select({
        lastHour: sql<number>`count(*) filter (where ${snapshotRuns.startedAt} > now() - interval '1 hour')::int`,
        last24h: sql<number>`count(*) filter (where ${snapshotRuns.startedAt} > now() - interval '24 hours')::int`,
      })
      .from(snapshotRuns)
      .where(eq(snapshotRuns.kind, "signin"));
    const [quota] = await db
      .select({ remaining: snapshotRuns.quotaRemaining })
      .from(snapshotRuns)
      .where(isNotNull(snapshotRuns.quotaRemaining))
      .orderBy(desc(snapshotRuns.id))
      .limit(1);
    // `errors` is what a human would act on; `retrying` is GitHub's 202, which the next run clears.
    const failures = run ? realFailures(run.errors).length : 0;
    const lastSnapshot = run ? { id: run.id, finishedAt: run.finishedAt, errors: failures, retrying: run.errors.length - failures } : null;
    return NextResponse.json(
      { ok: run !== undefined && failures === 0, lastSnapshot, chain, signins, quotaRemaining: quota?.remaining ?? null, db: "ok" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    // The message could name the host or the role, so it never leaves the server.
    return NextResponse.json(
      { ok: false, lastSnapshot: null, chain: null, signins: null, quotaRemaining: null, db: "error" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
