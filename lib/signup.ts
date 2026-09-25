/**
 * Where a new account came from, carried through GitHub's OAuth round trip in a short first-party
 * cookie that only the sign-in button sets. It is the member's own account data, written to their
 * `users` row once and shown in their export, so it is kept whether or not the browser sends GPC.
 */
export const SIGNUP_COOKIE = "gs_signup";
/** Long enough for GitHub's consent screen, short enough not to outlive the attempt. */
export const SIGNUP_COOKIE_SECONDS = 600;

export type SignupSource = { from: string | null; referrerHost: string | null; landingPath: string | null; utmSource: string | null; utmCampaign: string | null };

/** What the button writes: short keys, since it rides on every request for ten minutes. */
export type SignupCookie = { f?: string; r?: string; p?: string; us?: string; uc?: string };

const OWN_HOSTS = new Set(["gitstats.org", "www.gitstats.org", "localhost"]);
const str = (v: unknown, n: number) => (typeof v === "string" && v ? v.slice(0, n) : null);

/** The cookie's value, checked field by field; anything malformed is simply unknown. */
export function parseSignupCookie(raw: string | undefined): SignupSource | null {
  if (!raw) return null;
  let c: SignupCookie;
  try {
    c = JSON.parse(decodeURIComponent(raw));
  } catch {
    return null;
  }
  if (typeof c !== "object" || c === null) return null;
  const from = str(c.f, 40);
  const host = str(c.r, 200)?.toLowerCase() ?? null;
  const path = str(c.p, 300);
  return {
    from: from && /^[a-z0-9_]+$/.test(from) ? from : null,
    referrerHost: host && /^[a-z0-9.-]+$/.test(host) && !OWN_HOSTS.has(host) ? host : null,
    landingPath: path && path.startsWith("/") ? path.split("?")[0] : null,
    utmSource: str(c.us, 200),
    utmCampaign: str(c.uc, 200),
  };
}
