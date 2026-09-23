import { neon, neonConfig } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema";

type Db = NeonHttpDatabase<typeof schema>;

/** How long to wait before each retry; one more attempt than there are delays. */
const RETRY_DELAYS_MS = [200, 600, 1500];

/** A response that says "not now" rather than "no": the gateway, the compute waking, or a rate limit. */
function retryable(status: number): boolean {
  return status === 429 || status >= 500;
}

/**
 * Neon answers a failed statement with JSON carrying the Postgres code. A 502 from the proxy is HTML
 * instead, so there is nothing to report — the status alone is the whole story there.
 */
async function neonCode(response: Response): Promise<string> {
  try {
    const body: unknown = await response.clone().json();
    if (body !== null && typeof body === "object" && "code" in body && typeof body.code === "string") return body.code;
  } catch {
    return "none";
  }
  return "none";
}

/**
 * One transient failure used to take a whole page down. The HTTP driver does not retry, pages open
 * five or more queries at once, and a compute waking from auto-suspend can refuse the first of them —
 * so a single blip threw during render, after the shell had already been flushed to the browser, and
 * the response was cut off mid-stream. Reloading "fixed" it because the second attempt found the
 * database awake.
 *
 * A refused connection and a 503 are the same event seen from either side of the gateway, so both are
 * retried, along with 429. A 4xx is the caller's fault and repeating it would only waste the wait.
 * Reads are idempotent; the writes on this path are upserts and recounts, which a repeated statement
 * leaves where it was.
 *
 * One line is logged per request that had to retry, whatever the outcome, so the logs answer how often
 * this happens without a line per attempt drowning them.
 */
neonConfig.fetchFunction = async (input: string, init: RequestInit): Promise<Response> => {
  let first = "";
  let thrown: unknown;
  let last: Response | null = null;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt - 1]));
    try {
      const response = await fetch(input, init);
      if (!retryable(response.status)) {
        if (first) console.warn(`[db-retry] ${first} attempts=${attempt + 1} outcome=${response.status}`);
        return response;
      }
      last = response;
      first ||= `status=${response.status} code=${await neonCode(response)}`;
    } catch (error) {
      thrown = error;
      last = null;
      first ||= `status=none code=${error instanceof Error ? error.name : "unknown"}`;
    }
  }
  console.warn(`[db-retry] ${first} attempts=${RETRY_DELAYS_MS.length + 1} outcome=gave-up`);
  if (last) return last;
  throw thrown;
};

let instance: Db | null = null;

function connect(): Db {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return drizzle(neon(url), { schema });
}

/** Connects on first use so that `next build` can import route modules without a database. */
export const db: Db = new Proxy({} as Db, {
  get(_target, prop) {
    instance ??= connect();
    const value: unknown = Reflect.get(instance, prop);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});
