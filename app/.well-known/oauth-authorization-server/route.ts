import { authServerMetadata, CORS, publicOrigin } from "@/lib/oauth";

/** Authorization server metadata (RFC 8414): where an MCP client finds the consent screen and token endpoint. */
export function GET(request: Request): Response {
  return Response.json(authServerMetadata(publicOrigin(request.headers)), { headers: { ...CORS, "Cache-Control": "public, max-age=3600" } });
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS });
}
