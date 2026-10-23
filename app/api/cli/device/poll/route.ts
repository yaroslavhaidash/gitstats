import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { claimDevice, userHashSalt } from "@/lib/cli";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { tooMany } from "@/lib/http";

export async function POST(request: Request) {
  const limit = rateLimit("poll", clientIp(request));
  if (!limit.ok) return tooMany(limit.retryAfter);
  const body: unknown = await request.json().catch(() => null);
  const pollSecret = typeof body === "object" && body !== null ? (body as Record<string, unknown>).pollSecret : null;
  if (typeof pollSecret !== "string") return new NextResponse("Bad request", { status: 400 });
  const claim = await claimDevice(pollSecret);
  if (claim.status === "expired") return new NextResponse("Expired", { status: 410 });
  if (claim.status === "pending") return NextResponse.json({ status: "pending" });
  const [user] = await db.select({ login: users.githubLogin, githubId: users.githubId }).from(users).where(eq(users.id, claim.userId));
  const salt = await userHashSalt(claim.userId);
  return NextResponse.json({ status: "ok", token: claim.token, login: user.login, githubId: user.githubId, salt });
}
