import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { cliTokens } from "@/db/schema";
import { hashToken, ingest, isOutdatedCli, MIN_CLI_VERSION, parseCliVersion, parseIngestRepos, tokenOwner } from "@/lib/cli";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { tooMany } from "@/lib/http";
import { daysAgo } from "@/lib/window";

export const maxDuration = 120;

export async function POST(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  const raw = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  // Keyed on the hash, never the secret, and spent before the lookup so a repeated bad token costs no query.
  const byIp = rateLimit("cliIp", clientIp(request));
  if (!byIp.ok) return tooMany(byIp.retryAfter);
  const limit = rateLimit("ingest", raw ? hashToken(raw) : "anonymous");
  if (!limit.ok) return tooMany(limit.retryAfter);
  const owner = raw ? await tokenOwner(raw) : null;
  if (!owner) return new NextResponse("Unauthorized", { status: 401 });
  const body: unknown = await request.json().catch(() => null);
  const fields = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const repos = parseIngestRepos(fields.repos ?? null);
  if (!repos) {
    await db.update(cliTokens).set({ lastSyncAt: new Date(), lastSyncError: "malformed payload" }).where(eq(cliTokens.id, owner.id));
    return new NextResponse("Bad request", { status: 400 });
  }
  const cliVersion = parseCliVersion(fields.cliVersion);
  const result = await ingest(owner.userId, daysAgo(365), repos);
  await db
    .update(cliTokens)
    .set({ lastSyncAt: new Date(), lastSyncRepos: result.repos, lastSyncError: null, cliVersion })
    .where(eq(cliTokens.id, owner.id));
  // Old versions still sync; they are only told there is something newer.
  return NextResponse.json(isOutdatedCli(cliVersion) ? { ...result, outdated: true, minVersion: MIN_CLI_VERSION } : result);
}
