import { createHash, randomBytes } from "node:crypto";
import { and, eq, lt, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { db } from "@/db";
import { leads, lookedUpHandles, users, visitEvents, visitSalts, visits, type VisitEventKind } from "@/db/schema";
import { getHandle } from "./handle";

/**
 * Visitor journeys without cookies. A visitor is sha256(today's salt + IP + user agent): the same
 * browser is one visitor for one UTC day and a different one tomorrow, and neither the IP nor the
 * user agent is stored. Nothing is recorded for a browser sending Global Privacy Control or for a
 * bot. Every write here swallows its own error: counting a visit must never break the page.
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

/** This request's visitor, or null when it must not be counted (GPC, a bot, no user agent). */
export async function visitorFrom(h: Headers): Promise<Visitor | null> {
  const ua = h.get("user-agent") ?? "";
  if (h.get("sec-gpc") === "1" || !ua || BOT.test(ua)) return null;
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

/**
 * One event on a visitor-day: opens the visit on its first event (where it landed and came from),
 * moves `last_at` and the furthest step on every later one, and carries the step to the visit's lead.
 */
export async function recordEvent(v: Visitor, kind: VisitEventKind, path: string, extra: { from?: string; landing?: Landing } = {}): Promise<void> {
  try {
    const step = STEP_OF[kind];
    const landing = extra.landing ?? {};
    await db
      .insert(visits)
      .values({
        visitorId: v.id,
        day: v.day,
        landingPath: clip(path, 300) ?? "/",
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
    await db.insert(visitEvents).values({ visitorId: v.id, day: v.day, path: clip(path, 300) ?? "/", kind, from: clip(extra.from, 40) });
    await db.execute(sql`
      update ${leads} set furthest_step = greatest(${leads.furthestStep}, ${step}), last_seen = now()
      from ${visits} where ${visits.visitorId} = ${v.id} and ${visits.day} = ${v.day} and ${leads.login} = ${visits.leadLogin}
    `);
  } catch (e) {
    console.error(`[visits] could not record ${kind}:`, e);
  }
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
    await recordEvent(v, self ? "handle_self" : "handle_other", path);
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
    if (v) {
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

export type VisitFilter = "all" | "stopped" | "leads";

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
const LIST_ROWS = 200;

/** /admin "Visitors": visitor-days, leads, looked-up handles and the per-source funnel, last 30 days. */
export async function visitorsOverview(filter: VisitFilter) {
  const since = sql`(now() at time zone 'utc')::date - ${LIST_DAYS - 1}::int`;
  const where =
    filter === "stopped"
      ? sql`v.day >= ${since} and v.furthest_step < 4`
      : filter === "leads"
        ? sql`v.day >= ${since} and v.lead_login is not null`
        : sql`v.day >= ${since}`;
  // A new account is a sign-in on this visit by someone whose account did not exist when it began.
  const newAccount = sql`(v.user_id is not null and exists (select 1 from ${users} u where u.id = v.user_id and u.created_at >= v.first_at))`;
  const [list, leadRows, lookedUp, byFrom, byHost] = await Promise.all([
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
      order by v.first_at desc limit ${LIST_ROWS}
    `),
    db.select().from(leads).orderBy(sql`${leads.lastSeen} desc`).limit(LIST_ROWS),
    db
      .select({ login: lookedUpHandles.login, lookups: lookedUpHandles.lookups, lastSeen: lookedUpHandles.lastSeen, byLeads: sql<string>`array_to_string(${lookedUpHandles.byLeads}, ', ')` })
      .from(lookedUpHandles)
      .orderBy(sql`${lookedUpHandles.lastSeen} desc`)
      .limit(LIST_ROWS),
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
  return { rows, leads: leadRows, lookedUp, byFrom: sources(byFrom.rows), byHost: sources(byHost.rows) };
}
