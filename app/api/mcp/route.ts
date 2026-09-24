import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { hashToken } from "@/lib/cli";
import { tooMany } from "@/lib/http";
import { mcpTokenOwner, registerTools } from "@/lib/mcp";
import { clientIp, rateLimit } from "@/lib/ratelimit";

/**
 * Remote MCP over Streamable HTTP, stateless and read-only. Auth is a personal token from settings
 * as `Authorization: Bearer …`; the verified owner's id travels as the auth `clientId`.
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
  async (_req, bearer) => {
    const owner = bearer ? await mcpTokenOwner(bearer) : null;
    return owner ? { token: bearer ?? "", clientId: String(owner.userId), scopes: [] } : undefined;
  },
  { required: true },
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
