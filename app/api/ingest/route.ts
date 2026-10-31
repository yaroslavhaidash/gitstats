import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { cliTokens } from "@/db/schema";
import { revalidateForUsers } from "@/lib/cache";
import { ingestClaude, parseClaudeUpload } from "@/lib/claude";
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
  const defaultSince = daysAgo(365);
  const repos = parseIngestRepos(fields.repos ?? null, defaultSince);
  if (!repos) {
    await db.update(cliTokens).set({ lastSyncAt: new Date(), lastSyncError: "malformed payload" }).where(eq(cliTokens.id, owner.id));
    return new NextResponse("Bad request", { status: 400 });
  }
  const cliVersion = parseCliVersion(fields.cliVersion);
  // A malformed `claude` never blocks the git sync: the repos still land, the field is answered "rejected".
  const claudeUpload = parseClaudeUpload(fields.claude, daysAgo(0));
  const counted = await ingest(owner.userId, defaultSince, repos);
  const claude = claudeUpload === "invalid" ? "rejected" : claudeUpload ? await ingestClaude(owner.userId, owner.id, claudeUpload) : null;
  // Without a `claude` field the body is exactly what older CLIs have always been sent.
  const result = claude === null ? counted : { ...counted, claude };
  await revalidateForUsers([owner.userId]);
  await db
    .update(cliTokens)
    .set({ lastSyncAt: new Date(), lastSyncRepos: result.repos, lastSyncError: null, cliVersion })
    .where(eq(cliTokens.id, owner.id));
  // Old versions still sync; they are only told there is something newer.
  return NextResponse.json(isOutdatedCli(cliVersion) ? { ...result, outdated: true, minVersion: MIN_CLI_VERSION } : result);
}
