import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { deviceCodes, users } from "@/db/schema";
import { userHashSalt } from "@/lib/cli";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { tooMany } from "@/lib/http";

export async function POST(request: Request) {
  const limit = rateLimit("poll", clientIp(request));
  if (!limit.ok) return tooMany(limit.retryAfter);
  const body: unknown = await request.json().catch(() => null);
  const pollSecret = typeof body === "object" && body !== null ? (body as Record<string, unknown>).pollSecret : null;
  if (typeof pollSecret !== "string") return new NextResponse("Bad request", { status: 400 });
  const [row] = await db.select().from(deviceCodes).where(eq(deviceCodes.pollSecret, pollSecret)).limit(1);
  if (!row || row.expiresAt < new Date()) return new NextResponse("Expired", { status: 410 });
  if (!row.userId || !row.issuedToken) return NextResponse.json({ status: "pending" });
  const [user] = await db.select({ login: users.githubLogin, githubId: users.githubId }).from(users).where(eq(users.id, row.userId));
  const salt = await userHashSalt(row.userId);
  await db.delete(deviceCodes).where(eq(deviceCodes.id, row.id));
  return NextResponse.json({ status: "ok", token: row.issuedToken, login: user.login, githubId: user.githubId, salt });
}
