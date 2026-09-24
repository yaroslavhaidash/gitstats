import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { hashToken } from "@/lib/cli";
import { tooMany } from "@/lib/http";
import { mcpTokenOwner, registerTools } from "@/lib/mcp";
import { grantOwner, isOAuthAccessToken, PROTECTED_RESOURCE_PATH, publicOrigin, SCOPE } from "@/lib/oauth";
import { clientIp, rateLimit } from "@/lib/ratelimit";

/**
 * Remote MCP over Streamable HTTP, stateless and read-only. Auth is `Authorization: Bearer …` with
 * either a personal token from settings or an OAuth access token this app issued for this endpoint
 * (`lib/oauth.ts`); the verified owner's id travels as the auth `clientId` either way.
 */
const handler = createMcpHandler(
  (server) => registerTools(server, (clientId) => (clientId ? Number(clientId) : null)),
  {
    serverInfo: { name: "gitstats", version: "1.0.0" },
    instructions: "Read-only coding stats from gitstats.org for the member who owns the token: their totals, days, repos, crews and crew boards.",
  },
);

const authed = withMcpAuth(
  handler,
  async (req, bearer) => {
    if (!bearer) return undefined;
    if (isOAuthAccessToken(bearer)) {
      const grant = await grantOwner(bearer, publicOrigin(req.headers));
      return grant ? { token: bearer, clientId: String(grant.userId), scopes: [SCOPE], expiresAt: grant.expiresAt } : undefined;
    }
    const owner = await mcpTokenOwner(bearer);
    return owner ? { token: bearer, clientId: String(owner.userId), scopes: [SCOPE] } : undefined;
  },
  // The 401 names the path-suffixed metadata document and the one scope, so a client can start OAuth from it.
  { required: true, resourceMetadataPath: PROTECTED_RESOURCE_PATH, requiredScopes: [SCOPE] },
);

async function route(request: Request): Promise<Response> {
  // Spent before the lookup, like the CLI endpoints: a made-up token gets a fresh per-token bucket,
  // so the address limit is what bounds those; the per-token one is the documented 60 a minute.
  const byIp = rateLimit("mcpIp", clientIp(request));
  if (!byIp.ok) return tooMany(byIp.retryAfter);
  const header = request.headers.get("authorization") ?? "";
  const limit = rateLimit("mcp", header.startsWith("Bearer ") ? hashToken(header.slice(7)) : "anonymous");
  if (!limit.ok) return tooMany(limit.retryAfter);
  return authed(request);
}

export { route as GET, route as POST, route as DELETE };
