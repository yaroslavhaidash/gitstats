import { badgeStats, neutralBadge, statsBadge } from "@/lib/badge";
import { badgeWindow } from "@/lib/badgeMarkdown";

/** GitHub's image proxy caches too, so a README shows this hour's numbers at best. */
const CACHE = "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400";

export async function GET(request: Request, { params }: { params: Promise<{ login: string }> }) {
  const { login } = await params;
  const window = badgeWindow(new URL(request.url).searchParams.get("w"));
  const stats = await badgeStats(decodeURIComponent(login), window);
  return new Response(stats ? statsBadge(stats) : neutralBadge(), {
    headers: { "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": CACHE },
  });
}
