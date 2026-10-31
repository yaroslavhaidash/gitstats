import type { Metadata } from "next";
import Link from "next/link";
import { CopyText } from "@/components/CopyText";
import { SiteNav } from "@/components/SiteNav";
import { DemoLink, SignInButton } from "@/components/Tracked";
import { signInWithGitHub } from "@/lib/actions";
import { MODEL_COLOURS } from "@/lib/claudestats";
import { accentCss } from "@/lib/side";
import { openGraphFor } from "@/lib/site";

export const metadata: Metadata = {
  title: { absolute: "claudestats · Claude Code usage for friends" },
  description:
    "claudestats puts your Claude Code tokens, output, sessions and streak on a board next to your friends'. Counted on your own computer from Claude Code's logs, numbers only, on with every linked computer.",
  alternates: { canonical: "/claude" },
  openGraph: openGraphFor("/claude"),
};

const COMMAND = "npx --yes @yaroslavhaidash/gitstats-cli@latest link";

const METRICS = [
  ["tokens", "everything Claude Code sent and got back: input, cache write, cache read, output"],
  ["output", "what the model wrote, thinking included"],
  ["sessions", "conversations started that day"],
  ["active days", "days with at least one reply"],
  ["streak", "days in a row with a reply · weekdays-only is a setting"],
  ["top model", "the model that took the most tokens"],
];

const SENT = [
  "per UTC day and per model: input, output, cache-read and cache-write tokens",
  "how many replies and how many sessions that day",
  "the highest Claude Code version it saw",
  "a keyed hash that tells your computers apart",
];

const NOT_SENT = ["your prompts", "Claude's replies", "code", "file or project names", "session or message ids", "anything finer than a day"];

/** The public page of the claudestats side, for signed-out visitors; a member is sent to their claude board. */
export default function ClaudeLanding() {
  return (
    <main className="flex-1" data-side="claude">
      <style dangerouslySetInnerHTML={{ __html: accentCss(MODEL_COLOURS) }} />
      <SiteNav
        where="claude_nav"
        links={
          <>
            <DemoLink where="claude_nav" href="/demo/claude" className="hover:text-alert transition-colors">[DEMO]</DemoLink>
            <a href="#sent" className="hover:text-alert transition-colors">[SENT]</a>
            <a href="#metrics" className="hover:text-alert transition-colors">[METRICS]</a>
            <Link href="/docs#claude" className="hover:text-alert transition-colors">[DOCS]</Link>
          </>
        }
      />

      <section className="py-20 lg:py-28 border-b-2 border-dark">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="tag mb-6">CLAUDESTATS // TOKENS // OUTPUT // STREAKS</div>
          <h1 className="font-sans font-bold text-4xl sm:text-5xl leading-[1.05] mb-6">
            Your Claude Code usage, <span className="text-alert">next to your friends&apos;.</span>
          </h1>
          <p className="font-mono text-silver mb-4 max-w-xl">
            Tokens, output, sessions and streaks per week, month or year, on the same crews and boards as gitstats.
          </p>
          <p className="font-mono text-xs text-dim leading-relaxed mb-8 max-w-xl">
            Counted on your own computer from the logs Claude Code already keeps. Numbers only, on with every linked computer, off in settings.
          </p>
          <div className="flex flex-wrap items-center gap-4 mb-10">
            <form action={signInWithGitHub}>
              <SignInButton where="claude_hero" className="btn-brutal px-8 py-4 cursor-pointer">SIGN IN WITH GITHUB_</SignInButton>
            </form>
            <DemoLink where="claude_hero" href="/demo/claude" className="btn-ghost">SEE A BOARD_</DemoLink>
          </div>
          <div className="panel p-5 font-mono text-xs">
            <p className="text-dim mb-3">&gt; after signing in, on the computer you use Claude Code on:</p>
            <div className="border-2 border-dark px-4 py-3 text-sm overflow-x-auto">
              <span className="text-faint">$ </span>
              <CopyText text={COMMAND} className="text-white" />
            </div>
            <p className="text-faint mt-3 leading-relaxed">
              &gt; the same link as gitstats: a linked computer counts Claude Code too. Already linked? It counts from its next sync. Needs Node.js 18+.
            </p>
          </div>
        </div>
      </section>

      <section id="sent" className="py-20 border-b-2 border-dark scroll-mt-16">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="font-sans font-bold text-3xl mb-2">What leaves your computer</h2>
          <p className="font-mono text-xs text-dim leading-relaxed mb-6">
            The gitstats CLI reads Claude Code&apos;s own logs and sends this, and only this:
          </p>
          <ul className="border-2 border-dark divide-y divide-dark font-mono text-xs text-silver mb-6">
            {SENT.map((s) => (
              <li key={s} className="px-4 py-3">{s}</li>
            ))}
          </ul>
          <p className="font-mono text-xs text-dim mb-2">Never sent:</p>
          <ul className="font-mono text-xs text-silver flex flex-wrap gap-2 mb-8">
            {NOT_SENT.map((n) => (
              <li key={n} className="border border-dark px-2 py-1">{n}</li>
            ))}
          </ul>
          <div className="border-l-2 border-alert pl-5 font-mono text-xs text-dim leading-relaxed space-y-3">
            <p>
              Who sees it follows your page: crewmates on your crew boards, everyone signed in on the global board, and your own page as your
              settings allow. <span className="text-silver">gitstats claude off</span> stops sending, and settings deletes what was sent.
            </p>
            <p>
              The CLI is open source, one file you can read. The full list is on the <Link href="/privacy#claude" className="text-silver underline hover:text-alert">privacy page</Link>.
            </p>
          </div>
        </div>
      </section>

      <section id="metrics" className="py-20 border-b-2 border-dark scroll-mt-16">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="font-sans font-bold text-3xl mb-2">What lands on the board</h2>
          <p className="font-mono text-xs text-dim leading-relaxed mb-8">
            The board ranks by tokens or by output, whichever tab you pick. Cache reads are most of the tokens: Claude Code sends the
            conversation again on every turn, so tokens measure how much you used it, and output measures how much it wrote.
          </p>
          <div className="grid sm:grid-cols-2 border-2 border-dark divide-y-2 sm:divide-y-0 divide-dark">
            {METRICS.map(([name, sub], i) => (
              <div key={name} className={`p-6 border-dark ${i % 2 === 1 ? "sm:border-l-2" : ""} ${i >= 2 ? "sm:border-t-2" : ""}`}>
                <div className="font-sans font-bold text-xl mb-1">{name}</div>
                <div className="font-mono text-xs text-dim">{sub}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="py-8 font-mono text-xs text-faint text-center px-4">
        numbers only · off in settings · claude.ai chat is not counted ·{" "}
        <DemoLink where="claude_footer" href="/demo/claude" className="hover:text-alert">demo</DemoLink> ·{" "}
        <Link href="/" className="hover:text-alert">gitstats</Link> ·{" "}
        <Link href="/docs#claude" className="hover:text-alert">docs</Link> ·{" "}
        <Link href="/privacy#claude" className="hover:text-alert">privacy</Link>
      </footer>
    </main>
  );
}
