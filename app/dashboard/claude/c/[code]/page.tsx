import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { ClaudeBoard } from "@/components/ClaudeBoard";
import { ClaudeCrewCharts } from "@/components/ClaudeCrewCharts";
import { ClaudeCrewMix } from "@/components/ClaudeCrewMix";
import { ClaudeSetup } from "@/components/ClaudeSetup";
import { MetricTabs } from "@/components/MetricTabs";
import { RangePicker } from "@/components/RangePicker";
import { Section } from "@/components/Section";
import { SkeletonBoard, SkeletonCharts } from "@/components/Skeleton";
import { StandingBlock } from "@/components/StandingBlock";
import { WindowTabs } from "@/components/WindowTabs";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { cliTokens } from "@/db/schema";
import { claudeCrewBoard, claudeCrewModels, claudeCrewTimelines, crewBoard } from "@/lib/cached";
import { claudeRankBy, claudeStanding } from "@/lib/claudestats";
import { crewByCode, isMember } from "@/lib/crews";
import { fmtTokens } from "@/lib/format";
import { accountCreatedAt } from "@/lib/stats";
import { CLAUDE_METRICS, isAllTime, parseClaudeMetric, parseWindow, previousLabel, previousPeriodEnd, windowLabel, windowQuery, type ClaudeMetric, type Window } from "@/lib/window";

/** Per request: it reads the session. The stats behind it are cached in lib/cached.ts. */
export const instant = false;

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await params;
  return { title: { absolute: `Crew ${code.toUpperCase()} · claudestats` } };
}

const UNIT: Record<ClaudeMetric, string> = { tokens: "tokens", output: "output tokens" };

/** The reader's standing, the board and the charts; a crew where nobody counts Claude Code shows the setup panel only. */
async function Board({ crewId, code, window, metric, viewerId, linked }: { crewId: number; code: string; window: Window; metric: ClaudeMetric; viewerId: number; linked: boolean }) {
  const [board, timelines, createdAt, models, git] = await Promise.all([
    claudeCrewBoard(crewId, window),
    claudeCrewTimelines(crewId, window),
    accountCreatedAt(viewerId),
    claudeCrewModels(crewId, window),
    crewBoard(crewId, window),
  ]);
  const rows = claudeRankBy(board, metric);
  const me = claudeStanding(rows, metric, viewerId);
  const allTime = isAllTime(window);
  return (
    <>
      {!me && <ClaudeSetup linked={linked} />}
      {rows.length > 0 && (
        <>
          {me && rows.length > 1 && (
            <StandingBlock standing={me} metric={metric} unit={UNIT[metric]} format={fmtTokens} label={windowLabel(window)} beforeLabel={previousLabel(window)} newcomer={createdAt !== null && createdAt > previousPeriodEnd(window)} />
          )}
          <ClaudeBoard rows={rows} src={`c:${code}`} beforeLabel={allTime ? null : previousLabel(window)} metric={metric} highlightUserId={viewerId} />
          <ClaudeCrewMix rows={rows} models={models} git={git} metric={metric} label={windowLabel(window)} />
          <ClaudeCrewCharts rows={rows} timelines={timelines} metric={metric} />
        </>
      )}
    </>
  );
}

export default async function ClaudeCrewBoard({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ w?: string; m?: string; from?: string; to?: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/");
  const [{ code }, query] = await Promise.all([params, searchParams]);
  const crew = await crewByCode(code.toUpperCase());
  if (!crew || !(await isMember(crew.id, session.user.id))) notFound();
  const window = parseWindow(query);
  const metric = parseClaudeMetric(query.m);
  const suffix = metric === "tokens" ? "" : `&m=${metric}`;
  const base = `/dashboard/claude/c/${crew.code}`;
  const machines = await db.select({ id: cliTokens.id }).from(cliTokens).where(eq(cliTokens.userId, session.user.id));
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
        <div>
          <div className="tag mb-3">CLAUDE // {crew.code}</div>
          <h1 className="font-sans font-bold text-4xl [overflow-wrap:anywhere]">{crew.name}</h1>
          <p className="font-mono text-xs text-faint mt-2">Claude Code tokens per member · counted on linked computers</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          <MetricTabs current={metric} basePath={base} query={windowQuery(window)} metrics={CLAUDE_METRICS} defaultMetric="tokens" />
          <WindowTabs current={window} basePath={base} query={suffix} />
          <RangePicker current={window} basePath={base} query={suffix} />
        </div>
      </div>
      <Section fallback={<><SkeletonBoard rows={4} /><SkeletonCharts /></>}>
        <Board crewId={crew.id} code={crew.code} window={window} metric={metric} viewerId={session.user.id} linked={machines.length > 0} />
      </Section>
    </>
  );
}
