import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { cliTokens } from "@/db/schema";
import { hashToken, tokenOwner } from "@/lib/cli";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { tooMany } from "@/lib/http";

/** `gitstats unlink` calls this so the machine's token stops working server-side too. */
export async function DELETE(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  const raw = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  // Keyed on the hash, never the secret, and spent before the lookup so a repeated bad token costs no query.
  const byIp = rateLimit("cliIp", clientIp(request));
  if (!byIp.ok) return tooMany(byIp.retryAfter);
  const limit = rateLimit("unlink", raw ? hashToken(raw) : "anonymous");
  if (!limit.ok) return tooMany(limit.retryAfter);
  const owner = raw ? await tokenOwner(raw) : null;
  if (!owner) return new NextResponse("Unauthorized", { status: 401 });
  await db.delete(cliTokens).where(eq(cliTokens.id, owner.id));
  return NextResponse.json({ revoked: true });
}
