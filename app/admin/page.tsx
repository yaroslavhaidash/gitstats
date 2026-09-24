import Link from "next/link";
import { DangerConfirm } from "@/components/DangerConfirm";
import { Logo } from "@/components/Logo";
import { ARCHIVE_DAYS } from "@/lib/account";
import { adminOverview, requireAdmin } from "@/lib/admin";
import { behindLatestCli, LATEST_CLI, RELINK_COMMAND } from "@/lib/cli";
import { adminDeleteUser, adminRestoreUser, adminRevokeMachine, adminSnapshotChain, adminSnapshotUser } from "@/lib/actions";
import { fmt, fmtDateTime } from "@/lib/format";
import { FUNNEL_STEPS, funnelDays } from "@/lib/funnel";

export const dynamic = "force-dynamic";

const DONE: Record<string, string> = {
  deleted: `member deleted, restorable from the archive below for ${ARCHIVE_DAYS} days`,
  restored: "member restored",
  revoked: "machine revoked",
  snapshot: "snapshot started for that member",
  chain: "full snapshot chain started",
  mismatch: "nothing happened: the typed name did not match",
  gone: "nothing happened: that archive row is no longer there",
};

/** Which earlier step each funnel step is a share of. New and returning members, and errors, are
 *  all out of the sign-ins started; a first dashboard only happens to a new member. */
const FUNNEL_FROM: Record<string, string> = {
  signin_new: "signin_start",
  signin_returning: "signin_start",
  signin_error: "signin_start",
  first_dashboard: "signin_new",
  cli_linked: "first_dashboard",
  invite_join: "invite_copy",
};

function duration(startedAt: Date, finishedAt: Date | null): string {
  if (!finishedAt) return "running";
  return `${Math.round((finishedAt.getTime() - startedAt.getTime()) / 1000)}s`;
}

function daysLeft(deletedAt: Date): number {
  return Math.max(0, ARCHIVE_DAYS - Math.floor((Date.now() - deletedAt.getTime()) / 86_400_000));
}

