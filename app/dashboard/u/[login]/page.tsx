import Image from "next/image";
import { notFound, redirect } from "next/navigation";
import { after } from "next/server";
import { auth } from "@/auth";
import { BackLink } from "@/components/BackLink";
import { CompareForm } from "@/components/CompareForm";
import { CopyText } from "@/components/CopyText";
import { DailyLines } from "@/components/DailyLines";
import { EmptyNote } from "@/components/EmptyNote";
import { GoalRing } from "@/components/GoalRing";
import { InvitePanel } from "@/components/InvitePanel";
import { LanguageShare } from "@/components/LanguageShare";
import { LinkComputerNudge } from "@/components/LinkComputerNudge";
import { MetricTabs } from "@/components/MetricTabs";
import { MonthBlocks } from "@/components/MonthBlocks";
import { RangePicker } from "@/components/RangePicker";
import { RecapPanel } from "@/components/RecapPanel";
import { RecordsPanel } from "@/components/RecordsPanel";
import { RepoList } from "@/components/RepoList";
import { RepoMix } from "@/components/RepoMix";
import { RepoShare } from "@/components/RepoShare";
import { Section } from "@/components/Section";
import { SharePanel } from "@/components/SharePanel";
import { SkeletonStats } from "@/components/Skeleton";
import { WeekdayProfile } from "@/components/WeekdayProfile";
import { YearCalendar } from "@/components/YearCalendar";
import { StatTile } from "@/components/StatTile";
import { StreakBanner } from "@/components/StreakBanner";
import { WeeklyBars } from "@/components/WeeklyBars";
import { WindowTabs } from "@/components/WindowTabs";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { cliTokens, users } from "@/db/schema";
import { memberRecords, ownGoalWeeks, recapStats, userStats } from "@/lib/cached";
import { mintShareToken, type ShareOptions } from "@/lib/share";
import { SITE_URL } from "@/lib/site";
import { behindLatestCli, RELINK_COMMAND } from "@/lib/cli";
import { firstSnapshotRunning } from "@/lib/snapshot";
import { nameVisible, type BoardViewer } from "@/lib/stats";
import { backTarget, inviteTarget, sharesCrew, userByLogin, userCrews } from "@/lib/crews";
import { fmt, pctDelta } from "@/lib/format";
import { dayChartMode, lastWeekRange, parseMetric, parseWindow, rangeDays, viewQuery, windowLabel, windowQuery, windowRange, type Metric, type Window } from "@/lib/window";

const flagsOf = (o: ShareOptions) => `${o.totals ? "t" : ""}${o.grid ? "g" : ""}${o.names ? "n" : ""}${o.streak ? "s" : ""}${o.record ? "r" : ""}${o.recap ? "w" : ""}` || "-";
/** Every switch position on the share panel, so the page can mint a token for each one. */
const SHARE_FLAGS: ShareOptions[] = [false, true].flatMap((totals) =>
  [false, true].flatMap((grid) =>
    [false, true].flatMap((names) => [false, true].flatMap((streak) => [false, true].map((record) => ({ totals, grid, names, streak, record, recap: false })))),
  ),
);
/** The recap card's positions: its own headline, so only totals, grid and the crew name switch. */
const RECAP_FLAGS: ShareOptions[] = [false, true].flatMap((totals) =>
  [false, true].flatMap((grid) => [false, true].map((names) => ({ totals, grid, names, streak: false, record: false, recap: true }))),
);
/** "Your week" shows Monday to Wednesday (UTC), then gives way until the next Monday. */
const RECAP_DAYS = [1, 2, 3];
/** Streak lengths that earn a one-time banner on the member's own page. */
const STREAK_MILESTONES = [7, 30, 100, 365];

type User = NonNullable<Awaited<ReturnType<typeof userByLogin>>>;

