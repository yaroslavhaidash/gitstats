import { badgeStats, neutralBadge, statsBadge } from "@/lib/badge";
import { badgeWindow } from "@/lib/badgeMarkdown";
import { parseMetric } from "@/lib/window";

/** GitHub's image proxy caches too, so a README shows this hour's numbers at best. */
const CACHE = "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400";

export async function GET(request: Request, { params }: { params: Promise<{ login: string }> }) {
  const { login } = await params;
  const query = new URL(request.url).searchParams;
  const window = badgeWindow(query.get("w"));
  const stats = await badgeStats(decodeURIComponent(login), window, parseMetric(query.get("m") ?? undefined));
  return new Response(stats ? statsBadge(stats) : neutralBadge(), {
    headers: { "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": CACHE },
  });
}
