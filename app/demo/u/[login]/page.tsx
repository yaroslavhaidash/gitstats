import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DailyLines } from "@/components/DailyLines";
import { EmptyNote } from "@/components/EmptyNote";
import { LanguageShare } from "@/components/LanguageShare";
import { MetricTabs } from "@/components/MetricTabs";
import { MonthBlocks } from "@/components/MonthBlocks";
import { RangePicker } from "@/components/RangePicker";
import { RepoList } from "@/components/RepoList";
import { RepoMix } from "@/components/RepoMix";
import { RepoShare } from "@/components/RepoShare";
import { StatTile } from "@/components/StatTile";
import { WeekdayProfile } from "@/components/WeekdayProfile";
import { WeeklyBars } from "@/components/WeeklyBars";
import { WindowTabs } from "@/components/WindowTabs";
import { YearCalendar } from "@/components/YearCalendar";
import { userStats } from "@/lib/cached";
import { demoMembers } from "@/lib/demo";
import { fmt, pctDelta } from "@/lib/format";
import { openGraphFor, SITE_URL } from "@/lib/site";
import { nameVisible } from "@/lib/stats";
import { dayChartMode, parseMetric, parseWindow, rangeDays, windowLabel, windowQuery, windowRange } from "@/lib/window";

export async function generateMetadata({ params }: { params: Promise<{ login: string }> }): Promise<Metadata> {
  const { login } = await params;
  return {
    title: `${login} · demo`,
    description: `One developer's page on the gitstats demo board: lines per week, a 52-week calendar, lines per day, language share and the repos behind the numbers. Generated data, no sign-in.`,
    alternates: { canonical: `/demo/u/${login}` },
    openGraph: openGraphFor(`${SITE_URL}/demo/u/${login}`),
  };
}

