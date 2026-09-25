import Link from "next/link";
import { fmtDateTime } from "@/lib/format";
import { VISIT_STEPS, type SourceRow, type VisitFilter, type VisitorPages, visitorsOverview } from "@/lib/visits";

const FILTERS: [VisitFilter, string][] = [
  ["all", "all"],
  ["engaged", "engaged"],
  ["stopped", "stopped before sign-in"],
  ["leads", "leads only"],
];

const hhmm = (d: Date) => d.toISOString().slice(11, 16);

/** "host/path" without the scheme, the way the visitor saw it in the address bar. */
const shortUrl = (url: string | null) => (url ? url.replace(/^https?:\/\//, "") : "direct");

function Handle({ login }: { login: string }) {
  return (
    <a href={`https://github.com/${login}`} target="_blank" rel="noreferrer" className="text-silver underline hover:text-alert">
      {login}
    </a>
  );
}

/** The /admin URL for a filter and set of pages, pointing at one section. */
function adminHref(filter: VisitFilter, pages: VisitorPages, anchor: string): string {
  const q = new URLSearchParams();
  if (filter !== "all") q.set("v", filter);
  if (pages.visits > 1) q.set("vpage", String(pages.visits));
  if (pages.leads > 1) q.set("lpage", String(pages.leads));
  if (pages.lookedUp > 1) q.set("hpage", String(pages.lookedUp));
  const query = q.toString();
  return `/admin${query ? `?${query}` : ""}#${anchor}`;
}

/** Newer/older links for one table; every other table's page and the filter stay as they are. */
function Pager({ filter, pages, table, anchor, more }: { filter: VisitFilter; pages: VisitorPages; table: keyof VisitorPages; anchor: string; more: boolean }) {
  const current = pages[table];
  if (current === 1 && !more) return null;
  const to = (n: number) => adminHref(filter, { ...pages, [table]: n }, anchor);
  const link = "border-2 border-dark px-3 py-1 hover:border-silver transition-colors";
  return (
    <div className="flex items-center gap-2 my-3 font-mono text-xs">
      {current > 1 ? <Link href={to(current - 1)} className={link}>&larr; newer</Link> : <span className="border-2 border-dark px-3 py-1 text-faint">&larr; newer</span>}
      <span className="text-faint px-2">page {current}</span>
      {more ? <Link href={to(current + 1)} className={link}>older &rarr;</Link> : <span className="border-2 border-dark px-3 py-1 text-faint">older &rarr;</span>}
    </div>
  );
}

function SourceTable({ title, rows, demo }: { title: string; rows: SourceRow[]; demo: boolean }) {
  return (
    <div className="overflow-x-auto border-2 border-dark">
      <table className="w-full font-mono text-xs">
        <thead className="text-faint uppercase border-b-2 border-dark">
          <tr>
            <th className="text-left px-3 py-2">{title}</th>
            <th className="text-right px-3 py-2">demo views</th>
            <th className="text-right px-3 py-2">sign-in clicks</th>
            <th className="text-right px-3 py-2">new accounts</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-dark">
          {rows.length === 0 && (
            <tr>
              <td colSpan={4} className="px-3 py-2 text-faint">nothing yet</td>
            </tr>
          )}
          {rows.map((r) => (
            <tr key={r.source}>
              <td className="px-3 py-2 text-silver">{r.source}</td>
              <td className="px-3 py-2 text-right">{demo ? r.demoViews : "—"}</td>
              <td className="px-3 py-2 text-right">{r.signinClicks}</td>
              <td className={`px-3 py-2 text-right ${r.newAccounts > 0 ? "text-green" : ""}`}>{r.newAccounts}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Visitor journeys, leads and looked-up handles on /admin. */
export async function AdminVisitors({ filter, pages }: { filter: VisitFilter; pages: VisitorPages }) {
  const { visits, days, leads, lookedUp, byFrom, byHost } = await visitorsOverview(filter, pages);
  const rows = visits.rows;
  return (
    <>
      <section id="visitors" className="mb-12 scroll-mt-20">
        <h2 className="font-sans font-bold text-xl">Visitors</h2>
        <p className="font-mono text-xs text-faint mt-1 mb-4">
          &gt; last 30 days, newest first · one row per visitor-day · engaged hides a lone view of / (no cookies: the id changes at 00:00 UTC) · times UTC
        </p>
        <ul className="font-mono text-xs mb-4 space-y-1">
          {days.length === 0 && <li className="text-faint">no visits in the last 7 days</li>}
          {days.map((d) => (
            <li key={d.day}>
              <span className="text-faint">{d.day}</span> · {d.visits} visitor-days · <span className="text-silver">{d.engaged} engaged</span> · {d.leads} leads ·{" "}
              <span className={d.signins > 0 ? "text-green" : ""}>{d.signins} sign-ins</span>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2 mb-4 font-mono text-xs">
          {FILTERS.map(([value, label]) => (
            <Link
              key={value}
              href={adminHref(value, { ...pages, visits: 1 }, "visitors")}
              className={`border-2 px-3 py-1 transition-colors ${value === filter ? "border-silver bg-silver text-void" : "border-dark hover:border-silver"}`}
            >
              {label}
            </Link>
          ))}
        </div>
        <Pager filter={filter} pages={pages} table="visits" anchor="visitors" more={visits.more} />
        <div className="overflow-x-auto border-2 border-dark">
          <table className="w-full font-mono text-xs">
            <thead className="text-faint uppercase border-b-2 border-dark">
              <tr>
                <th className="text-left px-3 py-2">when</th>
                <th className="text-left px-3 py-2">where</th>
                <th className="text-left px-3 py-2">from</th>
                <th className="text-left px-3 py-2">pages</th>
                <th className="text-left px-3 py-2">furthest</th>
                <th className="text-left px-3 py-2">lead</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark align-top">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-2 text-faint">no visits</td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={`${r.visitorId}:${r.day}`}>
                  <td className="px-3 py-2 whitespace-nowrap text-faint">{fmtDateTime(r.firstAt)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{r.country ?? "??"} · {r.device}</td>
                  <td className="px-3 py-2 max-w-[16rem] break-all">
                    <span className="text-silver">{shortUrl(r.referrer)}</span>
                    {r.utm && <span className="block text-faint">utm {r.utm}</span>}
                  </td>
                  <td className="px-3 py-2 min-w-[18rem]">
                    {r.events.map((e, i) => (
                      <span key={i} className="block">
                        <span className="text-faint">{hhmm(e.at)}</span> {e.kind === "view" || e.kind === "demo_view" ? e.path : <span className="text-amber">{e.kind.replace("_", " ")}{e.from ? ` (${e.from})` : ""} {e.path}</span>}
                      </span>
                    ))}
                  </td>
                  <td className={`px-3 py-2 whitespace-nowrap ${r.furthestStep >= 4 ? "text-green" : ""}`}>{VISIT_STEPS[r.furthestStep]}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{r.leadLogin ? <Handle login={r.leadLogin} /> : <span className="text-faint">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pager filter={filter} pages={pages} table="visits" anchor="visitors" more={visits.more} />
      </section>

      <section id="leads" className="mb-12 scroll-mt-20">
        <h2 className="font-sans font-bold text-xl">Leads</h2>
        <p className="font-mono text-xs text-faint mt-1 mb-4">&gt; handles typed as the visitor&apos;s own, on the landing or a compare box · kept after their visits expire</p>
        <Pager filter={filter} pages={pages} table="leads" anchor="leads" more={leads.more} />
        <div className="overflow-x-auto border-2 border-dark">
          <table className="w-full font-mono text-xs">
            <thead className="text-faint uppercase border-b-2 border-dark">
              <tr>
                <th className="text-left px-3 py-2">handle</th>
                <th className="text-left px-3 py-2">first seen</th>
                <th className="text-left px-3 py-2">last seen</th>
                <th className="text-right px-3 py-2">visits</th>
                <th className="text-left px-3 py-2">first from</th>
                <th className="text-left px-3 py-2">furthest</th>
                <th className="text-left px-3 py-2">member</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark">
              {leads.rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-2 text-faint">no leads yet</td>
                </tr>
              )}
              {leads.rows.map((l) => (
                <tr key={l.login}>
                  <td className="px-3 py-2"><Handle login={l.login} /></td>
                  <td className="px-3 py-2 text-faint whitespace-nowrap">{fmtDateTime(l.firstSeen)}</td>
                  <td className="px-3 py-2 text-faint whitespace-nowrap">{fmtDateTime(l.lastSeen)}</td>
                  <td className="px-3 py-2 text-right">{l.visits}</td>
                  <td className="px-3 py-2 break-all">{shortUrl(l.firstReferrer)} <span className="text-faint">→ {l.firstLanding}</span></td>
                  <td className="px-3 py-2 whitespace-nowrap">{VISIT_STEPS[l.furthestStep]}</td>
                  <td className={`px-3 py-2 ${l.becameMemberAt ? "text-green" : "text-faint"}`}>{l.becameMemberAt ? "yes" : "no"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pager filter={filter} pages={pages} table="leads" anchor="leads" more={leads.more} />
      </section>

      <section id="looked-up" className="mb-12 scroll-mt-20">
        <h2 className="font-sans font-bold text-xl">Looked-up handles</h2>
        <p className="font-mono text-xs text-faint mt-1 mb-4">&gt; handles a lead compared against: someone else&apos;s, never a lead themselves</p>
        <Pager filter={filter} pages={pages} table="lookedUp" anchor="looked-up" more={lookedUp.more} />
        <div className="overflow-x-auto border-2 border-dark">
          <table className="w-full font-mono text-xs">
            <thead className="text-faint uppercase border-b-2 border-dark">
              <tr>
                <th className="text-left px-3 py-2">handle</th>
                <th className="text-right px-3 py-2">lookups</th>
                <th className="text-left px-3 py-2">by leads</th>
                <th className="text-left px-3 py-2">last seen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark">
              {lookedUp.rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-2 text-faint">none yet</td>
                </tr>
              )}
              {lookedUp.rows.map((h) => (
                <tr key={h.login}>
                  <td className="px-3 py-2"><Handle login={h.login} /></td>
                  <td className="px-3 py-2 text-right">{h.lookups}</td>
                  <td className="px-3 py-2 text-silver">{h.byLeads}</td>
                  <td className="px-3 py-2 text-faint whitespace-nowrap">{fmtDateTime(h.lastSeen)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pager filter={filter} pages={pages} table="lookedUp" anchor="looked-up" more={lookedUp.more} />
      </section>

      <section id="sources" className="mb-12 scroll-mt-20">
        <h2 className="font-sans font-bold text-xl">Funnel by source</h2>
        <p className="font-mono text-xs text-faint mt-1 mb-4">&gt; last 30 days · a new account counts for the placement of that visit&apos;s last sign-in click</p>
        <div className="grid lg:grid-cols-2 gap-6">
          <SourceTable title="sign-in button" rows={byFrom} demo={false} />
          <SourceTable title="referrer host" rows={byHost} demo />
        </div>
      </section>
    </>
  );
}