export default async function Admin({ searchParams }: { searchParams: Promise<{ done?: string }> }) {
  const admin = await requireAdmin();
  const [{ done }, { totals, capacity, runs, members, crewList, archives, log }, funnel] = await Promise.all([searchParams, adminOverview(), funnelDays(14)]);
  const funnelTotals: Record<string, number> = {};
  for (const d of funnel) for (const [step, n] of Object.entries(d.counts)) funnelTotals[step] = (funnelTotals[step] ?? 0) + n;
  const errorCodes = Object.entries(funnelTotals).filter(([step]) => step.startsWith("signin_error:"));
  return (
    <main className="flex-1">
      <nav className="sticky top-0 z-40 bg-void/90 backdrop-blur-sm border-b-2 border-dark">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Logo href="/dashboard" />
          <div className="hidden md:flex gap-6 font-mono text-sm">
            <a href="#funnel" className="hover:text-alert transition-colors">[FUNNEL]</a>
            <a href="#runs" className="hover:text-alert transition-colors">[RUNS]</a>
            <a href="#members" className="hover:text-alert transition-colors">[MEMBERS]</a>
            <a href="#crews" className="hover:text-alert transition-colors">[CREWS]</a>
            <a href="#archive" className="hover:text-alert transition-colors">[ARCHIVE]</a>
            <a href="#log" className="hover:text-alert transition-colors">[LOG]</a>
          </div>
          <Link href="/dashboard" className="font-mono text-xs border border-silver px-3 py-1 hover:bg-silver hover:text-void transition-colors">
            BOARD
          </Link>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <div className="tag mb-4">ADMIN // {admin.login.toUpperCase()}</div>
        <h1 className="font-sans font-bold text-4xl mb-2">Everything, at once.</h1>
        <p className="font-mono text-xs text-dim mb-10">&gt; every row in the database, the buttons that change one, and the log of every change made here.</p>
        {done && (
          <p className={`font-mono text-xs mb-8 ${done === "mismatch" || done === "gone" ? "text-alert" : "text-green"}`}>&gt; {DONE[done] ?? "done"}</p>
        )}

        <section className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-dark border-2 border-dark mb-12">
          {([
            ["members", totals.members],
            ["repos", totals.repos],
            ["weekly rows", totals.weeklyRows],
            ["crews", totals.crews],
          ] as const).map(([label, value]) => (
            <div key={label} className="bg-void px-4 py-5">
              <div className="font-mono text-xs text-faint uppercase">{label}</div>
              <div className="font-sans font-bold text-3xl mt-1">{fmt(value)}</div>
            </div>
          ))}
        </section>

        <section id="funnel" className="mb-12 scroll-mt-20">
          <h2 className="font-sans font-bold text-xl">Funnel</h2>
          <p className="font-mono text-xs text-faint mt-1 mb-4">
            &gt; last 14 days (UTC), counts only · page views are in Vercel Analytics · % is each step out of the one it follows: new, returning and errors out of started, first dashboard out of new, linked out of first dashboard, joins by invite out of invite links copied or shared
          </p>
          <div className="overflow-x-auto border-2 border-dark">
            <table className="w-full font-mono text-xs">
              <thead className="text-faint uppercase border-b-2 border-dark">
                <tr>
                  <th className="text-left px-3 py-2">day</th>
                  {FUNNEL_STEPS.map((s) => (
                    <th key={s} className="text-right px-3 py-2">{s.replace("_", " ")}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-dark">
                {funnel.map((d) => (
                  <tr key={d.day}>
                    <td className="px-3 py-2 text-faint">{d.day}</td>
                    {FUNNEL_STEPS.map((s) => (
                      <td key={s} className={`px-3 py-2 text-right ${d.counts[s] ? (s === "signin_error" ? "text-alert" : "text-white") : "text-faint"}`}>{d.counts[s] ?? 0}</td>
                    ))}
                  </tr>
                ))}
                <tr className="border-t-2 border-dark">
                  <td className="px-3 py-2 text-faint uppercase">total</td>
                  {FUNNEL_STEPS.map((s) => (
                    <td key={s} className="px-3 py-2 text-right text-white font-bold">{fmt(funnelTotals[s] ?? 0)}</td>
                  ))}
                </tr>
                <tr>
                  <td className="px-3 py-2 text-faint uppercase">%</td>
                  {FUNNEL_STEPS.map((s) => {
                    const from = FUNNEL_FROM[s];
                    const base = from ? funnelTotals[from] ?? 0 : 0;
                    return (
                      <td key={s} className="px-3 py-2 text-right text-dim">{from && base > 0 ? `${Math.round(((funnelTotals[s] ?? 0) / base) * 100)}%` : "—"}</td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
          {errorCodes.length > 0 && (
            <p className="font-mono text-xs text-faint mt-2">
              &gt; errors by kind: {errorCodes.map(([step, n]) => `${step.slice("signin_error:".length)} ${n}`).join(" · ")}
            </p>
          )}
        </section>

        <section id="runs" className="mb-12 scroll-mt-20">
          <div className="flex items-center justify-between mb-4 gap-4">
            <div>
              <h2 className="font-sans font-bold text-xl">Last 10 snapshot runs</h2>
              <p className="font-mono text-xs text-faint mt-1">
                &gt; {capacity.signinsLastHour} sign-in{capacity.signinsLastHour === 1 ? "" : "s"} in the last hour · {capacity.signinsLast24h} in 24h ·
                GitHub quota left {capacity.quotaRemaining === null ? "unknown" : fmt(capacity.quotaRemaining)}
              </p>
            </div>
            <form action={adminSnapshotChain}>
              <button type="submit" className="font-mono text-xs text-faint hover:text-alert transition-colors cursor-pointer">[RUN FULL CHAIN]</button>
            </form>
          </div>
          {runs.length === 0 ? (
            <p className="font-mono text-xs text-faint">&gt; no runs yet</p>
          ) : (
            <div className="overflow-x-auto border-2 border-dark">
              <table className="w-full font-mono text-xs">
                <thead className="text-faint uppercase border-b-2 border-dark">
                  <tr>
                    <th className="text-left px-3 py-2">run</th>
                    <th className="text-left px-3 py-2">kind</th>
                    <th className="text-left px-3 py-2">chain</th>
                    <th className="text-left px-3 py-2">started</th>
                    <th className="text-right px-3 py-2">took</th>
                    <th className="text-right px-3 py-2">users</th>
                    <th className="text-right px-3 py-2">pending</th>
                    <th className="text-right px-3 py-2">repos</th>
                    <th className="text-right px-3 py-2">errors</th>
                    <th className="text-right px-3 py-2">quota left</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-dark">
                  {runs.map((r) => (
                    <tr key={r.id}>
                      <td className="px-3 py-2 text-white">{r.id}</td>
                      <td className="px-3 py-2 text-faint">{r.kind}</td>
                      <td className="px-3 py-2 text-faint">{r.chainId ? r.chainId.slice(0, 8) : "—"}</td>
                      <td className="px-3 py-2">{fmtDateTime(r.startedAt)}</td>
                      <td className="px-3 py-2 text-right">{duration(r.startedAt, r.finishedAt)}</td>
                      <td className="px-3 py-2 text-right">{r.usersProcessed}</td>
                      <td className="px-3 py-2 text-right">{r.usersPending > 0 ? <span className="text-amber">{r.usersPending}</span> : "0"}</td>
                      <td className="px-3 py-2 text-right">{r.reposProcessed}</td>
                      <td className="px-3 py-2 text-right">
                        {r.errors > 0 ? <span className="text-alert">{r.errors}</span> : <span className="text-green">0</span>}
                        {r.retrying > 0 && <span className="text-faint"> +{r.retrying} retrying</span>}
                      </td>
                      <td className="px-3 py-2 text-right text-faint">{r.quotaRemaining === null ? "—" : fmt(r.quotaRemaining)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section id="members" className="mb-12 scroll-mt-20">
          <h2 className="font-sans font-bold text-xl mb-4">Members</h2>
          <ul className="divide-y divide-dark border-2 border-dark font-mono text-sm">
            {members.map((m) => (
              <li key={m.id} className="px-4 py-4">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
                  <span>
                    <Link href={`/dashboard/u/${m.login}`} className="text-white hover:text-alert">{m.login}</Link>
                    <span className="text-xs text-faint ml-2">#{m.id}</span>
                    {m.name && <span className="text-xs text-dim ml-2">{m.name}</span>}
                    <span className="block text-xs text-faint mt-1">
                      joined {fmtDateTime(m.createdAt)} · {m.crews} {m.crews === 1 ? "crew" : "crews"} ·{" "}
                      snapshot {m.lastSnapshotAt ? fmtDateTime(m.lastSnapshotAt) : "never"}
                    </span>
                  </span>
                  <span className="flex items-center gap-4">
                    <form action={adminSnapshotUser}>
                      <input type="hidden" name="id" value={m.id} />
                      <button type="submit" className="font-mono text-xs text-faint hover:text-alert transition-colors cursor-pointer">[SNAPSHOT]</button>
                    </form>
                    <DangerConfirm
                      label="[DELETE]"
                      title={`Delete ${m.login}?`}
                      body={`Every row this member owns goes, and a crew they started passes to whoever joined first. It is copied to the archive first, so you have ${ARCHIVE_DAYS} days to put it back.`}
                      phrase={m.login}
                      id={m.id}
                      action={adminDeleteUser}
                    />
                  </span>
                </div>
                {m.tokenWarnings.map((t) => (
                  <p key={t.label} className="text-xs text-alert mt-2">token {t.label}: {t.lastError}</p>
                ))}
                {m.machines.length === 0 ? (
                  <p className="text-xs text-faint mt-2">no linked computer</p>
                ) : (
                  <ul className="mt-2 grid gap-1">
                    {m.machines.map((mach) => (
                      <li key={mach.id} className="text-xs flex flex-wrap items-baseline justify-between gap-x-4">
                        <span>
                          <span className="text-dim">{mach.machine}</span>
                          <span className="text-faint ml-2">{mach.cliVersion ? `v${mach.cliVersion}` : "version unknown"}</span>
                          {behindLatestCli(mach.cliVersion) && <span className="text-amber ml-2">behind {LATEST_CLI} · needs <code>{RELINK_COMMAND}</code> once</span>}
                          {mach.lastSyncError ? (
                            <span className="text-alert ml-2">last sync failed: {mach.lastSyncError}</span>
                          ) : mach.lastSyncAt ? (
                            <span className="text-green ml-2">synced {fmtDateTime(mach.lastSyncAt)}</span>
                          ) : (
                            <span className="text-faint ml-2">never synced</span>
                          )}
                        </span>
                        <DangerConfirm
                          label="[REVOKE]"
                          title={`Revoke ${mach.machine}?`}
                          body={`${m.login} will have to link this computer again with a fresh device code. The numbers it has already uploaded stay.`}
                          phrase={mach.machine}
                          id={mach.id}
                          action={adminRevokeMachine}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </section>

        <section id="crews" className="mb-12 scroll-mt-20">
          <h2 className="font-sans font-bold text-xl mb-4">Crews</h2>
          {crewList.length === 0 ? (
            <p className="font-mono text-xs text-faint">&gt; no crews yet</p>
          ) : (
            <ul className="divide-y divide-dark border-2 border-dark font-mono text-sm">
              {crewList.map((c) => (
                <li key={c.id} className="px-4 py-3 flex flex-wrap items-baseline justify-between gap-x-4">
                  <span>
                    <Link href={`/dashboard/c/${c.code}`} className="text-white hover:text-alert">{c.name}</Link>
                    <span className="text-xs text-faint ml-2">{c.code}</span>
                  </span>
                  <span className="text-xs text-dim">
                    {c.members} {c.members === 1 ? "member" : "members"} · created by {c.createdBy}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section id="archive" className="mb-12 scroll-mt-20">
          <h2 className="font-sans font-bold text-xl mb-1">Deleted members</h2>
          <p className="font-mono text-xs text-faint mb-4">&gt; kept for {ARCHIVE_DAYS} days after a delete, then dropped by the nightly job.</p>
          {archives.length === 0 ? (
            <p className="font-mono text-xs text-faint">&gt; nothing archived</p>
          ) : (
            <ul className="divide-y divide-dark border-2 border-dark font-mono text-sm">
              {archives.map((a) => (
                <li key={a.id} className="px-4 py-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
                  <span>
                    <span className="text-white">{a.login}</span>
                    <span className="text-xs text-faint ml-2">#{a.userId}</span>
                    <span className="block text-xs text-faint mt-1">
                      deleted {fmtDateTime(a.deletedAt)} · {fmt(a.rows)} rows · {daysLeft(a.deletedAt)} days left
                    </span>
                  </span>
                  <form action={adminRestoreUser}>
                    <input type="hidden" name="id" value={a.id} />
                    <button type="submit" className="font-mono text-xs text-faint hover:text-alert transition-colors cursor-pointer">[RESTORE]</button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section id="log" className="scroll-mt-20">
          <h2 className="font-sans font-bold text-xl mb-1">Admin log</h2>
          <p className="font-mono text-xs text-faint mb-4">&gt; the last 50 changes made from this page.</p>
          {log.length === 0 ? (
            <p className="font-mono text-xs text-faint">&gt; nothing yet</p>
          ) : (
            <div className="overflow-x-auto border-2 border-dark">
              <table className="w-full font-mono text-xs">
                <thead className="text-faint uppercase border-b-2 border-dark">
                  <tr>
                    <th className="text-left px-3 py-2">when</th>
                    <th className="text-left px-3 py-2">who</th>
                    <th className="text-left px-3 py-2">action</th>
                    <th className="text-left px-3 py-2">target</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-dark">
                  {log.map((row) => (
                    <tr key={row.id}>
                      <td className="px-3 py-2 whitespace-nowrap">{fmtDateTime(row.at)}</td>
                      <td className="px-3 py-2 text-dim">{row.who}</td>
                      <td className={`px-3 py-2 ${row.action === "delete_user" || row.action === "revoke_machine" ? "text-alert" : "text-white"}`}>
                        {row.action.replace("_", " ")}
                      </td>
                      <td className="px-3 py-2 text-dim">{row.target}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
