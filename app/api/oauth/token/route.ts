import { tooMany } from "@/lib/http";
import { CORS, exchange, publicOrigin } from "@/lib/oauth";
import { clientIp, rateLimit } from "@/lib/ratelimit";

/** The OAuth token endpoint: form-encoded, as RFC 6749 §4.1.3 has it. */
export async function POST(request: Request): Promise<Response> {
  const limit = rateLimit("oauthToken", clientIp(request));
  if (!limit.ok) return tooMany(limit.retryAfter);
  const form = new URLSearchParams(await request.text());
  const result = await exchange(form, request.headers.get("authorization"), publicOrigin(request.headers));
  return Response.json(result.body, { status: result.status, headers: { ...CORS, "Cache-Control": "no-store", Pragma: "no-cache" } });
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS });
}
