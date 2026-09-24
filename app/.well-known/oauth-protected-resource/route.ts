import { CORS, protectedResourceMetadata, publicOrigin } from "@/lib/oauth";

/**
 * Protected resource metadata (RFC 9728) for `/api/mcp`. Served here and at the path-suffixed URI the
 * 401 points to, because clients that miss the header try both.
 */
export function GET(request: Request): Response {
  return Response.json(protectedResourceMetadata(publicOrigin(request.headers)), { headers: { ...CORS, "Cache-Control": "public, max-age=3600" } });
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS });
}
