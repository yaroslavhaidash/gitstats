import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { EmptyNote } from "@/components/EmptyNote";
import { Leaderboard } from "@/components/Leaderboard";
import { MetricTabs } from "@/components/MetricTabs";
import { RangePicker } from "@/components/RangePicker";
import { Section } from "@/components/Section";
import { SkeletonBoard } from "@/components/Skeleton";
import { StandingBlock } from "@/components/StandingBlock";
import { WindowTabs } from "@/components/WindowTabs";
import { globalBoard } from "@/lib/cached";
import { accountCreatedAt, rankBy, standing } from "@/lib/stats";
import { parseMetric, parseWindow, previousLabel, previousPeriodEnd, viewQuery, windowLabel, windowQuery, type Metric, type Window } from "@/lib/window";

/** Below this many members the flat table is the whole point: everyone can see everyone. */
const FLAT_UNDER = 50;
/** The head of the board, and how far either side of the reader the neighbourhood reaches. */
const TOP = 5;
const NEAR = 5;

/** The contiguous runs of rows to draw: the top block, and the reader's neighbourhood when it is separate. */
function blocksFor(index: number, total: number): { from: number; to: number }[] {
  const head = { from: 0, to: Math.min(TOP, total) - 1 };
  if (index < 0) return [head];
  const from = Math.max(0, index - NEAR);
  const to = Math.min(total - 1, index + NEAR);
  // A separator that hides one row costs more than the row it saves, so anything that close merges.
  return from <= head.to + 2 ? [{ from: 0, to: Math.max(head.to, to) }] : [head, { from, to }];
}

/** Everything behind a Postgres read, so the header and the tabs above are on screen before it answers. */
async function Board({ userId, window, metric, all }: { userId: number; window: Window; metric: Metric; all: boolean }) {
  const [board, createdAt] = await Promise.all([globalBoard(window), accountCreatedAt(userId)]);
  const rows = rankBy(board, metric);
  const me = standing(rows, metric, userId);
  // An account that did not exist through the previous period has nowhere to have moved from, so
  // "same place as last week" would be a claim about a week it was not here for.
  const newcomer = createdAt !== null && createdAt > previousPeriodEnd(window);
  const flat = all || rows.length < FLAT_UNDER;
  const blocks = flat ? [{ from: 0, to: rows.length - 1 }] : blocksFor(me ? me.rank - 1 : -1, rows.length);
  const beforeLabel = previousLabel(window);
  const view = viewQuery(window, metric);
  return (
    <>
      {rows.length <= 1 && (
        <EmptyNote href="/dashboard/new" cta="NEW CREW">
          you are the only one here so far · an invite link is the fastest way to fill this board
        </EmptyNote>
      )}
      {me && rows.length > 1 && <StandingBlock standing={me} metric={metric} label={windowLabel(window)} beforeLabel={beforeLabel} newcomer={newcomer} />}
      {blocks.map((block, i) => (
        <div key={block.from}>
          {i > 0 && (
            <p className="font-mono text-xs text-faint my-4 text-center">··· {block.from - blocks[i - 1].to - 1} more between ···</p>
          )}
          <Leaderboard
            rows={rows.slice(block.from, block.to + 1)}
            linkUsers
            src="global"
            beforeLabel={beforeLabel}
            metric={metric}
            rankOffset={block.from}
            highlightUserId={userId}
          />
        </div>
      ))}
      {rows.length >= FLAT_UNDER && (
        <p className="font-mono text-xs mt-6">
          <Link href={`/dashboard/global?${view}${flat ? "" : "&all=1"}`} className="text-faint hover:text-alert transition-colors">
            {flat ? "[SHOW MY NEIGHBOURHOOD]" : `[SHOW ALL ${rows.length}]`}
          </Link>
        </p>
      )}
    </>
  );
}

export default async function GlobalBoard({ searchParams }: { searchParams: Promise<{ w?: string; m?: string; from?: string; to?: string; all?: string }> }) {
  const session = await auth();
  if (!session) redirect("/");
  const query = await searchParams;
  const window = parseWindow(query);
  const metric = parseMetric(query.m);
  const suffix = metric === "lines" ? "" : `&m=${metric}`;
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
        <div>
          <div className="tag mb-3">GLOBAL // EVERYONE</div>
          <h1 className="font-sans font-bold text-4xl">All hands.</h1>
          <p className="font-mono text-xs text-faint mt-2">aggregate numbers · profiles open if the member allows it</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <MetricTabs current={metric} basePath="/dashboard/global" query={windowQuery(window)} />
          <WindowTabs current={window} basePath="/dashboard/global" query={suffix} />
          <RangePicker current={window} basePath="/dashboard/global" query={suffix} />
        </div>
      </div>
      <Section fallback={<SkeletonBoard rows={6} />}>
        <Board userId={session.user.id} window={window} metric={metric} all={query.all === "1"} />
      </Section>
    </>
  );
}
