import { createHash, randomBytes } from "node:crypto";
import { and, eq, lt, sql } from "drizzle-orm";
import { decode } from "next-auth/jwt";
import { headers } from "next/headers";
import { db } from "@/db";
import { crews, leads, lookedUpHandles, users, visitEvents, visitSalts, visits, type VisitEventKind } from "@/db/schema";
import { isAdmin } from "./admin";
import { getHandle } from "./handle";

/**
 * Visitor journeys without cookies. A visitor is sha256(today's salt + IP + user agent): the same
 * browser is one visitor for one UTC day and a different one tomorrow, and neither the IP nor the
 * user agent is stored. Nothing is recorded outside the production site (local dev and preview
 * deploys share the production database), for a browser sending Global Privacy Control, for a bot,
 * or for a signed-in admin. Every write here swallows its own error: counting a visit must never
 * break the page.
 */

/** How far a visitor-day got, in order; `visits.furthest_step` and `leads.furthest_step` index this. */
export const VISIT_STEPS = ["landed", "demo", "handle typed", "sign-in clicked", "signed in", "computer linked"] as const;

const STEP_OF: Record<VisitEventKind, number> = {
  view: 0,
  demo_view: 1,
  handle_self: 2,
  handle_other: 2,
  signin_click: 3,
  signin_done: 4,
  cli_linked: 5,
};

/** Visits and their events are kept this long; leads and looked-up handles stay. */
export const VISIT_RETENTION_DAYS = 90;

const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|headless|lighthouse|curl|wget|python|go-http|java\/|node-fetch|undici|axios|okhttp|monitor/i;
const MOBILE = /mobi|android|iphone|ipad|ipod/i;

/** `ip` is only for the per-address GitHub budget of a handle check; it is never written anywhere. */
export type Visitor = { id: string; day: string; country: string | null; device: "mobile" | "desktop"; host: string | null; ip: string };

let salt: { day: string; value: string } | null = null;

/** Today's salt, made on the first visit of the UTC day; yesterday's is deleted then. */
async function saltFor(day: string): Promise<string> {
  if (salt?.day === day) return salt.value;
  await db.insert(visitSalts).values({ day, salt: randomBytes(32).toString("hex") }).onConflictDoNothing();
  await db.delete(visitSalts).where(lt(visitSalts.day, day));
  const [row] = await db.select({ salt: visitSalts.salt }).from(visitSalts).where(eq(visitSalts.day, day));
  salt = { day, value: row.salt };
  return row.salt;
}

const SESSION_COOKIES = ["__Secure-authjs.session-token", "authjs.session-token"];

/**
 * Whether the request carries an admin's session, read from the session cookie the way `proxy.ts`
 * reads it: this also runs inside the Auth.js callback, where calling `auth()` is not an option.
 */
async function adminSession(h: Headers): Promise<boolean> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return false;
  const jar = new Map((h.get("cookie") ?? "").split(";").map((c) => [c.slice(0, c.indexOf("=")).trim(), c.slice(c.indexOf("=") + 1).trim()]));
  for (const name of SESSION_COOKIES) {
    const raw = jar.get(name);
    if (!raw) continue;
    try {
      const token = await decode({ token: raw, secret, salt: name });
      if (typeof token?.uid === "number") return isAdmin(token.uid);
    } catch {
      // An unreadable cookie is no session.
    }
  }
  return false;
}

const PRODUCTION_HOSTS = new Set(["gitstats.org", "www.gitstats.org"]);

/** This request's visitor, or null when it must not be counted (not production, GPC, a bot, no user agent, an admin). */
export async function visitorFrom(h: Headers): Promise<Visitor | null> {
  if (process.env.VERCEL_ENV !== "production" || !PRODUCTION_HOSTS.has(h.get("host") ?? "")) return null;
  const ua = h.get("user-agent") ?? "";
  if (h.get("sec-gpc") === "1" || !ua || BOT.test(ua) || (await adminSession(h))) return null;
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  const day = new Date().toISOString().slice(0, 10);
  const id = createHash("sha256").update(`${await saltFor(day)}|${ip}|${ua}`).digest("hex").slice(0, 32);
  return { id, day, country: h.get("x-vercel-ip-country"), device: MOBILE.test(ua) ? "mobile" : "desktop", host: h.get("host"), ip };
}

