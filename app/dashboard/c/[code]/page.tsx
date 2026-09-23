import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { Confirm } from "@/components/Confirm";
import { CopyText } from "@/components/CopyText";
import { CrewManage } from "@/components/CrewManage";
import { EmptyNote } from "@/components/EmptyNote";
import { LinkComputerNudge } from "@/components/LinkComputerNudge";
import { CrewRace } from "@/components/CrewRace";
import { Leaderboard } from "@/components/Leaderboard";
import { MetricTabs } from "@/components/MetricTabs";
import { MemberDaily } from "@/components/MemberDaily";
import { MemberLines } from "@/components/MemberLines";
import { Overlaps } from "@/components/Overlaps";
import { RangePicker } from "@/components/RangePicker";
import { Section } from "@/components/Section";
import { SkeletonBoard, SkeletonCharts } from "@/components/Skeleton";
import { WindowTabs } from "@/components/WindowTabs";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { cliTokens } from "@/db/schema";
import { crewBoard, crewOverlaps, crewTimelines } from "@/lib/cached";
import { cliUpdateStuck, MIN_CLI_VERSION } from "@/lib/cli";
import { leaveCrewAction } from "@/lib/actions";
import { rankBy } from "@/lib/stats";
import { crewByCode, isMember } from "@/lib/crews";
import { HUES, hue } from "@/lib/palette";
import { daySeriesMode, parseMetric, parseWindow, previousLabel, viewQuery, windowLabel, windowQuery, type Metric, type Window } from "@/lib/window";

/** Post-action confirmations on the manage panel, in the order they are checked. */
const NOTICES = [
  ["renamed", "crew renamed"],
  ["recoded", "new invite code · the old link no longer works"],
  ["removed", "member removed"],
] as const;

type Crew = { id: number; code: string; name: string; createdBy: number };

/**
 * Colour follows the member, not their rank, and the one order that never moves is sign-up order —
 * so a window or metric change never repaints anyone.
 */
function memberHues(rows: { userId: number; login: string }[]) {
  const joined = rows.map((r) => r.userId).sort((a, b) => a - b);
  return rows.map((r) => {
    const slot = joined.indexOf(r.userId);
    return { userId: r.userId, login: r.login, hue: hue(slot), wrapped: slot >= HUES.length };
  });
}

/** The manage panel, the empty note and the table. Its own section, so the charts can fail without it. */
async function Board({
  crew,
  window,
  metric,
  manage,
  query,
  hasMachines,
}: {
  crew: Crew;
  window: Window;
  metric: Metric;
  manage: boolean;
  hasMachines: boolean;
  query: { renamed?: string; recoded?: string; removed?: string; error?: string };
}) {
  const rows = rankBy(await crewBoard(crew.id, window), metric);
  return (
    <>
      {manage && (
        <CrewManage
          code={crew.code}
          name={crew.name}
          ownerId={crew.createdBy}
          members={rows.map((r) => ({ userId: r.userId, login: r.login, name: r.name }))}
          notice={NOTICES.find(([key]) => query[key])?.[1]}
          error={query.error}
          back={`/dashboard/c/${crew.code}?${viewQuery(window, metric)}`}
          window={windowQuery(window)}
        />
      )}
      {rows.length > 0 && rows.every((r) => r.commits === 0) && (
        <EmptyNote>
          nothing counted {windowLabel(window)} yet · public repos land in the nightly snapshot at 03:00 UTC
          {hasMachines ? " · your linked computer syncs daily" : ""}
        </EmptyNote>
      )}
      <Leaderboard rows={rows} linkUsers src={`c:${crew.code}`} beforeLabel={previousLabel(window)} metric={metric} />
    </>
  );
}