/** One demo member's page: the same components the real personal page uses, read-only. */
export default async function DemoUserPage({
  params,
  searchParams,
}: {
  params: Promise<{ login: string }>;
  searchParams: Promise<{ w?: string; m?: string; from?: string; to?: string }>;
}) {
  const [{ login }, query, members] = await Promise.all([params, searchParams, demoMembers()]);
  const user = members.find((m) => m.login === login);
  if (!user) notFound();
  // A cold visitor should land on the whole picture, not on the six days of the current week.
  const window = parseWindow({ ...query, w: query.w ?? "year" });
  const metric = parseMetric(query.m);
  const suffix = metric === "lines" ? "" : `&m=${metric}`;
  const label = windowLabel(window);
  // A crewmate's view of a demo member: private numbers count, private names show, nothing is owned.
  const { row, before, weeks, chartWeeks, chartEnd, repoRows, dailyLines, languages, year, weekdays, weekdayLines, span, repoWeeks, mixWeeks, mixEnd } =
    await userStats(user.id, window, false, true, "crew");
  const mode = dayChartMode(window);
  const showName = (r: { nodeId: string; isPrivate: boolean }) => nameVisible({ repoNames: "all", hiddenName: false }, r);
  const mixCommits = repoWeeks.reduce((sum, r) => sum + r.commits, 0);
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
        <div className="flex items-center gap-5">
          <Image src={user.avatarUrl} alt="" width={64} height={64} className="border-2 border-silver" unoptimized />
          <div>
            <div className="tag mb-2">DEV // {user.login.toUpperCase()}</div>
            <h1 className="font-sans font-bold text-4xl leading-none">{user.name ?? user.login}</h1>
            <Link href="/demo" className="font-mono text-xs text-faint hover:text-alert mt-2 inline-block">← back to the demo board</Link>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <MetricTabs current={metric} basePath={`/demo/u/${user.login}`} query={windowQuery(window)} />
          <WindowTabs current={window} basePath={`/demo/u/${user.login}`} query={suffix} />
          <RangePicker current={window} basePath={`/demo/u/${user.login}`} query={suffix} />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-[2px] bg-dark border-2 border-dark">
        <StatTile label="commits" value={fmt(row.commits)} delta={pctDelta(row.commits, before?.commits ?? 0)} />
        <StatTile label="added" value={`+${fmt(row.additions)}`} delta={pctDelta(row.additions, before?.additions ?? 0)} tone="green" />
        <StatTile label="deleted" value={`−${fmt(row.deletions)}`} delta={pctDelta(row.deletions, before?.deletions ?? 0)} tone="alert" />
        <StatTile label="active repos" value={String(row.activeRepos)} delta={pctDelta(row.activeRepos, before?.activeRepos ?? 0)} />
        <StatTile label="streak" value={`${row.streak}d`} />
        <StatTile label="stars" value={fmt(row.stars)} sub={row.topLanguage ? `top language · ${row.topLanguage}` : undefined} tone="amber" />
      </div>
      <div className="font-mono text-xs text-faint mt-2 mb-8">
        <p>&gt; percentages compare against the {rangeDays(windowRange(window))} days before this window</p>
      </div>

      <div className="grid lg:grid-cols-[2fr_1fr] gap-8 mb-8">
        <section className="panel p-6">
          <h2 className="font-sans font-bold text-lg mb-1">Lines per week</h2>
          <p className="font-mono text-xs text-faint mb-4">last {chartWeeks} weeks · fixed context, not the selected window</p>
          <WeeklyBars weeks={weeks} totalWeeks={chartWeeks} endSunday={chartEnd} />
        </section>
        <section className="panel p-6">
          <h2 className="font-sans font-bold text-lg mb-4">Last 52 weeks</h2>
          <YearCalendar days={year} label={`${user.login} daily contributions, last 52 weeks`} />
          <p className="font-mono text-xs text-faint mt-4">older half on top, newer half below</p>
        </section>
      </div>

      <section className="panel p-6 mb-8">
        <h2 className="font-sans font-bold text-lg mb-1">Lines per {mode === "months" ? "month" : "day"}</h2>
        <p className="font-mono text-xs text-faint mb-4">{window.kind === "preset" ? `${label} · ${windowLabel({ kind: "range", ...span })}` : label}</p>
        <MonthBlocks rows={dailyLines} from={span.from} to={span.to} mode={mode} today={span.to} />
      </section>

      <section className="panel p-6 mb-8">
        <h2 className="font-sans font-bold text-lg mb-1">{metric === "lines" ? "Lines" : "Commits"} per day · trend</h2>
        <p className="font-mono text-xs text-faint mb-4">{label} · one bar per day · counted on linked computers</p>
        {dailyLines.length === 0 ? (
          <EmptyNote inset>no lines per day {label}</EmptyNote>
        ) : (
          <DailyLines rows={dailyLines} from={span.from} to={span.to} metric={metric} />
        )}
      </section>

      <div className="grid lg:grid-cols-2 gap-8 mb-8">
        <section className="panel p-6">
          <h2 className="font-sans font-bold text-lg mb-1">Language share</h2>
          <p className="font-mono text-xs text-faint mb-4">lines touched {label} · added + deleted on the default branch</p>
          <LanguageShare rows={languages} />
        </section>
        <section className="panel p-6">
          <h2 className="font-sans font-bold text-lg mb-1">Weekday profile</h2>
          <p className="font-mono text-xs text-faint mb-4">
            {metric === "lines" ? `average lines touched per weekday ${label} · added + deleted` : `average commits per weekday ${label}`}
          </p>
          <WeekdayProfile averages={metric === "lines" ? weekdayLines : weekdays} metric={metric} />
        </section>
      </div>

      <div className="grid lg:grid-cols-2 gap-8 mb-8">
        <section className="panel p-6">
          <h2 className="font-sans font-bold text-lg mb-1">Repo mix</h2>
          <p className="font-mono text-xs text-faint mb-4">share of {metric} per repo · last {mixWeeks} weeks</p>
          {mixCommits === 0 ? (
            <EmptyNote inset>nothing on the default branch in the last {mixWeeks} weeks</EmptyNote>
          ) : (
            <RepoMix rows={repoWeeks} weeks={mixWeeks} endSunday={mixEnd} masked={[]} metric={metric} />
          )}
        </section>
        <section className="panel p-6">
          <h2 className="font-sans font-bold text-lg mb-1">Repo share</h2>
          <p className="font-mono text-xs text-faint mb-4">{metric === "lines" ? "lines touched" : "commits"} per repo · last {mixWeeks} weeks</p>
          {mixCommits === 0 ? (
            <EmptyNote inset>nothing on the default branch in the last {mixWeeks} weeks</EmptyNote>
          ) : (
            <RepoShare rows={repoWeeks} weeks={mixWeeks} endSunday={mixEnd} masked={[]} metric={metric} />
          )}
        </section>
      </div>

      <section className="panel">
        <div className="flex justify-between items-center px-4 py-3 border-b-2 border-dark">
          <h2 className="font-sans font-bold text-lg">Repos {label}</h2>
          <span className="font-mono text-xs text-faint">{repoRows.length} active</span>
        </div>
        {repoRows.length === 0 ? (
          <p className="font-mono text-sm text-dim p-6">&gt; nothing on the default branch {label}_</p>
        ) : (
          <RepoList rows={repoRows} showName={showName} window={window} linkRepos={false} />
        )}
      </section>
    </>
  );
}