/** The visitor behind the current server action, page or route handler. */
export async function currentVisitor(): Promise<Visitor | null> {
  try {
    return await visitorFrom(new Headers(await headers()));
  } catch (e) {
    console.error("[visits] no visitor:", e);
    return null;
  }
}

/** The referring URL without its query string or fragment; null for our own pages and junk. */
function cleanReferrer(ref: string | undefined, host: string | null): string | null {
  if (!ref) return null;
  try {
    const url = new URL(ref);
    if (url.host === host || (url.protocol !== "http:" && url.protocol !== "https:")) return null;
    return `${url.origin}${url.pathname}`;
  } catch {
    return null;
  }
}

export type Landing = { referrer?: string; utmSource?: string | null; utmMedium?: string | null; utmCampaign?: string | null };

const clip = (s: string | null | undefined, n = 200) => (s ? s.slice(0, n) : null);

/** The same visitor, kind and path again within this window is the same event (a double submit, a reload). */
const DUPLICATE_WINDOW = "5 seconds";

/**
 * One event on a visitor-day: opens the visit on its first event (where it landed and came from),
 * moves `last_at` and the furthest step on every later one, and carries the step to the visit's lead.
 * Returns false when it was a repeat inside `DUPLICATE_WINDOW`, or could not be recorded; a repeat
 * changes nothing. The advisory lock makes two concurrent requests take turns, so the second one's
 * check sees the first one's row (the batch is one transaction, each statement a fresh snapshot).
 */
export async function recordEvent(v: Visitor, kind: VisitEventKind, path: string, extra: { from?: string; landing?: Landing } = {}): Promise<boolean> {
  try {
    const step = STEP_OF[kind];
    const landing = extra.landing ?? {};
    const at = clip(path, 300) ?? "/";
    const [, inserted] = await db.batch([
      db.execute(sql`select pg_advisory_xact_lock(hashtext(${`visit|${v.id}|${kind}|${at}`}))`),
      db.execute(sql`
        insert into ${visitEvents} (visitor_id, day, path, kind, "from")
        select ${v.id}, ${v.day}, ${at}, ${kind}, ${clip(extra.from, 40)}
        where not exists (
          select 1 from ${visitEvents} e where e.visitor_id = ${v.id} and e.day = ${v.day} and e.kind = ${kind} and e.path = ${at}
            and e.at > now() - ${DUPLICATE_WINDOW}::interval
        )
        returning 1
      `),
    ]);
    if (inserted.rows.length === 0) return false;
    await db
      .insert(visits)
      .values({
        visitorId: v.id,
        day: v.day,
        landingPath: at,
        referrer: clip(cleanReferrer(landing.referrer, v.host), 500),
        utmSource: clip(landing.utmSource),
        utmMedium: clip(landing.utmMedium),
        utmCampaign: clip(landing.utmCampaign),
        country: v.country,
        device: v.device,
        furthestStep: step,
      })
      .onConflictDoUpdate({
        target: [visits.visitorId, visits.day],
        set: { lastAt: sql`now()`, furthestStep: sql`greatest(${visits.furthestStep}, ${step})` },
      });
    await db.execute(sql`
      update ${leads} set furthest_step = greatest(${leads.furthestStep}, ${step}), last_seen = now()
      from ${visits} where ${visits.visitorId} = ${v.id} and ${visits.day} = ${v.day} and ${leads.login} = ${visits.leadLogin}
    `);
    return true;
  } catch (e) {
    console.error(`[visits] could not record ${kind}:`, e);
    return false;
  }
}

/** First path segments that are pages; anything else is a 404 and not part of a journey. */
const PAGES = new Set(["", "dashboard", "demo", "gh", "vs", "docs", "privacy", "changelog", "blog", "widget", "join", "link", "s", "oauth"]);

/**
 * Whether a viewed path is a page that exists: a known route, and for a member's page, a crew board
 * or an invite, an account or crew that is still there. A deleted account's path is not recorded.
 */
export async function livePath(path: string): Promise<boolean> {
  const [, first = "", second, third] = path.split("/");
  if (!PAGES.has(first)) return false;
  const id = third ? decodeURIComponent(third) : "";
  if (first === "dashboard" && second === "u" && id) {
    const [row] = await db.select({ id: users.id }).from(users).where(sql`lower(${users.githubLogin}) = lower(${id})`).limit(1);
    return Boolean(row);
  }
  const code = first === "join" ? (second ? decodeURIComponent(second) : "") : first === "dashboard" && second === "c" ? id : "";
  if (code) {
    const [row] = await db.select({ id: crews.id }).from(crews).where(sql`upper(${crews.code}) = upper(${code})`).limit(1);
    return Boolean(row);
  }
  return true;
}

