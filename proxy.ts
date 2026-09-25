import { decode } from "next-auth/jwt";
import { NextResponse, type NextRequest } from "next/server";
import { isAdmin } from "@/lib/admin";
import { countStep } from "@/lib/funnel";

/**
 * With Cache Components every page streams a shell before it runs, so a page's own `redirect()` or
 * `notFound()` can only arrive as a client redirect or a soft 404 with a 200. The few answers that
 * must be real HTTP statuses are decided here instead, before any rendering. The pages keep their
 * own checks as well.
 */

const SESSION_COOKIE = { https: "__Secure-authjs.session-token", http: "authjs.session-token" };

/**
 * The session's user id, read the way Auth.js reads it: the encrypted JWT in the session cookie.
 * `stale` is a cookie that is there but no longer decodes to a member (an old secret, an old shape).
 */
async function readSession(request: NextRequest): Promise<{ uid: number | null; stale: string | null }> {
  const name = request.nextUrl.protocol === "https:" ? SESSION_COOKIE.https : SESSION_COOKIE.http;
  const raw = request.cookies.get(name)?.value;
  const secret = process.env.AUTH_SECRET;
  if (!raw || !secret) return { uid: null, stale: null };
  try {
    const token = await decode({ token: raw, secret, salt: name });
    if (typeof token?.uid === "number") return { uid: token.uid, stale: null };
  } catch {
    // Falls through: an unreadable cookie is a stale one.
  }
  return { uid: null, stale: name };
}

async function route(request: NextRequest, uid: number | null): Promise<NextResponse> {
  const path = request.nextUrl.pathname;
  // A non-admin gets exactly the 404 of a path that does not exist, so /admin never confirms itself.
  if (path === "/admin" && (uid === null || !(await isAdmin(uid)))) {
    return NextResponse.rewrite(new URL("/not-a-page", request.url));
  }
  if (path.startsWith("/dashboard") && uid === null) return NextResponse.redirect(new URL("/", request.url));
  if (path === "/" && uid !== null) return NextResponse.redirect(new URL("/dashboard", request.url));
  // `/vs` is the compare page until a form submits handles to it; then its route handler records and redirects.
  const query = request.nextUrl.searchParams;
  if (path === "/vs" && !query.has("a") && !query.has("b")) return NextResponse.rewrite(new URL(`/compare${request.nextUrl.search}`, request.url));
  return NextResponse.next({ request: { headers: request.headers } });
}

export async function proxy(request: NextRequest) {
  const { uid, stale } = await readSession(request);
  if (!stale) return route(request, uid);
  // Without this every page render would fail to decode it again, and the browser would keep sending
  // it. The page itself renders without it (signed out), and the browser is told to drop it.
  request.cookies.delete(stale);
  const response = await route(request, null);
  response.cookies.set({ name: stale, value: "", expires: new Date(0), path: "/", httpOnly: true, sameSite: "lax", secure: stale === SESSION_COOKIE.https });
  await countStep("stale_session");
  return response;
}

// The listed paths decide redirects; every other page only passes through here when it carries a
// session cookie, so a stale one is cleared wherever it turns up. Matchers must be literals.
export const config = {
  matcher: [
    "/", "/dashboard/:path*", "/admin", "/vs",
    { source: "/((?!api|_next/static|_next/image|.*\\..*).*)", has: [{ type: "cookie", key: "__Secure-authjs.session-token" }] },
    { source: "/((?!api|_next/static|_next/image|.*\\..*).*)", has: [{ type: "cookie", key: "authjs.session-token" }] },
  ],
};
