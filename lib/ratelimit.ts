/**
 * A token bucket per key, held in this instance's memory.
 *
 * Fluid Compute runs several instances and recycles them, so a caller spread across instances gets
 * roughly this budget per instance, and a cold start hands out a full bucket. That is fine: this
 * exists to stop a runaway loop or a bored friend hammering the CLI endpoints, not to be an
 * authority on request counts. Nothing here is security.
 */

export type Limit = { capacity: number; windowMs: number };

export const LIMITS = {
  /** `gitstats link` asks for a device code. */
  device: { capacity: 10, windowMs: 60_000 },
  /** The CLI polls this every 3s while the user confirms in the browser. */
  poll: { capacity: 60, windowMs: 60_000 },
  /** A scheduled sync runs every 6 hours; six an hour is already generous. */
  ingest: { capacity: 6, windowMs: 3_600_000 },
  unlink: { capacity: 6, windowMs: 3_600_000 },
  /** Ingest and unlink per address, spent before the token lookup: made-up tokens each get a fresh
   *  per-token bucket, so this is what bounds them. Sized for a household or office of machines. */
  cliIp: { capacity: 60, windowMs: 3_600_000 },
  /** `/gh/<login>` pages that need a GitHub call, per visitor; cached ones are free. */
  handle: { capacity: 30, windowMs: 3_600_000 },
  /** The same across everyone, keyed by one constant, so a crawl cannot spend the server token's hour. */
  handleGlobal: { capacity: 300, windowMs: 3_600_000 },
  /** MCP requests per personal token. */
  mcp: { capacity: 60, windowMs: 60_000 },
  /** MCP requests per address, spent before the token lookup, for the same reason as `cliIp`. */
  mcpIp: { capacity: 300, windowMs: 60_000 },
  /** Kudos given or taken back, per giver. */
  kudos: { capacity: 60, windowMs: 3_600_000 },
} as const satisfies Record<string, Limit>;

export type LimitName = keyof typeof LIMITS;

type Bucket = { tokens: number; last: number };

const buckets = new Map<string, Bucket>();
/** Past this the map is swept, then dropped wholesale if the sweep did not help. */
const MAX_KEYS = 10_000;

function sweep(now: number): void {
  for (const [key, b] of buckets) {
    const limit = LIMITS[key.slice(0, key.indexOf(":")) as LimitName];
    if (limit && now - b.last > limit.windowMs) buckets.delete(key);
  }
  if (buckets.size > MAX_KEYS) buckets.clear();
}

export type RateResult = { ok: true } | { ok: false; retryAfter: number };

/** Spends one token for `key` under `name`; `retryAfter` is whole seconds until the next one. */
export function rateLimit(name: LimitName, key: string, now = Date.now()): RateResult {
  const limit = LIMITS[name];
  if (buckets.size > MAX_KEYS) sweep(now);
  const id = `${name}:${key}`;
  const bucket = buckets.get(id) ?? { tokens: limit.capacity, last: now };
  const refill = ((now - bucket.last) / limit.windowMs) * limit.capacity;
  const tokens = Math.min(limit.capacity, bucket.tokens + refill);
  if (tokens < 1) {
    buckets.set(id, { tokens, last: now });
    return { ok: false, retryAfter: Math.max(1, Math.ceil(((1 - tokens) / limit.capacity) * (limit.windowMs / 1000))) };
  }
  buckets.set(id, { tokens: tokens - 1, last: now });
  return { ok: true };
}

/** The caller's address as the proxy reports it; one shared key when there is no header to read. */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}