/** A handle that is a real GitHub account: a member, or one GitHub answered for. */
async function realHandle(login: string, ip: string): Promise<boolean> {
  const [member] = await db.select({ id: users.id }).from(users).where(sql`lower(${users.githubLogin}) = lower(${login})`).limit(1);
  if (member) return true;
  return (await getHandle(login, ip)).status === "ok";
}

/**
 * A handle typed into a box that asks for your own. The first one of a visitor-day makes them a
 * lead; any other handle they type after that is someone they compared against, and goes to
 * `looked_up_handles` under that lead instead. Unknown handles are not recorded at all.
 */
export async function recordTypedHandle(v: Visitor, login: string, path: string): Promise<void> {
  try {
    if (!(await realHandle(login, v.ip))) return;
    const [visit] = await db
      .select({ lead: visits.leadLogin })
      .from(visits)
      .where(and(eq(visits.visitorId, v.id), eq(visits.day, v.day)));
    const lead = visit?.lead ?? null;
    const self = lead === null || lead.toLowerCase() === login.toLowerCase();
    if (!(await recordEvent(v, self ? "handle_self" : "handle_other", path))) return;
    if (self && lead === null) {
      const [opened] = await db
        .update(visits)
        .set({ leadLogin: login })
        .where(and(eq(visits.visitorId, v.id), eq(visits.day, v.day)))
        .returning({ referrer: visits.referrer, landing: visits.landingPath, step: visits.furthestStep });
      await db
        .insert(leads)
        .values({
          login,
          firstReferrer: opened.referrer,
          firstLanding: opened.landing,
          furthestStep: opened.step,
          becameMemberAt: sql`(select created_at from ${users} where lower(github_login) = lower(${login}))`,
        })
        .onConflictDoUpdate({
          target: leads.login,
          set: { lastSeen: sql`now()`, visits: sql`${leads.visits} + 1`, furthestStep: sql`greatest(${leads.furthestStep}, ${opened.step})` },
        });
    } else if (!self) {
      await db
        .insert(lookedUpHandles)
        .values({ login, byLeads: sql`array[${lead}]::citext[]` })
        .onConflictDoUpdate({
          target: lookedUpHandles.login,
          set: {
            lastSeen: sql`now()`,
            lookups: sql`${lookedUpHandles.lookups} + 1`,
            byLeads: sql`case when ${lead}::citext = any(${lookedUpHandles.byLeads}) then ${lookedUpHandles.byLeads} else array_append(${lookedUpHandles.byLeads}, ${lead}::citext) end`,
          },
        });
    }
  } catch (e) {
    console.error("[visits] could not record a typed handle:", e);
  }
}

/**
 * A handle a signed-in member typed. Members are never leads: the handle goes to
 * `looked_up_handles` under the member's login, and the visit gets a `handle_other`.
 */
export async function recordMemberLookup(v: Visitor, login: string, member: string, path: string): Promise<void> {
  try {
    if (login.toLowerCase() === member.toLowerCase() || !(await realHandle(login, v.ip))) return;
    if (!(await recordEvent(v, "handle_other", path))) return;
    await db
      .insert(lookedUpHandles)
      .values({ login, byLeads: sql`array[${member}]::citext[]` })
      .onConflictDoUpdate({
        target: lookedUpHandles.login,
        set: {
          lastSeen: sql`now()`,
          lookups: sql`${lookedUpHandles.lookups} + 1`,
          byLeads: sql`case when ${member}::citext = any(${lookedUpHandles.byLeads}) then ${lookedUpHandles.byLeads} else array_append(${lookedUpHandles.byLeads}, ${member}::citext) end`,
        },
      });
  } catch (e) {
    console.error("[visits] could not record a member's lookup:", e);
  }
}

