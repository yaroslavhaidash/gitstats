import { createHash } from "node:crypto";
import { and, eq, gt, lt } from "drizzle-orm";
import { after } from "next/server";
import { db } from "@/db";
import { oauthClients, oauthCodes, oauthGrants } from "@/db/schema";
import { hashToken, newSecret } from "./cli";

/**
 * gitstats as its own OAuth 2.1 authorization server for the MCP endpoint, per the MCP authorization
 * spec (2026-07-28): protected-resource metadata points at this origin, apps identify themselves by
 * a Client ID Metadata Document URL or by registering (RFC 7591), the member consents with their
 * GitHub session, and the app gets a short-lived access token and a rotating refresh token for
 * `/api/mcp` only. Every token is stored as a sha256 hash. The owner of a grant is the viewer,
 * exactly like a personal MCP token, and the only scope is read.
 */

export const SCOPE = "read";
const ACCESS_TTL_S = 3600;
const REFRESH_TTL_MS = 90 * 86_400_000;
const CODE_TTL_MS = 10 * 60_000;
/** A client metadata document is re-read after a day; a failed re-read keeps the copy we have. */
const CIMD_TTL_MS = 86_400_000;
const CIMD_MAX_BYTES = 10_000;

const ACCESS_PREFIX = "gso_";
const REFRESH_PREFIX = "gsr_";
const CODE_PREFIX = "gsc_";

/** The origin this request reached, so the issuer and resource are right on localhost and in production. */
export function publicOrigin(headers: Headers): string {
  const host = (headers.get("x-forwarded-host") ?? headers.get("host") ?? "").split(",")[0].trim();
  const local = /^(localhost|127\.0\.0\.1)(:|$)/.test(host);
  const proto = headers.get("x-forwarded-proto")?.split(",")[0].trim() ?? (local ? "http" : "https");
  return `${proto}://${host}`;
}

/** The MCP endpoint's canonical URI: what tokens are issued for and checked against (RFC 8707). */
export function resourceFor(origin: string): string {
  return `${origin}/api/mcp`;
}

export const PROTECTED_RESOURCE_PATH = "/.well-known/oauth-protected-resource/api/mcp";

export function protectedResourceMetadata(origin: string) {
  return {
    resource: resourceFor(origin),
    authorization_servers: [origin],
    scopes_supported: [SCOPE],
    bearer_methods_supported: ["header"],
    resource_name: "gitstats",
    resource_documentation: `${origin}/docs#mcp`,
  };
}

export function authServerMetadata(origin: string) {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/api/oauth/token`,
    registration_endpoint: `${origin}/api/oauth/register`,
    scopes_supported: [SCOPE],
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_basic", "client_secret_post"],
    code_challenge_methods_supported: ["S256"],
    client_id_metadata_document_supported: true,
    authorization_response_iss_parameter_supported: true,
    service_documentation: `${origin}/docs#mcp`,
  };
}

/** Metadata and token endpoints are called from browser-based clients too (MCP Inspector). */
export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, MCP-Protocol-Version",
  "Access-Control-Max-Age": "86400",
};

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function isLoopback(url: URL): boolean {
  return url.protocol === "http:" && LOOPBACK.has(url.hostname);
}

/** Redirect URIs must be HTTPS or a loopback address, with no fragment. */
export function acceptableRedirect(value: string): boolean {
  const url = parseUrl(value);
  return url !== null && url.hash === "" && (url.protocol === "https:" || isLoopback(url));
}

/**
 * Exact match, except that a loopback redirect ignores the port (RFC 8252 §7.3): a native app such as
 * Claude Code listens on whatever port it got and registers `http://localhost/callback`.
 */
function redirectMatches(registered: string[], requested: string): boolean {
  if (registered.includes(requested)) return true;
  const want = parseUrl(requested);
  if (!want || !isLoopback(want)) return false;
  return registered.some((r) => {
    const have = parseUrl(r);
    return have !== null && isLoopback(have) && have.hostname === want.hostname && have.pathname === want.pathname && have.search === want.search;
  });
}

export type Client = { clientId: string; name: string; redirectUris: string[]; secretHash: string | null; kind: "dcr" | "cimd" };

/** A client metadata document URL: HTTPS, a real host name and a path (draft-ietf-oauth-client-id-metadata-document). */
function metadataDocumentUrl(clientId: string): URL | null {
  const url = parseUrl(clientId);
  if (!url || url.protocol !== "https:" || url.hash || url.username || url.password || url.pathname === "/") return null;
  // No IP literals and no single-label or local names: the fetch runs from our server.
  if (/^[\d.]+$/.test(url.hostname) || url.hostname.startsWith("[") || !url.hostname.includes(".") || url.hostname.endsWith(".local") || url.hostname.endsWith(".internal")) {
    return null;
  }
  return url;
}

