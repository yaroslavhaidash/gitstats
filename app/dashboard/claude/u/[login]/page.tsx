import type { Metadata } from "next";
import Image from "next/image";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { BackLink } from "@/components/BackLink";
import { ClaudeMember } from "@/components/ClaudeMember";
import { MetricTabs } from "@/components/MetricTabs";
import { RangePicker } from "@/components/RangePicker";
import { Section } from "@/components/Section";
import { SkeletonStats } from "@/components/Skeleton";
import { WindowTabs } from "@/components/WindowTabs";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { cliTokens } from "@/db/schema";
import { backTarget, sharesCrew, userByLogin } from "@/lib/crews";
import { CLAUDE_METRICS, parseClaudeMetric, parseWindow, viewQuery, windowQuery } from "@/lib/window";

/** Per request: it reads the session. The stats behind it are cached in lib/cached.ts. */
export const instant = false;

export async function generateMetadata({ params }: { params: Promise<{ login: string }> }): Promise<Metadata> {
  const { login } = await params;
  return { title: { absolute: `${login} · claudestats` } };
}

/** A member's claudestats page, behind the same profile visibility rule as their gitstats page. */
export default async function ClaudeUserPage({
  params,
  searchParams,
}: {
  params: Promise<{ login: string }>;
  searchParams: Promise<{ w?: string; m?: string; from?: string; to?: string; src?: string }>;
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
  const window = parseWindow(query);
  const metric = parseClaudeMetric(query.m);
  const suffix = metric === "tokens" ? "" : `&m=${metric}`;
  const base = `/dashboard/claude/u/${user.githubLogin}`;
  const [back, machines] = await Promise.all([
    backTarget(session.user.id, query.src, viewQuery(window, metric)),
    isOwner ? db.select({ id: cliTokens.id }).from(cliTokens).where(eq(cliTokens.userId, user.id)) : [],
  ]);
  return (
    <>
      <BackLink href={back.href.replace(/^\/dashboard(?=\/|\?|$)/, "/dashboard/claude")} label={back.label} />
      <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
        <div className="flex items-center gap-5 min-w-0">
          <Image src={user.avatarUrl} alt="" width={64} height={64} className="border-2 border-silver shrink-0" unoptimized />
          <div className="min-w-0">
            <div className="tag mb-2 max-w-full [overflow-wrap:anywhere]">CLAUDE // {user.githubLogin.toUpperCase()}</div>
            <h1 className="font-sans font-bold text-4xl leading-none [overflow-wrap:anywhere]">{user.name ?? user.githubLogin}</h1>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          <MetricTabs current={metric} basePath={base} query={windowQuery(window)} metrics={CLAUDE_METRICS} defaultMetric="tokens" />
          <WindowTabs current={window} basePath={base} query={suffix} />
          <RangePicker current={window} basePath={base} query={suffix} />
        </div>
      </div>
      <Section fallback={<SkeletonStats />}>
        <ClaudeMember userId={user.id} window={window} metric={metric} streakMode={user.streakMode} setup={isOwner ? { linked: machines.length > 0 } : null} />
      </Section>
    </>
  );
}
