import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CrewRace } from "@/components/CrewRace";
import { EmptyNote } from "@/components/EmptyNote";
import { Leaderboard } from "@/components/Leaderboard";
import { MemberDaily } from "@/components/MemberDaily";
import { MemberLines } from "@/components/MemberLines";
import { MetricTabs } from "@/components/MetricTabs";
import { Overlaps } from "@/components/Overlaps";
import { RangePicker } from "@/components/RangePicker";
import { WindowTabs } from "@/components/WindowTabs";
import { crewBoard, crewOverlaps, crewTimelines } from "@/lib/cached";
import { demoCrew } from "@/lib/demo";
import { HUES, hue } from "@/lib/palette";
import { openGraphFor, SITE_URL } from "@/lib/site";
import { rankBy } from "@/lib/stats";
import { daySeriesMode, parseMetric, parseWindow, previousLabel, windowLabel, windowQuery } from "@/lib/window";

/** Per request: reads the URL. The stats behind it are cached in lib/cached.ts. */
export const instant = false;

export const metadata: Metadata = {
  title: "Demo board",
  description:
    "A live gitstats crew board with generated data: commits, lines added and deleted, streaks, stars and a race between four developers over a year. No sign-in.",
  alternates: { canonical: "/demo" },
  openGraph: openGraphFor(`${SITE_URL}/demo`),
};

/** The crew board as anyone can see it, over a seeded crew: the same components, read-only. */
export default async function DemoBoard({ searchParams }: { searchParams: Promise<{ w?: string; m?: string; from?: string; to?: string }> }) {
  const [query, crew] = await Promise.all([searchParams, demoCrew()]);
  if (!crew) notFound();
  // A cold visitor should land on the whole picture, not on the six days of the current week.
  const window = parseWindow({ ...query, w: query.w ?? "year" });
  const metric = parseMetric(query.m);
  const suffix = metric === "lines" ? "" : `&m=${metric}`;
  const [board, overlaps, timelines] = await Promise.all([crewBoard(crew.id, window), crewOverlaps(crew.id, window), crewTimelines(crew.id, window)]);
  const rows = rankBy(board, metric);
  // Colour follows the member, not the rank, so a window or metric change never repaints anyone.
  const joined = rows.map((r) => r.userId).sort((a, b) => a - b);
  const members = rows.map((r) => {
    const slot = joined.indexOf(r.userId);
    return { userId: r.userId, login: r.login, hue: hue(slot), wrapped: slot >= HUES.length };
  });
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
        <div>
          <div className="tag mb-3">CREW // DEMO</div>
          <h1 className="font-sans font-bold text-4xl">{crew.name}</h1>
          <p className="font-mono text-xs text-faint mt-2">four invented developers, two years of invented commits</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <MetricTabs current={metric} basePath="/demo" query={windowQuery(window)} />
          <WindowTabs current={window} basePath="/demo" query={suffix} />
          <RangePicker current={window} basePath="/demo" query={suffix} />
        </div>
      </div>

      {/* A visitor on their own is asking what their page would look like, so that is one click away. */}
      {rows[0] && (
        <Link
          href={`/demo/u/${rows[0].login}${window.kind === "preset" ? `?w=${window.value}` : ""}`}
          className="flex flex-wrap items-center justify-between gap-3 border-2 border-alert px-4 py-3 mb-8 font-mono text-xs hover:bg-alert hover:text-void transition-colors"
        >
          <span>&gt; this is a crew board. Your own page is one developer&apos;s view: every chart for {rows[0].login}, alone.</span>
          <span className="font-bold whitespace-nowrap">ONE DEVELOPER&apos;S PAGE →</span>
        </Link>
      )}

      <Leaderboard rows={rows} linkUsers beforeLabel={previousLabel(window)} metric={metric} userBase="/demo/u" />

      <section className="panel p-6 mt-8">
        <h2 className="font-sans font-bold text-lg mb-1">Race · last {timelines.raceWeeks} weeks</h2>
        <p className="font-mono text-xs text-faint mb-4">running total of {metric}, one frame per day · plays once, then the slider</p>
        {timelines.days.length === 0 ? (
          <EmptyNote inset>nothing counted yet</EmptyNote>
        ) : (
          <CrewRace rows={timelines.days} members={members} from={timelines.raceFrom} to={timelines.raceTo} metric={metric} />
        )}
      </section>

      <div className="grid lg:grid-cols-2 gap-8 mt-8">
        <section className="panel p-6">
          <h2 className="font-sans font-bold text-lg mb-1">Weekly {metric} per member</h2>
          <p className="font-mono text-xs text-faint mb-4">
            last {timelines.weekCount} weeks{members.length > 4 ? " · one row per member, each scaled to its own peak" : " · hover a line to isolate it, click to pin"}
          </p>
          <MemberLines rows={timelines.weeks} members={members} weeks={timelines.weekCount} endSunday={timelines.weekEnd} metric={metric} />
        </section>
        <section className="panel p-6">
          <h2 className="font-sans font-bold text-lg mb-1">Daily {metric} by member</h2>
          <p className="font-mono text-xs text-faint mb-4">
            {windowLabel(window)}
            {daySeriesMode({ from: timelines.dayFrom, to: timelines.dayTo }) === "weeks" ? " · by week" : ""}
          </p>
          <MemberDaily rows={timelines.days} members={members} from={timelines.dayFrom} to={timelines.dayTo} metric={metric} />
        </section>
      </div>

      {/* No viewer owns these rows, so every name is unmasked by the crew column of the matrix alone. */}
      <Overlaps rows={overlaps} viewerId={0} window={window} linkRepos={false} />
    </>
  );
}