async function fetchClientDocument(url: URL): Promise<{ name: string; redirectUris: string[] } | null> {
  try {
    const res = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(5000), headers: { accept: "application/json" } });
    if (!res.ok) return null;
    const text = await res.text();
    if (text.length > CIMD_MAX_BYTES) return null;
    const doc: unknown = JSON.parse(text);
    if (typeof doc !== "object" || doc === null) return null;
    const { client_id: id, client_name: name, redirect_uris: uris, token_endpoint_auth_method: method } = doc as Record<string, unknown>;
    if (id !== url.href) return null;
    // A document can only describe a public client: there is nowhere to keep its secret.
    if (method !== undefined && method !== "none") return null;
    if (!Array.isArray(uris) || uris.length === 0 || !uris.every((u): u is string => typeof u === "string" && acceptableRedirect(u))) return null;
    return { name: typeof name === "string" && name.trim() ? name.trim().slice(0, 100) : url.hostname, redirectUris: uris };
  } catch {
    return null;
  }
}

/** The client behind a `client_id`: a registered one, or a metadata document read (and cached) now. */
export async function findClient(clientId: string): Promise<Client | null> {
  if (!clientId) return null;
  const [row] = await db.select().from(oauthClients).where(eq(oauthClients.clientId, clientId)).limit(1);
  const docUrl = metadataDocumentUrl(clientId);
  if (!docUrl) return row && row.kind === "dcr" ? row : null;
  if (row && row.fetchedAt.getTime() > Date.now() - CIMD_TTL_MS) return row;
  const doc = await fetchClientDocument(docUrl);
  if (!doc) return row ?? null;
  const values = { clientId, kind: "cimd" as const, name: doc.name, redirectUris: doc.redirectUris, fetchedAt: new Date() };
  const [saved] = await db
    .insert(oauthClients)
    .values(values)
    .onConflictDoUpdate({ target: oauthClients.clientId, set: { name: doc.name, redirectUris: doc.redirectUris, fetchedAt: values.fetchedAt } })
    .returning();
  return saved;
}

export type RegisterResult = { status: number; body: Record<string, unknown> };

/** Dynamic client registration (RFC 7591), kept for clients that do not use a metadata document. */
export async function registerClient(input: unknown): Promise<RegisterResult> {
  const bad = (description: string, error = "invalid_client_metadata"): RegisterResult => ({ status: 400, body: { error, error_description: description } });
  if (typeof input !== "object" || input === null) return bad("expected a JSON object");
  const meta = input as Record<string, unknown>;
  const uris = meta.redirect_uris;
  if (!Array.isArray(uris) || uris.length === 0 || uris.length > 10) return bad("redirect_uris must list 1 to 10 URIs", "invalid_redirect_uri");
  if (!uris.every((u): u is string => typeof u === "string" && acceptableRedirect(u))) return bad("redirect URIs must be https or a loopback address", "invalid_redirect_uri");
  const method = meta.token_endpoint_auth_method ?? "none";
  if (method !== "none" && method !== "client_secret_basic" && method !== "client_secret_post") return bad("unsupported token_endpoint_auth_method");
  const grants = meta.grant_types ?? ["authorization_code", "refresh_token"];
  if (!Array.isArray(grants) || !grants.includes("authorization_code")) return bad("grant_types must include authorization_code");
  const name = typeof meta.client_name === "string" && meta.client_name.trim() ? meta.client_name.trim().slice(0, 100) : "Unnamed app";
  const clientId = `gsc-${newSecret().slice(0, 32)}`;
  const secret = method === "none" ? null : newSecret();
  await db.insert(oauthClients).values({ clientId, kind: "dcr", name, redirectUris: uris, secretHash: secret ? hashToken(secret) : null });
  return {
    status: 201,
    body: {
      client_id: clientId,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      ...(secret ? { client_secret: secret, client_secret_expires_at: 0 } : {}),
      client_name: name,
      redirect_uris: uris,
      token_endpoint_auth_method: method,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      scope: SCOPE,
    },
  };
}

export type AuthorizeParams = Partial<Record<"response_type" | "client_id" | "redirect_uri" | "code_challenge" | "code_challenge_method" | "state" | "scope" | "resource", string>>;

