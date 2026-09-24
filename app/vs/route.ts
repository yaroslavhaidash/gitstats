import { NextResponse, type NextRequest } from "next/server";
import { countStep } from "@/lib/funnel";
import { recordTypedHandle, visitorFrom } from "@/lib/visits";

const clean = (login: string | null) => (login ?? "").trim().replace(/^@/, "");

/**
 * The "compare with me" boxes submit here as a plain GET form; a filled pair counts as one
 * `vs_create`. A route handler so each redirect is a real 307.
 */
export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams;
  const [a, b] = [clean(query.get("a")), clean(query.get("b"))];
  if (!a) return NextResponse.redirect(new URL("/", request.url));
  if (!b) return NextResponse.redirect(new URL(`/vs/${encodeURIComponent(a)}`, request.url));
  await countStep("vs_create");
  // `b` is the box that asks for your own handle; `a` is the page it sat on, whose owner is not a lead.
  const visitor = await visitorFrom(request.headers);
  if (visitor) await recordTypedHandle(visitor, b, `/vs/${a}/${b}`);
  return NextResponse.redirect(new URL(`/vs/${encodeURIComponent(a)}/${encodeURIComponent(b)}`, request.url));
}
