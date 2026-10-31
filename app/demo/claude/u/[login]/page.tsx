import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ClaudeMember } from "@/components/ClaudeMember";
import { MetricTabs } from "@/components/MetricTabs";
import { RangePicker } from "@/components/RangePicker";
import { WindowTabs } from "@/components/WindowTabs";
import { demoMembers } from "@/lib/demo";
import { openGraphFor, SITE_URL } from "@/lib/site";
import { CLAUDE_METRICS, parseClaudeMetric, parseWindow, windowQuery } from "@/lib/window";

/** Per request: reads the URL. The stats behind it are cached in lib/cached.ts. */
export const instant = false;

export async function generateMetadata({ params }: { params: Promise<{ login: string }> }): Promise<Metadata> {
  const { login } = await params;
  return {
    title: { absolute: `${login} · demo · claudestats` },
    description: "One developer's claudestats page on the demo board: tokens per week, a year of replies, the model mix and records. Generated data, no sign-in.",
    alternates: { canonical: `/demo/claude/u/${login}` },
    openGraph: openGraphFor(`${SITE_URL}/demo/claude/u/${login}`),
  };
}

/** One demo member's claudestats page: the same body the real page draws, read-only. */
export default async function DemoClaudeUserPage({
  params,
  searchParams,
}: {
  params: Promise<{ login: string }>;
  searchParams: Promise<{ w?: string; m?: string; from?: string; to?: string }>;
}) {
  const [{ login }, query, members] = await Promise.all([params, searchParams, demoMembers()]);
  const user = members.find((m) => m.login === login);
  if (!user) notFound();
  const window = parseWindow({ ...query, w: query.w ?? "year" });
  const metric = parseClaudeMetric(query.m);
  const suffix = metric === "tokens" ? "" : `&m=${metric}`;
  const base = `/demo/claude/u/${user.login}`;
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
        <div className="flex items-center gap-5 min-w-0">
          <Image src={user.avatarUrl} alt="" width={64} height={64} className="border-2 border-silver shrink-0" unoptimized />
          <div className="min-w-0">
            <div className="tag mb-2">CLAUDE // {user.login.toUpperCase()}</div>
            <h1 className="font-sans font-bold text-4xl leading-none [overflow-wrap:anywhere]">{user.name ?? user.login}</h1>
            <Link href="/demo/claude" className="font-mono text-xs text-faint hover:text-alert mt-2 inline-block">← back to the demo board</Link>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          <MetricTabs current={metric} basePath={base} query={windowQuery(window)} metrics={CLAUDE_METRICS} defaultMetric="tokens" />
          <WindowTabs current={window} basePath={base} query={suffix} />
          <RangePicker current={window} basePath={base} query={suffix} />
        </div>
      </div>
      <ClaudeMember userId={user.id} window={window} metric={metric} streakMode="all_days" setup={null} />
    </>
  );
}