/** Everything `userStats` answers for: the tiles, the charts and the repo table under the header. */
async function Stats({
  user,
  window,
  metric,
  isOwner,
  includePrivate,
  viewer,
  repoNames,
  share,
  src,
  recapCrew,
}: {
  user: User;
  window: Window;
  metric: Metric;
  isOwner: boolean;
  includePrivate: boolean;
  viewer: BoardViewer;
  repoNames: User["repoNames"];
  share: "open" | "streak" | "record" | "recap" | undefined;
  src: string | undefined;
  /** The crew a recap is placed in, as asked for in the URL. */
  recapCrew: string | undefined;
}) {
  const label = windowLabel(window);
  const lastWeek = lastWeekRange();
  const showRecap = isOwner && (share === "recap" || RECAP_DAYS.includes(new Date().getUTCDay()));
  const crews = showRecap ? await userCrews(user.id) : [];
  const recapCrewId = (crews.find((c) => String(c.id) === recapCrew) ?? crews[0])?.id ?? null;
  const goal = isOwner && user.weeklyGoal !== null && user.weeklyGoalMetric !== null ? { metric: user.weeklyGoalMetric, target: user.weeklyGoal } : null;
  const [
    { row, before, weeks, chartWeeks, chartEnd, repoRows, dailyLines, languages, year, weekdays, weekdayLines, span, nearest, hiddenNames, repoWeeks, mixWeeks, mixEnd },
    records,
    goalWeeks,
    recap,
  ] = await Promise.all([
    userStats(user.id, window, isOwner, includePrivate, viewer),
    memberRecords(user.id, isOwner ? "own" : viewer),
    goal ? ownGoalWeeks(user.id) : null,
    showRecap ? recapStats(user.id, lastWeek, metric, recapCrewId) : null,
  ]);
  const mode = dayChartMode(window);
  // The highest milestone the current streak has reached. Recording it as it is shown makes the banner
  // once per milestone; recording a lower one after a broken streak lets the next run earn them again.
  const milestone = STREAK_MILESTONES.filter((m) => row.streak >= m).at(-1) ?? 0;
  const newMilestone = isOwner && milestone > user.lastStreakMilestone;
  if (isOwner && milestone !== user.lastStreakMilestone) {
    after(() => db.update(users).set({ lastStreakMilestone: milestone }).where(eq(users.id, user.id)));
  }
  // A record the period in progress has just set, once per period (or per streak run), like the milestones.
  const freshRecords = isOwner
    ? ([
        ["week", records.fresh.week, user.lastRecordWeek, "new record: best week", `?w=week&m=${metric}&share=record#share`],
        ["month", records.fresh.month, user.lastRecordMonth, "new record: best month", `?w=month&m=${metric}&share=record#share`],
        ["streak", records.fresh.streak, user.lastRecordStreak, "new record: longest streak", `?${viewQuery(window, metric)}&share=streak#share`],
      ] as const).filter(([, fresh, seen]) => fresh !== null && fresh !== seen)
    : [];
  if (freshRecords.length > 0) {
    const seen = Object.fromEntries(freshRecords.map(([kind, fresh]) => [kind === "week" ? "lastRecordWeek" : kind === "month" ? "lastRecordMonth" : "lastRecordStreak", fresh]));
    after(() => db.update(users).set(seen).where(eq(users.id, user.id)));
  }
  // Unmerged-branch work, only worth a line when the CLI actually found some.
  const pending = (n: number) => (n > 0 ? `+${fmt(n)} pending` : undefined);
  const hidden = new Set(hiddenNames);
  const showName = (r: { nodeId: string; isPrivate: boolean }) => nameVisible({ repoNames, hiddenName: !isOwner && hidden.has(r.nodeId) }, r);
  const mixCommits = repoWeeks.reduce((sum, r) => sum + r.commits, 0);
  // True once some of the window's days hold a figure placed from a week rather than counted by a machine.
  const placed = dailyLines.some((d) => d.spreadAdditions + d.spreadDeletions + d.spreadCommits > 0);
  // The charts run on the client, so the name decision is made here and crosses as plain node ids.
  const maskedRepos = [...new Set(repoWeeks.filter((r) => !showName(r)).map((r) => r.nodeId))];
  // Signing needs the secret, so all eight switch positions are minted here and the panel picks one.
  // A recap card has its own fixed window, last week, and the crew it places the member in.
  const shareTokens = !isOwner
    ? {}
    : share === "recap"
      ? Object.fromEntries(
          RECAP_FLAGS.map((o) => [
            flagsOf(o),
            mintShareToken({ userId: user.id, window: { kind: "range", ...lastWeek }, metric, options: o, ...(recapCrewId === null ? {} : { crewId: recapCrewId }) }, user.shareNonce),
          ]),
        )
      : Object.fromEntries(SHARE_FLAGS.map((o) => [flagsOf(o), mintShareToken({ userId: user.id, window, metric, options: o }, user.shareNonce)]));
  // Nothing on either side of the comparison is not a change of zero percent; it is no comparison,
  // and a row of "—" under every tile only invites the reader to look for the percentages.
  const delta = (now: number, was: number) => (now === 0 && was === 0 ? undefined : pctDelta(now, was));
  // Anywhere at all, not just in this window: a card minted from an account with no history says
  // "#4 of 4 on gitstats" over a blank 26-week grid.
  const hasAnything = row.commits > 0 || row.additions + row.deletions > 0 || nearest !== null || year.some((n) => n > 0);
  const anyTile = [
    [row.commits, before?.commits ?? 0],
    [row.additions, before?.additions ?? 0],
    [row.deletions, before?.deletions ?? 0],
    [row.activeRepos, before?.activeRepos ?? 0],
  ].some(([now, was]) => now > 0 || was > 0);
  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-[2px] bg-dark border-2 border-dark">
        <StatTile label="commits" value={fmt(row.commits)} delta={delta(row.commits, before?.commits ?? 0)} sub={pending(row.pendingCommits)} />
        <StatTile label="added" value={`+${fmt(row.additions)}`} delta={delta(row.additions, before?.additions ?? 0)} sub={pending(row.pendingAdditions)} tone="green" />
        <StatTile label="deleted" value={`−${fmt(row.deletions)}`} delta={delta(row.deletions, before?.deletions ?? 0)} sub={pending(row.pendingDeletions)} tone="alert" />
        <StatTile label="active repos" value={String(row.activeRepos)} delta={delta(row.activeRepos, before?.activeRepos ?? 0)} />
        <StatTile label="streak" value={`${row.streak}d`} suffix={user.streakMode === "weekdays" ? "· weekdays" : undefined} />
        <StatTile label="stars" value={fmt(row.stars)} sub={row.topLanguage ? `top language · ${row.topLanguage}` : undefined} tone="amber" />
      </div>
      {anyTile && (
        <div className={`font-mono text-xs text-faint mt-2 ${row.commits === 0 ? "mb-4" : "mb-8"}`}>
          <p>&gt; percentages compare against the {rangeDays(windowRange(window))} days before this window</p>
          {/* The tiles count whole weekly buckets, the day chart draws days; on a short window that gap is one visible Sunday. */}
          {window.kind === "preset" && window.value !== "year" && (
            <p>&gt; weekly buckets open on Sunday, so the tiles can include the Sunday before this window</p>
          )}
        </div>
      )}

      {freshRecords.map(([kind, , , text, query]) => (
        <StreakBanner key={kind} text={text} shareHref={`/dashboard/u/${user.githubLogin}${query}`} />
      ))}
      {recap && (
        <RecapPanel
          week={lastWeek.from}
          label={windowLabel({ kind: "range", ...lastWeek })}
          login={user.githubLogin}
          metric={metric}
          stats={{ ...recap.row, activeDays: recap.activeDays, placement: recap.placement }}
          crews={crews}
          crewId={recapCrewId}
        />
      )}
      {goal && goalWeeks && <GoalRing metric={goal.metric} goal={goal.target} weeks={goalWeeks} />}
      {newMilestone && <StreakBanner text={`${milestone}-day streak`} shareHref={`/dashboard/u/${user.githubLogin}?${viewQuery(window, metric)}&share=streak#share`} />}

      {isOwner && (
        <SharePanel
          // A banner's SHARE_ is a soft navigation to the same page, so remount to pick up the new defaults.
          key={share ?? "closed"}
          tokens={shareTokens}
          origin={SITE_URL}
          view={viewQuery(window, metric)}
          defaultOpen={share !== undefined}
          defaultStreak={share === "streak"}
          defaultRecord={share === "record"}
          defaultRecap={share === "recap"}
          empty={!hasAnything}
          login={user.githubLogin}
        />
      )}

      {row.commits === 0 &&
        (nearest ? (
          <EmptyNote href={`/dashboard/u/${user.githubLogin}?w=${nearest.preset}`} cta={nearest.preset.toUpperCase()}>
            nothing {label} · {fmt(nearest.commits)} commits this {nearest.preset}
          </EmptyNote>
        ) : isOwner && !hasAnything && firstSnapshotRunning(user.lastSnapshotAt) ? (
          <EmptyNote>counting your public repos now · refresh in a moment</EmptyNote>
        ) : (
          <EmptyNote href={isOwner ? "/dashboard/setup" : undefined} cta={isOwner ? "SETUP" : undefined}>
            nothing counted {label} · lines for public repos arrive tonight, in the 03:00 UTC snapshot
            {isOwner ? " · link your computer for them now, and for private and work repos" : ""}
          </EmptyNote>
        ))}

      <div className="grid lg:grid-cols-[2fr_1fr] gap-8 mb-8">
        <section className="panel p-6">
          <h2 className="font-sans font-bold text-lg mb-1">Lines per week</h2>
          <p className="font-mono text-xs text-faint mb-4">last {chartWeeks} weeks · fixed context, not the selected window</p>
          <WeeklyBars weeks={weeks} totalWeeks={chartWeeks} endSunday={chartEnd} />
        </section>
        <section className="panel p-6">
          <h2 className="font-sans font-bold text-lg mb-4">Last 52 weeks</h2>
          <YearCalendar days={year} label={`${user.githubLogin} daily contributions, last 52 weeks`} />
          <p className="font-mono text-xs text-faint mt-4">older half on top, newer half below · public activity from GitHub + private commits counted on linked machines</p>
        </section>
      </div>

      <section className="panel p-6 mb-8">
        <h2 className="font-sans font-bold text-lg mb-1">Lines per {mode === "months" ? "month" : "day"}</h2>
        <p className="font-mono text-xs text-faint mb-4">{window.kind === "preset" ? `${label} · ${windowLabel({ kind: "range", ...span })}` : label}</p>
        <MonthBlocks rows={dailyLines} from={span.from} to={span.to} mode={mode} today={span.to} />
      </section>

      <section className="panel p-6 mb-8">
        <h2 className="font-sans font-bold text-lg mb-1">{metric === "lines" ? "Lines" : "Commits"} per day · trend</h2>
        <p className="font-mono text-xs text-faint mb-4">
          {label} · one bar per day · {placed ? "linked computers count the days; GitHub only reports whole weeks" : "counted on linked computers"}
        </p>
        {dailyLines.length === 0 ? (
          <EmptyNote inset href={isOwner ? "/dashboard/setup" : undefined} cta={isOwner ? "SETUP" : undefined}>
            no lines per day {label} · only a linked computer counts lines against a date
          </EmptyNote>
        ) : (
          <DailyLines rows={dailyLines} from={span.from} to={span.to} metric={metric} />
        )}
        {placed && (
          <p className="font-mono text-xs text-faint mt-3">
            &gt; the hatched part of a bar is a repo that is not on a linked computer · GitHub reports those by the week, so the week is laid over its days
            in proportion to your contribution calendar
          </p>
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
          <h2 className="font-sans font-bold text-lg mb-1">Where the lines went (weekly)</h2>
          <p className="font-mono text-xs text-faint mb-4">each week&apos;s {metric} split between repos · last {mixWeeks} weeks</p>
          {mixCommits === 0 ? (
            <EmptyNote inset>nothing on the default branch in the last {mixWeeks} weeks</EmptyNote>
          ) : (
            <RepoMix rows={repoWeeks} weeks={mixWeeks} endSunday={mixEnd} masked={maskedRepos} metric={metric} />
          )}
        </section>
        <section className="panel p-6">
          <h2 className="font-sans font-bold text-lg mb-1">Lines by repo (total)</h2>
          <p className="font-mono text-xs text-faint mb-4">all {mixWeeks} weeks added up, {metric === "lines" ? "lines touched" : "commits"} per repo</p>
          {mixCommits === 0 ? (
            <EmptyNote inset>nothing on the default branch in the last {mixWeeks} weeks</EmptyNote>
          ) : (
            <RepoShare rows={repoWeeks} weeks={mixWeeks} endSunday={mixEnd} masked={maskedRepos} metric={metric} />
          )}
        </section>
      </div>

      <RecordsPanel records={records} />

      <section id="repos" className="panel scroll-mt-20">
        <div className="flex justify-between items-center px-4 py-3 border-b-2 border-dark">
          <h2 className="font-sans font-bold text-lg">Repos {label}</h2>
          <span className="font-mono text-xs text-faint">{repoRows.length} active</span>
        </div>
        {isOwner && repoRows.length > 0 && (
          <p className="font-mono text-xs text-faint px-4 py-3 border-b-2 border-dark">
            &gt; names hidden here are hidden for everyone, whatever your visibility settings say
          </p>
        )}
        {repoRows.length === 0 ? (
          <p className="font-mono text-sm text-dim p-6">&gt; nothing on the default branch {label}_</p>
        ) : (
          <RepoList
            rows={repoRows}
            showName={showName}
            window={window}
            owner={isOwner}
            hiddenNames={hidden}
            src={src}
            back={`/dashboard/u/${user.githubLogin}?${viewQuery(window, metric)}#repos`}
          />
        )}
      </section>
    </>
  );
}

export default async function UserPage({
  params,
  searchParams,
}: {
  params: Promise<{ login: string }>;
  searchParams: Promise<{ w?: string; m?: string; from?: string; to?: string; share?: string; src?: string; crew?: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/");
  const [{ login }, query] = await Promise.all([params, searchParams]);
  const user = await userByLogin(login);
  if (!user) notFound();
  const isOwner = user.id === session.user.id;
  const crewmate = isOwner || (await sharesCrew(session.user.id, user.id));
  if (!isOwner && !crewmate && user.profileVisibility === "crew") {
    return (
      <div className="max-w-xl mx-auto text-center py-20">
        <div className="tag mb-4">PRIVATE PROFILE</div>
        <h1 className="font-sans font-bold text-3xl mb-3">{user.githubLogin} only shares with crewmates.</h1>
        <p className="font-mono text-sm text-dim">Join one of their crews to see the breakdown. Board numbers stay visible.</p>
      </div>
    );
  }
  // Which column of the visibility matrix this visitor falls in.
  const viewer = crewmate ? "crew" : "global";
  const includePrivate = isOwner || (crewmate ? user.sharePrivate : user.sharePrivateGlobal);
  const repoNames = isOwner ? "all" : crewmate ? user.repoNames : user.repoNamesGlobal;
  const window = parseWindow(query);
  const metric = parseMetric(query.m);
  const suffix = metric === "lines" ? "" : `&m=${metric}`;
  const [back, machines, invite] = await Promise.all([
    backTarget(session.user.id, query.src, viewQuery(window, metric)),
    isOwner ? db.select({ cliVersion: cliTokens.cliVersion }).from(cliTokens).where(eq(cliTokens.userId, user.id)) : [],
    isOwner ? inviteTarget(user.id) : null,
  ]);
  const behind = [...new Set(machines.filter((m) => behindLatestCli(m.cliVersion)).map((m) => m.cliVersion ?? "an old version"))];
  return (
    <>
      <BackLink href={back.href} label={back.label} />
      {/* A member with no crew never sees the crew board's copy of this. */}
      {isOwner && machines.length === 0 && <LinkComputerNudge />}
      {behind.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-2 border-amber px-4 py-3 mb-8 font-mono text-xs text-amber">
          <span>&gt; your computer is on {behind.join(", ")}, run</span>
          <CopyText text={RELINK_COMMAND} className="text-silver text-xs" />
          <span>once to get the latest</span>
        </div>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
        <div className="flex items-center gap-5">
          <Image src={user.avatarUrl} alt="" width={64} height={64} className="border-2 border-silver" unoptimized />
          <div>
            <div className="tag mb-2">DEV // {user.githubLogin.toUpperCase()}</div>
            <h1 className="font-sans font-bold text-4xl leading-none">{user.name ?? user.githubLogin}</h1>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <MetricTabs current={metric} basePath={`/dashboard/u/${user.githubLogin}`} query={windowQuery(window)} />
          <WindowTabs current={window} basePath={`/dashboard/u/${user.githubLogin}`} query={suffix} />
          <RangePicker current={window} basePath={`/dashboard/u/${user.githubLogin}`} query={suffix} />
        </div>
      </div>
      {!isOwner && (
        <div className="mb-8">
          <CompareForm login={user.githubLogin} visitor={session.user.login} />
        </div>
      )}
      {invite && <InvitePanel link={invite.code ? `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/join/${invite.code}` : null} />}
      <Section fallback={<SkeletonStats />}>
        <Stats
          user={user}
          window={window}
          metric={metric}
          isOwner={isOwner}
          includePrivate={includePrivate}
          viewer={viewer}
          repoNames={repoNames}
          share={query.share === "1" ? "open" : query.share === "streak" || query.share === "record" || query.share === "recap" ? query.share : undefined}
          recapCrew={query.crew}
          src={query.src}
        />
      </Section>
    </>
  );
}
