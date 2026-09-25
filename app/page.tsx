import Link from "next/link";
import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Logo } from "@/components/Logo";
import { Brackets } from "@/components/Brackets";
import { Glitch } from "@/components/Glitch";
import { CopyText } from "@/components/CopyText";
import { SETUP_COMMAND } from "@/components/SetupCommand";
import { DemoLink, SignInButton } from "@/components/Tracked";
import { signInWithGitHub } from "@/lib/actions";
import { posts } from "@/lib/blog";
import { DEMO_LOGINS } from "@/lib/demo";
import { openGraphFor, SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";

/** Per request: it reads the session. The stats behind it are cached in lib/cached.ts. */
export const instant = false;

export const metadata: Metadata = {
  description: SITE_DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: openGraphFor("/"),
};

/** The hero shows one person's page, because the hero speaks to one visitor. */
const HERO_PAGE = `/demo/u/${DEMO_LOGINS[0]}`;
const PAGE_ALT =
  "A gitstats personal page for a demo developer over a year: commits, lines added and deleted, active repos, streak and stars, then lines per week and a 52-week contribution calendar.";

const JSON_LD = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: SITE_NAME,
  url: SITE_URL,
  applicationCategory: "DeveloperApplication",
  operatingSystem: "Any modern browser; the optional command-line tool needs Node.js on macOS, Linux or Windows",
  description: SITE_DESCRIPTION,
  featureList: [
    "GitHub commit leaderboard for a crew of friends",
    "Commits and lines of code per day, week, month or year",
    "Counts private and work repo commits without a GitHub token",
    "Streaks, stars, active repos and top language per person",
    "Per-repo pages and crew overlaps",
  ],
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  isAccessibleForFree: true,
};

const STEPS = [
  { tag: "01_CONNECT", title: "Sign in with GitHub", body: "Public scope only. We learn who you are and never touch your repos. Public activity is snapshotted nightly." },
  { tag: "02_LINK", title: "One command, once", body: "Your computer counts its own git repos and uploads weekly numbers. Private and work repos included, no GitHub token." },
  { tag: "03_COMPARE", title: "One board", body: "Crews, global board, per-dev pages. Reads only from Postgres, so it loads instantly." },
];

const SAFE = [
  ["no tokens", "The sign-in asks for read:user and user:email, nothing more. Nothing on GitHub can read or write your code on our behalf. (If you would rather not run anything locally, settings takes an optional read-only fine-grained token instead, scoped to repos you pick. It is encrypted at rest and only the nightly job decrypts it.)"],
  ["numbers only", "The CLI sends a keyed hash of each remote URL, a guessed language, per-week and per-day commits / lines added / lines deleted for your commits. Repo names only if you turn them on. No paths, no diffs, no content."],
  ["your machine, your rules", "It runs as you, reads git history the way git log does, and re-runs daily in the background: a launchd job, a scheduled task or a systemd timer, depending on your OS. It also updates itself from npm once a day; sync --no-update skips that. gitstats pause stops the schedule, gitstats unlink removes it entirely. Revoke a computer on the settings page."],
  ["you decide what is shown", "Per profile: who can open it, whether private repos count in what others see, and whether repo names are shown or anonymised."],
  ["auditable", "The CLI and the server are both open source, MIT, so you can check what is sent and what is stored. The CLI is one file, under a thousand lines of TypeScript, with the compiled output committed next to it. Read it, or point a proxy at it. It shows you what it found and asks before the first upload."],
];

const METRICS = [
  ["commits", "per week, month, year"],
  ["lines added", "weekly buckets, default branch"],
  ["lines deleted", "same source, same caveats"],
  ["stars", "across repos you have committed to"],
  ["active repos", "repos with commits in the window"],
  ["streak", "consecutive days with contributions · weekdays-only is a setting"],
];

