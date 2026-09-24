import { decode } from "next-auth/jwt";
import { NextResponse, type NextRequest } from "next/server";
import { isAdmin } from "@/lib/admin";

/**
 * With Cache Components every page streams a shell before it runs, so a page's own `redirect()` or
 * `notFound()` can only arrive as a client redirect or a soft 404 with a 200. The few answers that
 * must be real HTTP statuses are decided here instead, before any rendering. The pages keep their
 * own checks as well.
 */

/** The session's user id, read the way Auth.js reads it: the encrypted JWT in the session cookie. */
async function sessionUserId(request: NextRequest): Promise<number | null> {
  const name = request.nextUrl.protocol === "https:" ? "__Secure-authjs.session-token" : "authjs.session-token";
  const raw = request.cookies.get(name)?.value;
  const secret = process.env.AUTH_SECRET;
  if (!raw || !secret) return null;
  try {
    const token = await decode({ token: raw, secret, salt: name });
    return typeof token?.uid === "number" ? token.uid : null;
  } catch {
    return null;
  }
}

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const uid = await sessionUserId(request);
  // A non-admin gets exactly the 404 of a path that does not exist, so /admin never confirms itself.
  if (path === "/admin" && (uid === null || !(await isAdmin(uid)))) {
    return NextResponse.rewrite(new URL("/not-a-page", request.url));
  }
  if (path.startsWith("/dashboard") && uid === null) return NextResponse.redirect(new URL("/", request.url));
  if (path === "/" && uid !== null) return NextResponse.redirect(new URL("/dashboard", request.url));
  return NextResponse.next();
}

export const config = { matcher: ["/", "/dashboard/:path*", "/admin"] };
