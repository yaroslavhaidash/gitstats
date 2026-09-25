import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { countStep } from "@/lib/funnel";
import { recordMemberLookup, recordTypedHandle, visitorFrom } from "@/lib/visits";

const clean = (login: string | null) => (login ?? "").trim().replace(/^@/, "");

/**
 * The compare forms submit here as a plain GET, so each redirect is a real 307. Two forms: the
 * "compare with me" box (`a` is the page it sits on, `b` the visitor's own handle) and the `/vs`
 * page (`f=pick`: `a` is "you", `b` anyone, and `a` alone is a lookup). A filled pair counts as one
 * `vs_create`. `/vs` with no handles at all is the compare page itself, served by `proxy.ts`.
 */
export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams;
  const pick = query.get("f") === "pick";
  let [a, b] = [clean(query.get("a")), clean(query.get("b"))];
  if (!a) [a, b] = [b, ""];
  if (!a) return NextResponse.redirect(new URL("/vs", request.url));
  const path = b ? `/vs/${a}/${b}` : `/gh/${a}`;
  if (b) await countStep("vs_create");
  // Only handles someone typed are recorded; the "compare with me" box's `a` is the page's owner.
  const typed = pick ? [a, b].filter(Boolean) : [b].filter(Boolean);
  const [visitor, session] = await Promise.all([visitorFrom(request.headers), auth()]);
  if (visitor) {
    for (const login of typed) {
      // A member is never a lead. Signed out, the first handle is the one the form asked for as yours.
      if (session) await recordMemberLookup(visitor, login, session.user.login, path);
      else await recordTypedHandle(visitor, login, path);
    }
  }
  return NextResponse.redirect(new URL(b ? `/vs/${encodeURIComponent(a)}/${encodeURIComponent(b)}` : `/gh/${encodeURIComponent(a)}`, request.url));
}
