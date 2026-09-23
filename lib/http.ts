import { NextResponse } from "next/server";

/** 429 with the seconds a client should wait, as `Retry-After` and in the body. */
export function tooMany(retryAfter: number): NextResponse {
  return NextResponse.json({ error: "rate limited", retryAfter }, { status: 429, headers: { "Retry-After": String(retryAfter) } });
}