/** The handle this visitor typed as their own today, if they did; read only, nothing is recorded. */
export async function visitorLead(): Promise<string | null> {
  const v = await currentVisitor();
  if (!v) return null;
  try {
    const [visit] = await db
      .select({ lead: visits.leadLogin })
      .from(visits)
      .where(and(eq(visits.visitorId, v.id), eq(visits.day, v.day)));
    return visit?.lead ?? null;
  } catch (e) {
    console.error("[visits] could not read the lead:", e);
    return null;
  }
}

/** A finished sign-in: the visit gets the account, and a lead with that login became a member. */
export async function recordSignIn(v: Visitor | null, userId: number, login: string): Promise<void> {
  try {
    // The admin signing in is not a visitor; their browsing is never recorded either.
    if (v && !(await isAdmin(userId))) {
      await recordEvent(v, "signin_done", "/api/auth/callback/github");
      await db.update(visits).set({ userId }).where(and(eq(visits.visitorId, v.id), eq(visits.day, v.day)));
    }
    await db.update(leads).set({ becameMemberAt: sql`coalesce(${leads.becameMemberAt}, now())` }).where(eq(leads.login, login));
  } catch (e) {
    console.error("[visits] could not record a sign-in:", e);
  }
}

/** Nightly: visits and events past retention go; leads and looked-up handles are kept. */
export async function purgeOldVisits(): Promise<number> {
  const cutoff = sql`(now() at time zone 'utc')::date - ${VISIT_RETENTION_DAYS}::int`;
  await db.delete(visitEvents).where(lt(visitEvents.day, cutoff));
  const gone = await db.delete(visits).where(lt(visits.day, cutoff)).returning({ day: visits.day });
  return gone.length;
}

export type VisitFilter = "engaged" | "all" | "stopped" | "leads";

export type VisitRow = {
  visitorId: string;
  day: string;
  firstAt: Date;
  country: string | null;
  device: string;
  referrer: string | null;
  utm: string | null;
  furthestStep: number;
  leadLogin: string | null;
  member: boolean;
  events: { at: Date; path: string; kind: VisitEventKind; from: string | null }[];
};

export type SourceRow = { source: string; demoViews: number; signinClicks: number; newAccounts: number };

const LIST_DAYS = 30;
/** Rows per page of each /admin visitor table. */
export const PAGE_ROWS = 50;

/** 1-based page of each paginated table: visitor-days, leads, looked-up handles. */
export type VisitorPages = { visits: number; leads: number; lookedUp: number };

/** One page of a list fetched with one row of lookahead, so the pager knows whether there is an older page. */
function page<T>(rows: T[]): { rows: T[]; more: boolean } {
  return { rows: rows.slice(0, PAGE_ROWS), more: rows.length > PAGE_ROWS };
}
const offset = (n: number) => (n - 1) * PAGE_ROWS;
/** Days in the per-day count lines above the Visitors table. */
const DAY_LINES = 7;