const WHAT = [
  ["a leaderboard for your crew", "Everyone signs in with GitHub, joins a crew with an invite code, and gets a row: commits, lines added and deleted, active repos, streak, stars, top language. Week, month, or year."],
  ["a page per person", "Lines per week as mirrored bars, a 52-week calendar, and the repos you shipped to, with the numbers per repo."],
  ["a global board", "Everyone who ever signed in, aggregate numbers only. Profiles open only if the person allows it."],
  ["private work included", "Not through GitHub. Your own machine counts its repos and sends numbers. Work repos too, without your employer being involved."],
];

const FAQ = [
  ["Who is this for?", "Anyone who codes and wants to see it add up: solo builders tracking their own pace, and friend groups competing on one board. Sign in, make or join a crew, or just compare on the global board."],
  ["What does GitHub sign-in give you?", "Your login, avatar, and public activity. The scopes are read:user and user:email. We never store the OAuth token and never ask for repo access."],
  ["How do private repos get counted?", "You run one command on your computer. It reads your git history like git log does and uploads weekly totals plus commits and lines per day. No names unless you turn them on, never content."],
  ["Is it safe to run at work?", "Nothing leaves the machine except numbers under a keyed hash. No code, filenames, branch names, or commit messages. It doesn't touch GitHub at all. The source is public and short."],
  ["Why are line counts so big?", "Lockfiles and generated code count as lines, on GitHub and here. Nothing is filtered, because any filter would be a guess."],
  ["How fresh is it?", "GitHub public activity: every night at 03:00 UTC. Linked computers: once a day in the background, or whenever you run sync. The page itself reads only the database, so it is always instant."],
  ["What can others see?", "You choose, in a small matrix in settings: who can open your page, whether private repos count in what others see, and whether repo names show. Numbers are open by default, names are closed by default: your page is open to everyone signed in, private repos count in both columns, crewmates see the names of public repos and everyone else sees none."],
  ["Can I leave?", "Settings → Data. EXPORT hands you every number we hold as JSON; DELETE ACCOUNT wipes your rows, your linked computers and your crew memberships, and signs you out. Run gitstats unlink on your machines to remove the local config too."],
  ["What does it cost?", "It's free. No ads, no tracking, no selling anything."],
];

const VERSUS: [string, string, string][] = [
  ["what it counts", "Commits, issues, pull requests and reviews, as squares with no numbers on them.", "Commits and lines added and deleted, as numbers you can add up and sort by."],
  ["private repos", "A green square, and only once you turn on private contributions. Never a number.", "Counted on your own machine and sent as numbers. No GitHub token, work repos included."],
  ["lines of code per day", "Not shown anywhere. GitHub publishes lines per week, per repo, to the repo's own graphs.", "Per day for every repo a linked computer counted, and per week for the rest, marked as such."],
  ["comparing people", "One profile at a time, in separate tabs.", "A leaderboard: your crew side by side over a week, a month, a year or any range you pick."],
  ["what it is for", "Showing your own year on your own profile.", "Settling who actually shipped this week, among friends."],
];

const LIMITS = [
  ["default branch only", "Contributor stats count commits on the default branch."],
  ["only machines you link", "Private repos are counted on the computers you link; link each one you commit from."],
  ["your git email", "Local counting matches commits to the emails in your GitHub profile and git config; add others in the CLI."],
];