/** The race, the two per-member charts and the overlaps: the part of the page that is all queries. */
async function Charts({ crew, window, metric, viewerId }: { crew: Crew; window: Window; metric: Metric; viewerId: number }) {
  // `crewBoard` is the same cached read the board above made, for the member order the series follow.
  const [board, timelines, overlaps] = await Promise.all([
    crewBoard(crew.id, window),
    crewTimelines(crew.id, window),
    crewOverlaps(crew.id, window),
  ]);
  const rows = rankBy(board, metric);
  const members = memberHues(rows);
  // Lines only exist per day where a computer counted them, which is worth saying when there are none.
  const empty = metric === "lines" ? "no lines counted yet · link a computer and they appear here" : "nothing counted yet";
  // True once some of the window's days hold a figure placed from a week rather than counted by a machine.
  const placed = timelines.days.some((d) => d.spreadLines > 0);
  /**
   * Members the day charts can only draw as zero in lines mode: they are active — the merged calendar
   * has their days — but neither source knows any lines for them, so there is nothing even to place
   * across a week. In practice that is a member whose repos have not been through a nightly snapshot
   * yet. A silent zero bar would read as idleness.
   */
  const noLines =
    metric === "lines"
      ? rows
          .filter(
            (r) =>
              timelines.days.some((d) => d.userId === r.userId && d.commits > 0) &&
              !timelines.days.some((d) => d.userId === r.userId && d.lines > 0),
          )
          .map((r) => r.login)
      : [];
  return (
    <>
      <section className="panel p-6 mt-8">
        <h2 className="font-sans font-bold text-lg mb-1">Race · last {timelines.raceWeeks} weeks</h2>
        <p className="font-mono text-xs text-faint mb-4">
          running total of {metric}, one frame per day · plays once, then the slider
          {metric === "lines" ? (placed ? " · days counted, weeks spread over them" : " · counted on linked computers") : ""}
        </p>
        {timelines.days.length === 0 ? (
          <EmptyNote inset>{empty}</EmptyNote>
        ) : (
          <CrewRace rows={timelines.days} members={members} from={timelines.raceFrom} to={timelines.raceTo} metric={metric} />
        )}
        {noLines.length > 0 && (
          <p className="font-mono text-xs text-faint mt-3">
            &gt; no lines yet for {noLines.join(", ")} · nothing they share carries line counts until the nightly snapshot has seen their repos
          </p>
        )}
      </section>

      <div className="grid lg:grid-cols-2 gap-8 mt-8">
        <section className="panel p-6">
          <h2 className="font-sans font-bold text-lg mb-1">Weekly {metric} per member</h2>
          <p className="font-mono text-xs text-faint mb-4">
            last {timelines.weekCount} weeks{members.length > 4 ? " · one row per member, each scaled to its own peak" : " · hover a line to isolate it, click to pin"}
          </p>
          {timelines.weeks.length === 0 ? (
            <EmptyNote inset>nothing counted in the last {timelines.weekCount} weeks</EmptyNote>
          ) : (
            <MemberLines rows={timelines.weeks} members={members} weeks={timelines.weekCount} endSunday={timelines.weekEnd} metric={metric} />
          )}
        </section>
        <section className="panel p-6">
          <h2 className="font-sans font-bold text-lg mb-1">Daily {metric} by member</h2>
          <p className="font-mono text-xs text-faint mb-4">
            {windowLabel(window)}
            {daySeriesMode({ from: timelines.dayFrom, to: timelines.dayTo }) === "weeks" ? " · by week" : ""}
            {metric === "lines" ? (placed ? " · linked computers count the days; GitHub only reports whole weeks" : " · counted on linked computers") : ""}
          </p>
          {timelines.days.length === 0 ? (
            <EmptyNote inset>{empty}</EmptyNote>
          ) : (
            <MemberDaily rows={timelines.days} members={members} from={timelines.dayFrom} to={timelines.dayTo} metric={metric} />
          )}
          {metric === "lines" && placed && (
            <p className="font-mono text-xs text-faint mt-3">
              &gt; the hatched part of a bar is a repo that is not on a linked computer · GitHub reports those by the week, so the week is laid over its
              days in proportion to their own contribution calendar
            </p>
          )}
        </section>
      </div>

      <Overlaps rows={overlaps} viewerId={viewerId} window={window} src={`c:${crew.code}`} />
    </>
  );
}

export default async function CrewBoard({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ w?: string; m?: string; from?: string; to?: string; manage?: string; renamed?: string; recoded?: string; removed?: string; error?: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/");
  const [{ code }, query] = await Promise.all([params, searchParams]);
  const crew = await crewByCode(code.toUpperCase());
  if (!crew || !(await isMember(crew.id, session.user.id))) notFound();
  const window = parseWindow(query);
  const metric = parseMetric(query.m);
  // Opening and closing the manage panel must not throw the reader's selected view away.
  const boardHref = `/dashboard/c/${crew.code}?${viewQuery(window, metric)}`;
  const isAdmin = crew.createdBy === session.user.id;
  const machines = await db
    .select({ cliVersion: cliTokens.cliVersion, lastSyncAt: cliTokens.lastSyncAt, createdAt: cliTokens.createdAt })
    .from(cliTokens)
    .where(eq(cliTokens.userId, session.user.id));
  return (
    <>
      {machines.length === 0 && <LinkComputerNudge />}
      {cliUpdateStuck(machines) && (
        <Link href="/docs#faq" className="flex flex-wrap items-center justify-between gap-3 border-2 border-amber px-4 py-3 mb-8 font-mono text-xs text-amber hover:bg-amber hover:text-void transition-colors">
          <span>&gt; your linked computers are on an older gitstats and have been quiet for days · run <span className="font-bold">gitstats update</span> to get {MIN_CLI_VERSION}</span>
          <span className="font-bold whitespace-nowrap">DOCS →</span>
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
        <div>
          <div className="tag mb-3">CREW // {crew.code}</div>
          <h1 className="font-sans font-bold text-4xl">{crew.name}</h1>
          <p className="font-mono text-xs text-faint mt-2">
            invite: <CopyText text={`${process.env.NEXT_PUBLIC_APP_URL ?? ""}/join/${crew.code}`} className="text-silver text-xs" />
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <MetricTabs current={metric} basePath={`/dashboard/c/${crew.code}`} query={windowQuery(window)} />
          <WindowTabs current={window} basePath={`/dashboard/c/${crew.code}`} query={metric === "lines" ? "" : `&m=${metric}`} />
          <RangePicker current={window} basePath={`/dashboard/c/${crew.code}`} query={metric === "lines" ? "" : `&m=${metric}`} />
          {isAdmin ? (
            <Link href={`${boardHref}&manage=1`} className="font-mono text-xs text-faint hover:text-alert">[MANAGE]</Link>
          ) : (
            <form action={leaveCrewAction}>
              <input type="hidden" name="code" value={crew.code} />
              <Confirm label="[LEAVE]" confirm="[SURE? LEAVE]" />
            </form>
          )}
        </div>
      </div>
      <Section fallback={<SkeletonBoard rows={4} />}>
        <Board crew={crew} window={window} metric={metric} manage={isAdmin && Boolean(query.manage)} query={query} hasMachines={machines.length > 0} />
      </Section>
      <Section fallback={<SkeletonCharts />}>
        <Charts crew={crew} window={window} metric={metric} viewerId={session.user.id} />
      </Section>
    </>
  );
}
