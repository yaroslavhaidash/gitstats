import { NextResponse } from "next/server";
import { db } from "@/db";
import { deviceCodes } from "@/db/schema";
import { DEVICE_CODE_TTL_MS, newDeviceCode, newSecret, purgeExpiredDeviceCodes } from "@/lib/cli";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { tooMany } from "@/lib/http";

export async function POST(request: Request) {
  const limit = rateLimit("device", clientIp(request));
  if (!limit.ok) return tooMany(limit.retryAfter);
  const body: unknown = await request.json().catch(() => null);
  const machine = typeof body === "object" && body !== null && typeof (body as Record<string, unknown>).machine === "string"
    ? String((body as Record<string, unknown>).machine).slice(0, 80)
    : "unknown machine";
  await purgeExpiredDeviceCodes();
  const code = newDeviceCode();
  const pollSecret = newSecret();
  await db.insert(deviceCodes).values({ code, pollSecret, machine, expiresAt: new Date(Date.now() + DEVICE_CODE_TTL_MS) });
  // Built from the origin this request arrived on, never from SITE_URL: a code minted against a
  // local or staging server has to be confirmed on that same server, or the browser lands on
  // production with somebody else's live session and pairs the wrong account.
  const { origin } = new URL(request.url);
  return NextResponse.json({ code, pollSecret, verifyUrl: `${origin}/link?code=${code}`, expiresIn: DEVICE_CODE_TTL_MS / 1000 });
}