export default async function Landing() {
  if (await auth()) redirect("/dashboard");
  return (
    <main className="flex-1">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }} />
      <nav className="fixed w-full z-40 top-0 bg-void/90 backdrop-blur-sm border-b-2 border-dark">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Logo />
          <div className="hidden md:flex gap-8 font-mono text-sm">
            <DemoLink where="nav" className="hover:text-alert transition-colors">[DEMO]</DemoLink>
            <a href="#how" className="hover:text-alert transition-colors">[HOW]</a>
            <a href="#safe" className="hover:text-alert transition-colors">[SAFE]</a>
            <a href="#metrics" className="hover:text-alert transition-colors">[METRICS]</a>
            <a href="#faq" className="hover:text-alert transition-colors">[FAQ]</a>
            <a href="/docs" className="hover:text-alert transition-colors">[DOCS]</a>
          </div>
          <form action={signInWithGitHub}>
            <SignInButton where="landing_nav" className="font-mono text-xs border border-silver px-3 py-1 hover:bg-silver hover:text-void transition-colors">
              SIGN_IN
            </SignInButton>
          </form>
        </div>
      </nav>

      <section className="relative pt-32 pb-20 lg:pt-44 lg:pb-28 border-b-2 border-dark rail">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <div className="tag mb-6">YOUR YEAR // COMMITS // LINES // STREAKS</div>
            <h1 className="font-sans font-bold text-5xl sm:text-6xl leading-[1.05] mb-6">
              <Glitch text="Your" every={[9000, 18000]} /> coding <Glitch text="stats," every={[8000, 16000]} />
              <br />
              including <span className="text-alert"><Glitch text="private work." every={[7000, 15000]} /></span>
            </h1>
            <p className="font-mono text-silver text-lg mb-8 max-w-lg">
              Type your GitHub handle and see your year in 5&nbsp;seconds. No sign-in.
            </p>
            {/* A plain GET form: Enter submits, and it works before any JavaScript has loaded. */}
            <form action="/gh" className="flex flex-col sm:flex-row gap-4 mb-5 max-w-xl">
              <input
                name="login"
                required
                maxLength={39}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="your GitHub handle"
                aria-label="your GitHub handle"
                className="flex-1 min-w-0 bg-void border-2 border-silver px-5 py-5 font-mono text-base focus:border-alert outline-none"
              />
              <button className="btn-brutal px-10 py-5 text-base">SHOW ME_</button>
            </form>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-sm mb-10">
              <form action={signInWithGitHub}>
                <SignInButton where="landing_hero" className="text-dim underline underline-offset-4 hover:text-alert transition-colors">sign in with GitHub</SignInButton>
              </form>
              <DemoLink where="hero_button" className="text-dim underline underline-offset-4 hover:text-alert transition-colors">see a board</DemoLink>
            </div>
            <p className="font-mono text-dim mb-4 max-w-lg">
              <span className="text-alert">Your commits and lines, next to your friends&apos;.</span> Commits, lines per
              day, active repos, streaks and stars, ranked per week, month or year.
            </p>
            <p className="font-mono text-faint text-sm max-w-lg leading-relaxed">
              Private and work repos count too, without a GitHub token. A year of history the minute you link.
            </p>
          </div>
          <div className="relative">
            <Brackets />
            <DemoLink where="hero_image" href={HERO_PAGE} className="block border-2 border-dark hover:border-alert transition-colors">
              {/* A 1280-wide desktop capture is sub-pixel text on a phone, so small screens get the
                  header and first tiles cropped to what still reads at that size. Both declare the
                  file's own dimensions, so the reserved box matches what loads. */}
              <Image
                src="/demo-personal-mobile.png"
                alt={PAGE_ALT}
                width={640}
                height={293}
                priority
                sizes="100vw"
                className="block sm:hidden w-full h-auto"
              />
              <Image
                src="/demo-personal.png"
                alt={PAGE_ALT}
                width={2560}
                height={1490}
                priority
                sizes="(min-width: 1024px) 45vw, 100vw"
                className="hidden sm:block w-full h-auto"
              />
            </DemoLink>
            <p className="font-mono text-xs text-faint mt-3">&gt; a demo member&apos;s page · generated data, live page · <DemoLink where="hero_caption" href={HERO_PAGE} className="text-silver hover:text-alert">open it</DemoLink></p>
          </div>
        </div>
      </section>

      <section id="what" className="py-20 border-b-2 border-dark rail" style={{ "--rail-delay": "3s" } as CSSProperties}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="font-sans font-bold text-3xl text-center mb-2 glitch">Git stats for friends</h2>
          <p className="font-mono text-dim text-center mb-14">A GitHub commit leaderboard for people who like shipping.</p>
          <div className="grid md:grid-cols-2 gap-6">
            {WHAT.map(([title, body], i) => (
              <div key={title} className="relative border-2 border-dark p-6 lift">
                <span className="absolute -top-3 left-4 bg-void font-mono text-xs text-faint px-1">FEATURE_{String(i + 1).padStart(2, "0")}</span>
                <h3 className="font-sans font-bold text-lg mt-1 mb-2">{title}</h3>
                <p className="font-mono text-xs text-dim leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="how" className="py-20 border-b-2 border-dark rail" style={{ "--rail-delay": "6s" } as CSSProperties}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="font-sans font-bold text-3xl text-center mb-2 glitch">How it works</h2>
          <p className="font-mono text-dim text-center mb-14">Sign in, run one command, compare.</p>
          <div className="grid md:grid-cols-[1fr_auto_1fr_auto_1fr] gap-6 items-stretch">
            {STEPS.map((s, i) => (
              <div key={s.tag} className="contents">
                <div className="relative border-2 border-silver p-6 lift">
                  <span className="absolute -top-3 left-4 bg-void tag">{s.tag}</span>
                  <h3 className="font-sans font-bold text-lg mt-2 mb-2">{s.title}</h3>
                  <p className="font-mono text-xs text-dim leading-relaxed">{s.body}</p>
                </div>
                {i < STEPS.length - 1 && <div className="hidden md:grid place-items-center font-mono text-2xl text-silver">→</div>}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="safe" className="py-20 border-b-2 border-dark rail" style={{ "--rail-delay": "1.5s" } as CSSProperties}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="font-sans font-bold text-3xl text-center mb-2 glitch">Count private repo commits without a token</h2>
          <p className="font-mono text-dim text-center mb-14 max-w-2xl mx-auto">
            GitHub has no permission that gives out commit numbers without also giving out source. So we never ask GitHub for private repos.
          </p>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {SAFE.map(([title, body], i) => (
              <div key={title} className="relative border-2 border-dark p-6 lift">
                <span className="absolute -top-3 left-4 bg-void font-mono text-xs text-faint px-1">SAFE_{String(i + 1).padStart(2, "0")}</span>
                <h3 className="font-sans font-bold text-lg mt-1 mb-2">{title}</h3>
                <p className="font-mono text-xs text-dim leading-relaxed">{body}</p>
              </div>
            ))}
            <div className="relative border-2 border-silver p-6 lift">
              <span className="absolute -top-3 left-4 bg-void tag">THE_COMMAND</span>
              <h3 className="font-sans font-bold text-lg mt-1 mb-2">One command, once</h3>
              <p className="font-mono text-xs text-dim leading-relaxed mb-4">Run it per computer after signing in. Needs Node.js 18+ and git. It shows what it found and asks before uploading.</p>
              <div className="panel px-3 py-2 font-mono text-xs break-all">
                <span className="text-faint">$ </span>
                <CopyText text={SETUP_COMMAND} className="text-white text-xs whitespace-normal break-all" />
              </div>
              <p className="font-mono text-xs text-faint mt-3">&gt; before signing in: <span className="text-silver break-all">npx @yaroslavhaidash/gitstats-cli@latest stats</span> prints your year from this computer and sends nothing</p>
            </div>
          </div>
        </div>
      </section>

      <section id="metrics" className="py-20 border-b-2 border-dark rail" style={{ "--rail-delay": "4.5s" } as CSSProperties}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="font-sans font-bold text-3xl text-center mb-2 glitch">What lands on the board</h2>
          <p className="font-mono text-dim text-center mb-14">Commits and lines of code per day, added up by week, month or year.</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 border-2 border-dark">
            {METRICS.map(([name, sub], i) => (
              <div key={name} className="p-8 border-dark border-b-2 sm:[&:nth-child(2n)]:border-l-2 lg:[&:nth-child(2n)]:border-l-0 lg:[&:nth-child(3n+2)]:border-l-2 lg:[&:nth-child(3n)]:border-l-2 lg:[&:nth-child(n+4)]:border-b-0 sm:[&:nth-child(n+5)]:border-b-0">
                <div className="font-mono text-xs text-faint mb-3">METRIC_{String(i + 1).padStart(2, "0")}</div>
                <div className="font-sans font-bold text-2xl mb-2">{name}</div>
                <div className="font-mono text-xs text-dim">{sub}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="vs" className="py-20 border-b-2 border-dark">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="font-sans font-bold text-3xl text-center mb-2 glitch">gitstats vs GitHub&apos;s contribution graph</h2>
          <p className="font-mono text-dim text-center mb-14">The graph shows that you worked. This shows how much, next to everyone else.</p>
          <div className="border-2 border-dark divide-y-2 divide-dark">
            {VERSUS.map(([aspect, graph, ours]) => (
              <div key={aspect} className="grid md:grid-cols-2 gap-x-8 gap-y-3 p-5">
                <div className="md:col-span-2 font-mono text-xs text-faint uppercase tracking-wide">{aspect}</div>
                <div>
                  <div className="font-mono text-xs text-faint mb-1">GitHub&apos;s graph</div>
                  <p className="font-mono text-xs text-dim leading-relaxed">{graph}</p>
                </div>
                <div>
                  <div className="font-mono text-xs text-alert mb-1">gitstats</div>
                  <p className="font-mono text-xs text-dim leading-relaxed">{ours}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="faq" className="py-20 border-b-2 border-dark rail" style={{ "--rail-delay": "7.5s" } as CSSProperties}>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="font-sans font-bold text-3xl text-center mb-14 glitch">Questions</h2>
          <div className="border-2 border-dark divide-y-2 divide-dark">
            {FAQ.map(([q, a]) => (
              <details key={q} className="group">
                <summary className="flex justify-between items-center gap-4 px-5 py-4 cursor-pointer font-sans font-bold text-base hover:text-alert transition-colors list-none">
                  {q}
                  <span className="font-mono text-faint text-sm transition-transform group-open:rotate-90">›</span>
                </summary>
                <p className="px-5 pb-5 font-mono text-xs text-dim leading-relaxed">{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section id="limits" className="py-20 border-b-2 border-dark">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="font-sans font-bold text-3xl text-center mb-14 glitch">Known limits</h2>
          <div className="flex flex-col gap-6">
            {LIMITS.map(([title, body]) => (
              <div key={title} className="border-l-2 border-alert pl-5">
                <h3 className="font-sans font-bold text-lg mb-1">{title}</h3>
                <p className="font-mono text-xs text-dim leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="py-8 font-mono text-xs text-faint text-center">
        no repo scope · numbers only · free · nightly at 03:00 UTC ·{" "}
        <DemoLink where="footer" className="hover:text-alert">demo</DemoLink> ·{" "}
        <a href="/docs" className="hover:text-alert">docs</a> ·{" "}
        <a href="/changelog" className="hover:text-alert">changelog</a> ·{" "}
        {posts().length > 0 && (
          <>
            <Link href="/blog" className="hover:text-alert">blog</Link> ·{" "}
          </>
        )}
        <Link href="/widget" className="hover:text-alert">readme widget</Link> ·{" "}
        <a href="/privacy" className="hover:text-alert">privacy</a> ·{" "}
        <a href="https://github.com/yaroslavhaidash/gitstats-cli" className="hover:text-alert">cli source</a> ·{" "}
        <a href="https://github.com/yaroslavhaidash/gitstats" className="hover:text-alert">server source</a>
      </footer>
    </main>
  );
}