/** A request that can be shown to the member, or why not. Only a `redirect` error may go back to the app. */
export type CheckedAuthorize =
  | { ok: true; client: Client; redirectUri: string; codeChallenge: string; resource: string; state: string | undefined }
  | { ok: false; show: string }
  | { ok: false; redirect: string };

/**
 * Validate an authorization request. The app and its redirect URI are checked first, and until both
 * hold nothing is sent anywhere: an unknown app or a redirect it never registered would make this an
 * open redirect. After that, errors go back to the app as the spec says.
 */
export async function checkAuthorize(params: AuthorizeParams, origin: string): Promise<CheckedAuthorize> {
  const client = await findClient(params.client_id ?? "");
  if (!client) return { ok: false, show: "This app is not registered with gitstats, or its client metadata could not be read." };
  const redirectUri = params.redirect_uri ?? (client.redirectUris.length === 1 ? client.redirectUris[0] : "");
  if (!redirectUri || !redirectMatches(client.redirectUris, redirectUri)) {
    return { ok: false, show: "The app asked to send you back to an address it did not register." };
  }
  const back = (error: string, description: string) => ({ ok: false as const, redirect: withParams(redirectUri, { error, error_description: description, state: params.state, iss: origin }) });
  if (params.response_type !== "code") return back("unsupported_response_type", "only response_type=code is supported");
  if (!params.code_challenge || params.code_challenge_method !== "S256") return back("invalid_request", "PKCE with code_challenge_method=S256 is required");
  if (!/^[A-Za-z0-9_-]{43}$/.test(params.code_challenge)) return back("invalid_request", "code_challenge must be a base64url SHA-256");
  const resource = params.resource ?? resourceFor(origin);
  if (!sameResource(resource, origin)) return back("invalid_target", `the only resource here is ${resourceFor(origin)}`);
  return { ok: true, client, redirectUri, codeChallenge: params.code_challenge, resource: resourceFor(origin), state: params.state };
}

/** RFC 8707 compares the canonical form: scheme and host are case-insensitive, and a trailing slash is the same resource. */
function sameResource(value: string, origin: string): boolean {
  const url = parseUrl(value);
  const ours = new URL(resourceFor(origin));
  return url !== null && url.origin === ours.origin && url.pathname.replace(/\/$/, "") === ours.pathname && url.search === "" && url.hash === "";
}

export function withParams(uri: string, params: Record<string, string | undefined>): string {
  const url = new URL(uri);
  for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.set(k, v);
  return url.toString();
}

/** The consent screen's "allow": a one-use code bound to the app, the redirect and the PKCE challenge. */
export async function issueCode(checked: Extract<CheckedAuthorize, { ok: true }>, userId: number, origin: string): Promise<string> {
  const code = `${CODE_PREFIX}${newSecret()}`;
  await db.insert(oauthCodes).values({
    codeHash: hashToken(code),
    clientId: checked.client.clientId,
    userId,
    redirectUri: checked.redirectUri,
    codeChallenge: checked.codeChallenge,
    scope: SCOPE,
    resource: checked.resource,
    expiresAt: new Date(Date.now() + CODE_TTL_MS),
  });
  return withParams(checked.redirectUri, { code, state: checked.state, iss: origin });
}

export type TokenResult = { status: number; body: Record<string, unknown> };

const tokenError = (error: string, description: string, status = 400): TokenResult => ({ status, body: { error, error_description: description } });

function tokens(access: string, refresh: string): TokenResult {
  return { status: 200, body: { access_token: access, token_type: "Bearer", expires_in: ACCESS_TTL_S, refresh_token: refresh, scope: SCOPE } };
}

function fresh() {
  return {
    access: `${ACCESS_PREFIX}${newSecret()}`,
    refresh: `${REFRESH_PREFIX}${newSecret()}`,
    accessExpiresAt: new Date(Date.now() + ACCESS_TTL_S * 1000),
    refreshExpiresAt: new Date(Date.now() + REFRESH_TTL_MS),
  };
}

function pkceMatches(verifier: string, challenge: string): boolean {
  if (!/^[A-Za-z0-9\-._~]{43,128}$/.test(verifier)) return false;
  return createHash("sha256").update(verifier).digest("base64url") === challenge;
}

