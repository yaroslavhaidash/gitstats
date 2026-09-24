import type { Metadata } from "next";
import Link from "next/link";
import { BadgeTabs } from "@/components/BadgeTabs";
import { CopyText } from "@/components/CopyText";
import { SignedOut, SiteNav } from "@/components/SiteNav";
import { SignInButton } from "@/components/Tracked";
import { signInWithGitHub } from "@/lib/actions";
import { demoBadgeStats, statsBadge } from "@/lib/badge";
import { badgeMarkdown, badgeQuery, badgeWindow } from "@/lib/badgeMarkdown";
import { openGraphFor } from "@/lib/site";
import { METRICS, parseMetric, PRESETS } from "@/lib/window";

/** Per request: reads the URL. The stats behind it are cached in lib/cached.ts. */
export const instant = false;

export const metadata: Metadata = {
  title: "GitHub stats widget for your README",
  description:
    "A git stats widget for your GitHub profile README: lines this year, month or week, streak and top language, private and work repos included. One line of Markdown.",
  alternates: { canonical: "/widget" },
  openGraph: openGraphFor("/widget"),
};

const SHOWS: [string, string][] = [
  ["lines or commits this year", "Lines added in green and deleted in red, or your commit count, over the last 365 days, or this month or this week if you pick one."],
  ["streak", "How many days in a row you have committed."],
  ["top language", "The main language of the repos you committed to most in that window."],
];

export default async function Widget({ searchParams }: { searchParams: Promise<{ w?: string; m?: string }> }) {
  const query = await searchParams;
  const window = badgeWindow(query.w);
  const metric = parseMetric(query.m);
  const demo = await demoBadgeStats(window, metric);
  return (
    <main className="flex-1">
      <SiteNav where="widget_nav" />

      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <div className="tag mb-4">WIDGET</div>
        <h1 className="font-sans font-bold text-4xl mb-3">GitHub stats widget for your README</h1>
        <p className="font-mono text-sm text-dim leading-relaxed mb-10">
          One image in your GitHub profile README with your lines or commits over the last year, this month or this week, your
          streak and your top language. It links to your public page on gitstats.
        </p>

        <div className="flex flex-wrap gap-3">
          <BadgeTabs options={METRICS} current={metric} href={(m) => `/widget${badgeQuery(window, m)}`} />
          <BadgeTabs options={PRESETS} current={window} href={(w) => `/widget${badgeQuery(w, metric)}`} />
        </div>
        {demo && (
          <figure className="mt-4 mb-12">
            {/* Our own SVG from statsBadge, every string in it escaped; scaled down to fit a phone. */}
            <div className="max-w-[420px] [&>svg]:w-full [&>svg]:h-auto" dangerouslySetInnerHTML={{ __html: statsBadge(demo) }} />
            <figcaption className="font-mono text-xs text-faint mt-2">&gt; live, for demo member {demo.login} · generated data</figcaption>
          </figure>
        )}

        <section className="mb-12">
          <h2 className="font-sans font-bold text-2xl mb-4">Add it</h2>
          <p className="font-mono text-xs text-dim leading-relaxed mb-3">
            Paste this into your profile README (the repo named after your login) and put your GitHub login where it
            says YOUR-LOGIN. Signed in, the README badge card in settings has it filled in.
          </p>
          <div className="border-2 border-dark px-4 py-3 overflow-x-auto">
            <CopyText text={badgeMarkdown("YOUR-LOGIN", window, metric)} className="text-silver text-xs whitespace-nowrap" />
          </div>
        </section>

        <section className="mb-12">
          <h2 className="font-sans font-bold text-2xl mb-4">What it shows</h2>
          <dl className="space-y-4">
            {SHOWS.map(([what, body]) => (
              <div key={what}>
                <dt className="font-mono text-sm text-white">{what}</dt>
                <dd className="font-mono text-xs text-dim leading-relaxed">{body}</dd>
              </div>
            ))}
          </dl>
          <p className="font-mono text-xs text-dim leading-relaxed mt-4">
            GitHub&apos;s image cache serves it, so the numbers refresh about once an hour.
          </p>
        </section>

        <section className="mb-12">
          <h2 className="font-sans font-bold text-2xl mb-4">Private and work repos count too</h2>
          <p className="font-mono text-xs text-dim leading-relaxed mb-4">
            Most widgets see only what GitHub publishes. Link a computer and its private and work repos are counted
            there, by a small open-source CLI that sends numbers only, so they show on the badge as well.{" "}
            <Link href="/docs#setup" className="text-silver underline hover:text-alert">How linking works</Link>.
          </p>
          <p className="font-mono text-xs text-dim leading-relaxed">
            The badge shows only what you allow everyone to see, and never a repo name. If your page is not open to
            everyone, it shows a plain gitstats badge with no numbers.{" "}
            <Link href="/privacy" className="text-silver underline hover:text-alert">Privacy</Link>.
          </p>
        </section>

        <SignedOut>
          <section className="panel p-6">
            <h2 className="font-sans font-bold text-2xl mb-2">Get yours</h2>
            <p className="font-mono text-xs text-dim leading-relaxed mb-5">Sign in with GitHub and your badge works right away.</p>
            <form action={signInWithGitHub}>
              <SignInButton where="widget" className="btn-brutal">
                SIGN IN WITH GITHUB_
              </SignInButton>
            </form>
          </section>
        </SignedOut>
      </div>
    </main>
  );
}