/** /admin "Visitors": visitor-days, leads, looked-up handles and the per-source funnel, last 30 days. */
export async function visitorsOverview(filter: VisitFilter, pages: VisitorPages) {
  const since = sql`(now() at time zone 'utc')::date - ${LIST_DAYS - 1}::int`;
  // Engaged: anything beyond a single view of the landing page.
  const engaged = sql`exists (select 1 from ${visitEvents} e where e.visitor_id = v.visitor_id and e.day = v.day and not (e.kind = 'view' and e.path = '/'))
    or (select count(*) from ${visitEvents} e where e.visitor_id = v.visitor_id and e.day = v.day) > 1`;
  const where =
    filter === "engaged"
      ? sql`v.day >= ${since} and (${engaged})`
      : filter === "stopped"
      ? sql`v.day >= ${since} and v.furthest_step < 4`
      : filter === "leads"
        ? sql`v.day >= ${since} and v.lead_login is not null`
        : sql`v.day >= ${since}`;
  // A new account is a sign-in on this visit by someone whose account did not exist when it began.
  const newAccount = sql`(v.user_id is not null and exists (select 1 from ${users} u where u.id = v.user_id and u.created_at >= v.first_at))`;
  const [list, leadRows, lookedUp, byFrom, byHost, days] = await Promise.all([
    db.execute<{
      visitor_id: string;
      day: string;
      first_at: string;
      country: string | null;
      device: string;
      referrer: string | null;
      utm: string | null;
      furthest_step: number;
      lead_login: string | null;
      member: boolean;
      events: { at: string; path: string; kind: VisitEventKind; from: string | null }[];
    }>(sql`
      select v.visitor_id, v.day::text as day, v.first_at, v.country, v.device, v.referrer,
        nullif(concat_ws(' / ', v.utm_source, v.utm_medium, v.utm_campaign), '') as utm,
        v.furthest_step, v.lead_login::text as lead_login, v.user_id is not null as member,
        coalesce((select jsonb_agg(jsonb_build_object('at', e.at, 'path', e.path, 'kind', e.kind, 'from', e."from") order by e.at)
          from ${visitEvents} e where e.visitor_id = v.visitor_id and e.day = v.day), '[]'::jsonb) as events
      from ${visits} v where ${where}
      order by v.first_at desc limit ${PAGE_ROWS + 1} offset ${offset(pages.visits)}
    `),
    db.select().from(leads).orderBy(sql`${leads.lastSeen} desc`).limit(PAGE_ROWS + 1).offset(offset(pages.leads)),
    db
      .select({ login: lookedUpHandles.login, lookups: lookedUpHandles.lookups, lastSeen: lookedUpHandles.lastSeen, byLeads: sql<string>`array_to_string(${lookedUpHandles.byLeads}, ', ')` })
      .from(lookedUpHandles)
      .orderBy(sql`${lookedUpHandles.lastSeen} desc`)
      .limit(PAGE_ROWS + 1)
      .offset(offset(pages.lookedUp)),
    db.execute<{ source: string; signin_clicks: number; new_accounts: number }>(sql`
      with clicks as (select e."from", e.visitor_id, e.day, e.at from ${visitEvents} e where e.kind = 'signin_click' and e.day >= ${since}),
      last_click as (select distinct on (visitor_id, day) visitor_id, day, "from" from clicks order by visitor_id, day, at desc)
      select coalesce(c."from", '(none)') as source, count(*)::int as signin_clicks,
        (select count(*)::int from ${visits} v join last_click l on l.visitor_id = v.visitor_id and l.day = v.day
          where l."from" is not distinct from c."from" and ${newAccount}) as new_accounts
      from clicks c group by c."from" order by signin_clicks desc
    `),
    db.execute<{ source: string; demo_views: number; signin_clicks: number; new_accounts: number }>(sql`
      select coalesce(substring(v.referrer from '^https?://([^/]+)'), '(direct)') as source,
        count(*) filter (where e.kind = 'demo_view')::int as demo_views,
        count(*) filter (where e.kind = 'signin_click')::int as signin_clicks,
        count(distinct (v.visitor_id, v.day)) filter (where ${newAccount})::int as new_accounts
      from ${visits} v left join ${visitEvents} e on e.visitor_id = v.visitor_id and e.day = v.day
      where v.day >= ${since}
      group by 1 order by count(distinct (v.visitor_id, v.day)) desc
    `),
    db.execute<{ day: string; visits: number; engaged: number; leads: number; signins: number }>(sql`
      select v.day::text as day, count(*)::int as visits, count(*) filter (where ${engaged})::int as engaged,
        count(*) filter (where v.lead_login is not null)::int as leads,
        count(*) filter (where exists (select 1 from ${visitEvents} e where e.visitor_id = v.visitor_id and e.day = v.day and e.kind = 'signin_done'))::int as signins
      from ${visits} v where v.day >= (now() at time zone 'utc')::date - ${DAY_LINES - 1}::int
      group by v.day order by v.day desc
    `),
  ]);
  const rows: VisitRow[] = list.rows.map((r) => ({
    visitorId: r.visitor_id,
    day: r.day,
    firstAt: new Date(r.first_at),
    country: r.country,
    device: r.device,
    referrer: r.referrer,
    utm: r.utm,
    furthestStep: r.furthest_step,
    leadLogin: r.lead_login,
    member: r.member,
    events: r.events.map((e) => ({ ...e, at: new Date(e.at) })),
  }));
  const sources = (rs: { source: string; demo_views?: number; signin_clicks: number; new_accounts: number }[]): SourceRow[] =>
    rs.map((r) => ({ source: r.source, demoViews: r.demo_views ?? 0, signinClicks: r.signin_clicks, newAccounts: r.new_accounts }));
  return { visits: page(rows), days: days.rows, leads: page(leadRows), lookedUp: page(lookedUp), byFrom: sources(byFrom.rows), byHost: sources(byHost.rows) };
}