/** Client authentication at the token endpoint: public clients send only their id, confidential ones a secret too. */
async function authenticateClient(form: URLSearchParams, authorization: string | null): Promise<Client | TokenResult> {
  let clientId = form.get("client_id") ?? "";
  let secret = form.get("client_secret");
  if (authorization?.startsWith("Basic ")) {
    const [id, pass] = Buffer.from(authorization.slice(6), "base64").toString().split(":");
    clientId = decodeURIComponent(id ?? "");
    secret = decodeURIComponent(pass ?? "");
  }
  const client = await findClient(clientId);
  if (!client) return tokenError("invalid_client", "unknown client", 401);
  if (client.secretHash && (!secret || hashToken(secret) !== client.secretHash)) return tokenError("invalid_client", "client authentication failed", 401);
  return client;
}

/** The token endpoint: `authorization_code` with PKCE, and `refresh_token` with rotation. */
export async function exchange(form: URLSearchParams, authorization: string | null, origin: string): Promise<TokenResult> {
  const grantType = form.get("grant_type");
  if (grantType !== "authorization_code" && grantType !== "refresh_token") return tokenError("unsupported_grant_type", "use authorization_code or refresh_token");
  const client = await authenticateClient(form, authorization);
  if ("status" in client) return client;
  const resource = form.get("resource");
  if (resource !== null && !sameResource(resource, origin)) return tokenError("invalid_target", `the only resource here is ${resourceFor(origin)}`);

  if (grantType === "authorization_code") {
    const code = form.get("code") ?? "";
    // Deleting is redeeming: a code works once, even when two requests race for it.
    const [row] = await db.delete(oauthCodes).where(eq(oauthCodes.codeHash, hashToken(code))).returning();
    if (!row || row.expiresAt < new Date() || row.clientId !== client.clientId) return tokenError("invalid_grant", "the code is unknown, used or expired");
    if (form.get("redirect_uri") !== null && form.get("redirect_uri") !== row.redirectUri) return tokenError("invalid_grant", "redirect_uri does not match the authorization request");
    if (!pkceMatches(form.get("code_verifier") ?? "", row.codeChallenge)) return tokenError("invalid_grant", "code_verifier does not match the code_challenge");
    const t = fresh();
    await db.insert(oauthGrants).values({
      userId: row.userId,
      clientId: client.clientId,
      clientName: client.name,
      redirectHost: new URL(row.redirectUri).host,
      scope: row.scope,
      resource: row.resource,
      accessHash: hashToken(t.access),
      accessExpiresAt: t.accessExpiresAt,
      refreshHash: hashToken(t.refresh),
      refreshExpiresAt: t.refreshExpiresAt,
    });
    return tokens(t.access, t.refresh);
  }

  const old = hashToken(form.get("refresh_token") ?? "");
  const t = fresh();
  // Rotation: the old refresh token stops working in the same statement that issues the new pair.
  const [rotated] = await db
    .update(oauthGrants)
    .set({ accessHash: hashToken(t.access), accessExpiresAt: t.accessExpiresAt, refreshHash: hashToken(t.refresh), refreshExpiresAt: t.refreshExpiresAt })
    .where(and(eq(oauthGrants.refreshHash, old), eq(oauthGrants.clientId, client.clientId), gt(oauthGrants.refreshExpiresAt, new Date())))
    .returning({ id: oauthGrants.id });
  if (!rotated) return tokenError("invalid_grant", "the refresh token is unknown, rotated, revoked or expired");
  return tokens(t.access, t.refresh);
}

/**
 * The member behind an OAuth access token for this resource, or null. Expired tokens come back with
 * their expiry so the MCP auth wrapper answers 401 `invalid_token`.
 */
export async function grantOwner(accessToken: string, origin: string): Promise<{ userId: number; expiresAt: number } | null> {
  const [row] = await db
    .select({ id: oauthGrants.id, userId: oauthGrants.userId, resource: oauthGrants.resource, expiresAt: oauthGrants.accessExpiresAt })
    .from(oauthGrants)
    .where(eq(oauthGrants.accessHash, hashToken(accessToken)))
    .limit(1);
  if (!row || row.resource !== resourceFor(origin)) return null;
  after(() => db.update(oauthGrants).set({ lastUsedAt: new Date() }).where(eq(oauthGrants.id, row.id)));
  return { userId: row.userId, expiresAt: Math.floor(row.expiresAt.getTime() / 1000) };
}

export const isOAuthAccessToken = (token: string) => token.startsWith(ACCESS_PREFIX);

/** Codes nobody redeemed. Called from the nightly job with the device codes. */
export async function purgeExpiredOAuth(): Promise<void> {
  const now = new Date();
  await db.delete(oauthCodes).where(lt(oauthCodes.expiresAt, now));
  await db.delete(oauthGrants).where(lt(oauthGrants.refreshExpiresAt, now));
}
