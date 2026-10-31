import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ClaudeBoard } from "@/components/ClaudeBoard";
import { ClaudeCrewCharts } from "@/components/ClaudeCrewCharts";
import { ClaudeCrewMix } from "@/components/ClaudeCrewMix";
import { MetricTabs } from "@/components/MetricTabs";
import { RangePicker } from "@/components/RangePicker";
import { WindowTabs } from "@/components/WindowTabs";
import { claudeCrewBoard, claudeCrewModels, claudeCrewTimelines, crewBoard } from "@/lib/cached";
import { claudeRankBy } from "@/lib/claudestats";
import { demoCrew } from "@/lib/demo";
import { openGraphFor, SITE_URL } from "@/lib/site";
import { CLAUDE_METRICS, isAllTime, parseClaudeMetric, parseWindow, previousLabel, windowLabel, windowQuery } from "@/lib/window";

/** Per request: reads the URL. The stats behind it are cached in lib/cached.ts. */
export const instant = false;

export const metadata: Metadata = {
  title: { absolute: "Demo board · claudestats" },
  description: "A live claudestats crew board with generated data: Claude Code tokens, output, sessions and streaks for four developers. No sign-in.",
  alternates: { canonical: "/demo/claude" },
  openGraph: openGraphFor(`${SITE_URL}/demo/claude`),
};

/** The claudestats crew board as anyone can see it, over the seeded demo crew. */
export default async function DemoClaudeBoard({ searchParams }: { searchParams: Promise<{ w?: string; m?: string; from?: string; to?: string }> }) {
  const [query, crew] = await Promise.all([searchParams, demoCrew()]);
  if (!crew) notFound();
  // As on the gitstats demo: a cold visitor lands on the whole year.
  const window = parseWindow({ ...query, w: query.w ?? "year" });
  const metric = parseClaudeMetric(query.m);
  const suffix = metric === "tokens" ? "" : `&m=${metric}`;
  const [board, timelines, models, git] = await Promise.all([claudeCrewBoard(crew.id, window), claudeCrewTimelines(crew.id, window), claudeCrewModels(crew.id, window), crewBoard(crew.id, window)]);
  const rows = claudeRankBy(board, metric);
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
        <div>
          <div className="tag mb-3">CLAUDE // DEMO</div>
          <h1 className="font-sans font-bold text-4xl">{crew.name}</h1>
          <p className="font-mono text-xs text-faint mt-2">four invented developers, invented Claude Code usage</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          <MetricTabs current={metric} basePath="/demo/claude" query={windowQuery(window)} metrics={CLAUDE_METRICS} defaultMetric="tokens" />
          <WindowTabs current={window} basePath="/demo/claude" query={suffix} />
          <RangePicker current={window} basePath="/demo/claude" query={suffix} />
        </div>
      </div>

      {rows[0] && (
        <Link
          href={`/demo/claude/u/${rows[0].login}${window.kind === "preset" ? `?w=${window.value}` : ""}`}
          className="flex flex-wrap items-center justify-between gap-3 border-2 border-alert px-4 py-3 mb-8 font-mono text-xs hover:bg-alert hover:text-void transition-colors"
        >
          <span>&gt; this is a crew board. Your own page is one developer&apos;s view: every chart for {rows[0].login}, alone.</span>
          <span className="font-bold whitespace-nowrap">ONE DEVELOPER&apos;S PAGE →</span>
        </Link>
      )}

      <ClaudeBoard rows={rows} beforeLabel={isAllTime(window) ? null : previousLabel(window)} metric={metric} userBase="/demo/claude/u" />
      <ClaudeCrewMix rows={rows} models={models} git={git} metric={metric} label={windowLabel(window)} />
      <ClaudeCrewCharts rows={rows} timelines={timelines} metric={metric} />
    </>
  );
}
