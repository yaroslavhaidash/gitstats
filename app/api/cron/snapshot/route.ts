import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { after, NextResponse } from "next/server";
import { requireEnv } from "@/lib/env";
import { seedDemo } from "@/lib/seed";
import { runSnapshot } from "@/lib/snapshot";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const TIME_BUDGET_MS = 240_000;
/** A cap, not a target: 20 × 240s covers far more users than a night has, and stops a runaway loop. */
const MAX_CHAIN_RUNS = 20;

/**
 * Calls this same route again for the users the finished run did not reach. Fire-and-forget inside
 * `after()`: the response has already gone out, and the chained invocation is a fresh function.
 */
async function chainNext(url: URL, secret: string): Promise<void> {
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${secret}` }, cache: "no-store" });
    if (!res.ok) console.error(`[snapshot] chained call to ${url.pathname}${url.search} returned ${res.status}`);
  } catch (error) {
    console.error(`[snapshot] chained call failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** Digests first so the comparison takes the same time whatever the header's length. */
function isCronCall(request: Request, secret: string): boolean {
  const digest = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(digest(request.headers.get("authorization") ?? ""), digest(`Bearer ${secret}`));
}

export async function GET(request: Request) {
  const secret = requireEnv("CRON_SECRET");
  if (!isCronCall(request, secret)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const url = new URL(request.url);
  const chainId = url.searchParams.get("chain") ?? randomUUID();
  const parsedRun = Number(url.searchParams.get("run") ?? "1");
  const chainRun = Number.isInteger(parsedRun) && parsedRun >= 1 && parsedRun <= MAX_CHAIN_RUNS ? parsedRun : 1;

  const deadline = new Date(Date.now() + TIME_BUDGET_MS);
  // Once a night, before the snapshot, so the demo always ends today and the run's closing cache
  // drop covers its pages too. A failed seed is logged and tried again the next night; it never
  // stops the snapshot.
  if (chainRun === 1) {
    try {
      const seeded = await seedDemo();
      console.log(`[snapshot] demo seeded: ${seeded.weeklyRows} weekly, ${seeded.dailyRows} daily, ${seeded.calendarRows} calendar rows`);
    } catch (error) {
      console.error(`[snapshot] demo seed failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const summary = await runSnapshot(deadline, { chainId });

  // Repos count as unfinished work too: each invocation only fetches stats for what it discovered,
  // and a repo left at 202 has no user pending behind it, so the chain used to end with the night's
  // backlog untouched. Quota exhaustion still ends the chain: another run would only burn an
  // invocation to hit the same wall, and what is left over is picked up by tomorrow's chain.
  const unfinished = summary.usersPending > 0 || summary.reposPending > 0;
  const chained = unfinished && !summary.quotaExhausted && chainRun < MAX_CHAIN_RUNS;
  if (chained) {
    const next = new URL(url);
    next.searchParams.set("chain", chainId);
    next.searchParams.set("run", String(chainRun + 1));
    after(() => chainNext(next, secret));
  }
  return NextResponse.json({ ...summary, chainRun, chained });
}
