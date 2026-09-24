import { NextResponse, type NextRequest } from "next/server";
import { recordTypedHandle, visitorFrom } from "@/lib/visits";

/**
 * The landing's handle box submits here as a plain GET form, so it works before any JavaScript. A
 * route handler rather than a page, so the redirect is a real 307 and not a streamed client one.
 */
export async function GET(request: NextRequest) {
  const clean = (request.nextUrl.searchParams.get("login") ?? "").trim().replace(/^@/, "");
  if (!clean) return NextResponse.redirect(new URL("/", request.url));
  // The box asks for your own handle, so this is the one place a visitor tells us who they are.
  const visitor = await visitorFrom(request.headers);
  if (visitor) await recordTypedHandle(visitor, clean, `/gh/${clean}`);
  return NextResponse.redirect(new URL(`/gh/${encodeURIComponent(clean)}`, request.url));
}
