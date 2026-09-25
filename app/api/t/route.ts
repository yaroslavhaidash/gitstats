import { NextResponse } from "next/server";
import { countStep } from "@/lib/funnel";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { livePath, recordEvent, visitorFrom } from "@/lib/visits";

/** Paths that are not a visitor's journey: the admin's own page and anything machine-facing. */
const SKIP = /^\/(admin|api|devlogin)(\/|$)/;

type Beacon = { kind?: unknown; path?: unknown; ref?: unknown; from?: unknown };

/**
 * The page-view beacon (`components/Beacon.tsx`). Pages are cached, so views are counted from the
 * browser rather than at render. Always 204: a beacon has nobody to read an error.
 */
export async function POST(request: Request) {
  const done = new NextResponse(null, { status: 204 });
  if (!rateLimit("beacon", clientIp(request)).ok) return done;
  let body: Beacon;
  try {
    body = JSON.parse(await request.text());
  } catch {
    return done;
  }
  if (typeof body.path !== "string" || !body.path.startsWith("/") || body.path.length > 2000) return done;
  const url = new URL(body.path, "http://x");
  if (SKIP.test(url.pathname) || !(await livePath(url.pathname))) return done;
  // Global Privacy Control means no journey is recorded; this counter is only there to give that blind spot a size.
  if (request.headers.get("sec-gpc") === "1") await countStep("gpc_skipped");
  const visitor = await visitorFrom(request.headers);
  if (!visitor) return done;
  if (body.kind === "signin_click") {
    await recordEvent(visitor, "signin_click", url.pathname, { from: typeof body.from === "string" ? body.from : undefined });
  } else if (body.kind === "view") {
    const q = url.searchParams;
    await recordEvent(visitor, url.pathname === "/demo" || url.pathname.startsWith("/demo/") ? "demo_view" : "view", url.pathname, {
      landing: {
        referrer: typeof body.ref === "string" ? body.ref : undefined,
        utmSource: q.get("utm_source"),
        utmMedium: q.get("utm_medium"),
        utmCampaign: q.get("utm_campaign"),
      },
    });
  }
  return done;
}
