import { tooMany } from "@/lib/http";
import { CORS, registerClient } from "@/lib/oauth";
import { clientIp, rateLimit } from "@/lib/ratelimit";

/** Dynamic client registration (RFC 7591) for MCP clients that do not publish a client metadata document. */
export async function POST(request: Request): Promise<Response> {
  const limit = rateLimit("oauthRegister", clientIp(request));
  if (!limit.ok) return tooMany(limit.retryAfter);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const result = await registerClient(body);
  return Response.json(result.body, { status: result.status, headers: { ...CORS, "Cache-Control": "no-store" } });
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS });
}
