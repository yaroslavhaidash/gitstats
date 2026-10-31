import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ClaudeBoard } from "@/components/ClaudeBoard";
import { ClaudeSetup } from "@/components/ClaudeSetup";
import { MetricTabs } from "@/components/MetricTabs";
import { RangePicker } from "@/components/RangePicker";
import { Section } from "@/components/Section";
import { SkeletonBoard } from "@/components/Skeleton";
import { StandingBlock } from "@/components/StandingBlock";
import { WindowTabs } from "@/components/WindowTabs";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { cliTokens } from "@/db/schema";
import { claudeGlobalBoard } from "@/lib/cached";
import { claudeRankBy, claudeStanding } from "@/lib/claudestats";
import { fmtTokens } from "@/lib/format";
import { accountCreatedAt } from "@/lib/stats";
import { CLAUDE_METRICS, isAllTime, parseClaudeMetric, parseWindow, previousLabel, previousPeriodEnd, viewQuery, windowLabel, windowQuery, type ClaudeMetric, type Window } from "@/lib/window";

/** Per request: it reads the session. The stats behind it are cached in lib/cached.ts. */
export const instant = false;

export const metadata: Metadata = { title: { absolute: "Global board · claudestats" } };

/** The same shape as the gitstats global board: flat while small, then the top and the reader's neighbourhood. */
const FLAT_UNDER = 50;
const TOP = 5;
const NEAR = 5;
const UNIT: Record<ClaudeMetric, string> = { tokens: "tokens", output: "output tokens", messages: "messages" };

function blocksFor(index: number, total: number): { from: number; to: number }[] {
  const head = { from: 0, to: Math.min(TOP, total) - 1 };
  if (index < 0) return [head];
  const from = Math.max(0, index - NEAR);
  const to = Math.min(total - 1, index + NEAR);
  return from <= head.to + 2 ? [{ from: 0, to: Math.max(head.to, to) }] : [head, { from, to }];
}

async function Board({ userId, window, metric, all }: { userId: number; window: Window; metric: ClaudeMetric; all: boolean }) {
  const [board, createdAt, machines] = await Promise.all([
    claudeGlobalBoard(window),
    accountCreatedAt(userId),
    db.select({ id: cliTokens.id }).from(cliTokens).where(eq(cliTokens.userId, userId)),
  ]);
  const rows = claudeRankBy(board, metric);
  const me = claudeStanding(rows, metric, userId);
  const newcomer = createdAt !== null && createdAt > previousPeriodEnd(window);
  const flat = all || rows.length < FLAT_UNDER;
  const blocks = flat ? [{ from: 0, to: rows.length - 1 }] : blocksFor(me ? me.rank - 1 : -1, rows.length);
  const beforeLabel = previousLabel(window);
  return (
    <>
      {!rows.find((r) => r.userId === userId)?.counted && <ClaudeSetup linked={machines.length > 0} />}
      {me && rows.length > 1 && (
        <StandingBlock standing={me} metric={metric} unit={UNIT[metric]} format={fmtTokens} label={windowLabel(window)} beforeLabel={beforeLabel} newcomer={newcomer} />
      )}
      {rows.length > 0 &&
        blocks.map((block, i) => (
          <div key={block.from}>
            {i > 0 && <p className="font-mono text-xs text-faint my-4 text-center">··· {block.from - blocks[i - 1].to - 1} more between ···</p>}
            <ClaudeBoard
              rows={rows.slice(block.from, block.to + 1)}
              src="global"
              beforeLabel={isAllTime(window) ? null : beforeLabel}
              metric={metric}
              rankOffset={block.from}
              highlightUserId={userId}
            />
          </div>
        ))}
      {rows.length >= FLAT_UNDER && (
        <p className="font-mono text-xs mt-6">
          <Link href={`/dashboard/claude/global?${viewQuery(window, metric)}${flat ? "" : "&all=1"}`} className="text-faint hover:text-alert transition-colors">
            {flat ? "[SHOW MY NEIGHBOURHOOD]" : `[SHOW ALL ${rows.length}]`}
          </Link>
        </p>
      )}
    </>
  );
}

export default async function ClaudeGlobalBoard({ searchParams }: { searchParams: Promise<{ w?: string; m?: string; from?: string; to?: string; all?: string }> }) {
  const session = await auth();
  if (!session) redirect("/");
  const query = await searchParams;
  const window = parseWindow(query);
  const metric = parseClaudeMetric(query.m);
  const suffix = metric === "tokens" ? "" : `&m=${metric}`;
  const base = "/dashboard/claude/global";
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
        <div>
          <div className="tag mb-3">CLAUDE // EVERYONE</div>
          <h1 className="font-sans font-bold text-4xl">All hands.</h1>
          <p className="font-mono text-xs text-faint mt-2">everyone counting Claude Code · profiles open if the member allows it</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          <MetricTabs current={metric} basePath={base} query={windowQuery(window)} metrics={CLAUDE_METRICS} defaultMetric="tokens" />
          <WindowTabs current={window} basePath={base} query={suffix} />
          <RangePicker current={window} basePath={base} query={suffix} />
        </div>
      </div>
      <Section fallback={<SkeletonBoard rows={6} />}>
        <Board userId={session.user.id} window={window} metric={metric} all={query.all === "1"} />
      </Section>
    </>
  );
}
