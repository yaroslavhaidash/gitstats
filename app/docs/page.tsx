import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/auth";
import { Logo } from "@/components/Logo";
import { SetupCommand } from "@/components/SetupCommand";
import { openGraphFor } from "@/lib/site";

export const metadata: Metadata = {
  title: "Docs",
  description:
    "How gitstats counts: public repos from GitHub nightly, private and work repos counted on your own machine. Every CLI command, and every number it sends.",
  alternates: { canonical: "/docs" },
  openGraph: openGraphFor("/docs"),
};

const NPX = "npx @yaroslavhaidash/gitstats-cli@latest";

const COMMANDS: [string, string][] = [
  ["stats", "Count this machine and print the table, without pairing with anything. No account, no upload, no config file, no network call at all \u2014 it reads git and exits. Run it first if you want to see the numbers before you decide. Options: --root <dir> and --email <addr> (both repeatable), --fetch (refresh each repo from its origin first)."],
  ["link", "Pair this computer, scan for repos, show what it found, upload after you confirm, install the background sync. Re-running replaces the previous link. Options: --root <dir> (repeatable, default: your home folder), --yes (skip the confirmation)."],
  ["sync", "Recount the last year and upload now. Safe to run any time; every run replaces the previous numbers, so amends and rebases correct themselves."],
  ["status", "Show server, account, machine, scanned folders, emails, and when the last sync ran."],
  ["pause", "Stop the background sync. Nothing is deleted; `sync` still works by hand."],
  ["resume", "Start the background sync again."],
  ["roots add <dir>", "Also scan this folder (for repos outside your home directory). Syncs right away."],
  ["add <path>", "Track one specific repo wherever it is. Syncs right away."],
  ["emails add <email>", "Count commits made with another email (a work address, an old one). Syncs right away."],
  ["names on", "Also send repo names, so your own page shows them instead of private-xxxx. Whether others see names is a separate setting on your profile."],
  ["names off", "Stop sending names. Already-stored names stay until the next sync replaces them."],
  ["update", "Install the latest published version now. Every sync also checks once a day on its own; config and schedule are untouched."],
  ["unlink", "Revoke this computer on the server, remove the background sync and the local config. Your uploaded numbers stay on the board until you delete your account."],
];

const SENT = [
  ["a keyed hash of the remote URL", "HMAC-SHA256 with a secret unique to you. Same repo on two of your machines = one entry. The server cannot turn it back into a URL; it can only confirm a guess."],
  ["a language guess", "From the extensions of files you changed, lockfiles ignored."],
  ["weekly numbers", "For each Sunday-to-Saturday week: commits, lines added, lines deleted. Your commits only, on the default branch, merge commits excluded."],
  ["commits and lines per day", "For each date: how many commits you made and how many lines you added and deleted, so private repos show on your calendar and in the daily charts."],
  ["pending work", "The same numbers again for commits that only exist on a branch the default branch has not taken in yet. Counted from your pushed branches only — a remote branch whose last commit is under 30 days old — so stale local branches and squash-merged worktrees do not pile up. Shown separately under the numbers on your page — to you and to anyone allowed to see that repo's numbers — and never counted on any board."],
  ["repo name", "Only if you ran `names on`. Off by default."],
];

const NOT_SENT = ["file contents", "diffs", "file or folder names", "branch names", "commit messages", "other people's commits", "anything about repos you did not commit to"];

export default async function Docs() {
  const session = await auth();
  return (
    <main className="flex-1">
      <nav className="sticky top-0 z-40 bg-void/90 backdrop-blur-sm border-b-2 border-dark">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Logo href={session ? "/dashboard" : "/"} />
          <div className="hidden md:flex gap-6 font-mono text-sm">
            <a href="#setup" className="hover:text-alert transition-colors">[SETUP]</a>
            <a href="#commands" className="hover:text-alert transition-colors">[COMMANDS]</a>
            <a href="#data" className="hover:text-alert transition-colors">[DATA]</a>
            <a href="#faq" className="hover:text-alert transition-colors">[FAQ]</a>
            <Link href="/privacy" className="hover:text-alert transition-colors">[PRIVACY]</Link>
            <Link href="/widget" className="hover:text-alert transition-colors">[WIDGET]</Link>
          </div>
          <Link href={session ? "/dashboard" : "/"} className="font-mono text-xs border border-silver px-3 py-1 hover:bg-silver hover:text-void transition-colors">
            {session ? "BOARD" : "HOME"}
          </Link>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <div className="tag mb-4">DOCS // CLI</div>
        <h1 className="font-sans font-bold text-4xl mb-3">How counting works.</h1>
        <p className="font-mono text-sm text-dim leading-relaxed mb-12">
          Public repos are counted from GitHub every night. Everything else is counted <span className="text-silver">on your own computer</span> by a small
          tool that reads your git history and sends only numbers. This page is the whole manual.
        </p>

        <section id="setup" className="mb-14">
          <h2 className="font-sans font-bold text-2xl mb-3">Setup</h2>
          <p className="font-mono text-xs text-dim leading-relaxed mb-4">
            Needs Node.js 18+ and git. Sign in on the site first, then in a terminal:
          </p>
          <div className="mb-4"><SetupCommand /></div>
          <p className="font-mono text-xs text-dim leading-relaxed mb-4">
            Want the numbers first? <span className="text-silver">{NPX} stats</span> runs before <span className="text-silver">link</span>, with no account: it prints the same table and sends nothing.
          </p>
          <ol className="font-mono text-xs text-dim leading-relaxed list-decimal pl-5 space-y-2">
            <li>A browser tab opens asking you to confirm the link for this computer. It opens in whichever browser your OS calls default, so check the account named on that page before you confirm &mdash; if it is not you, hit <span className="text-silver">not you? sign out first</span>. The terminal then prints the account it paired as on its own line. To settle it up front: <span className="text-silver">{NPX} link --user &lt;your-login&gt;</span> refuses the pairing if the browser confirms as anyone else.</li>
            <li>It scans your home folder for git repos and counts your commits for the last year.</li>
            <li>It prints every repo it found with totals and asks <span className="text-silver">Upload? [Y/n]</span>. Nothing is sent before you answer.</li>
            <li>It installs a background sync (macOS launchd, Windows Task Scheduler, Linux systemd user timer) that re-runs every day, also after the machine was off.</li>
          </ol>
          <p className="font-mono text-xs text-dim leading-relaxed mt-4">
            Repos outside your home folder: <span className="text-silver">{NPX} link --root /path --root /other</span>. Run it on every computer you commit from.
          </p>
        </section>

        <section id="commands" className="mb-14">
          <h2 className="font-sans font-bold text-2xl mb-3">Commands</h2>
          <p className="font-mono text-xs text-dim leading-relaxed mb-4">
            Two ways to run them. Always works: <span className="text-silver">{NPX} &lt;command&gt;</span>. Shorter: add{" "}
            <span className="text-silver">~/.gitstats/bin</span> to your PATH once and use <span className="text-silver">gitstats &lt;command&gt;</span>.
          </p>
          <pre className="panel px-4 py-3 font-mono text-xs overflow-x-auto mb-6"><span className="text-faint"># zsh / bash, once:</span>{"\n"}echo &apos;export PATH=&quot;$HOME/.gitstats/bin:$PATH&quot;&apos; &gt;&gt; ~/.zshrc &amp;&amp; source ~/.zshrc</pre>
          <dl className="border-2 border-dark divide-y divide-dark">
            {COMMANDS.map(([cmd, body]) => (
              <div key={cmd} className="grid sm:grid-cols-[200px_1fr] gap-1 sm:gap-2 px-4 py-3">
                <dt><code className="font-mono text-sm text-white">{cmd}</code></dt>
                <dd className="font-mono text-xs text-dim leading-relaxed">{body}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section id="data" className="mb-14">
          <h2 className="font-sans font-bold text-2xl mb-3">What leaves your computer</h2>
          <dl className="border-2 border-dark divide-y divide-dark mb-6">
            {SENT.map(([what, body]) => (
              <div key={what} className="grid sm:grid-cols-[200px_1fr] gap-1 sm:gap-2 px-4 py-3">
                <dt className="font-mono text-sm text-white">{what}</dt>
                <dd className="font-mono text-xs text-dim leading-relaxed">{body}</dd>
              </div>
            ))}
          </dl>
          <p className="font-mono text-xs text-dim leading-relaxed mb-2">Never sent:</p>
          <ul className="font-mono text-xs text-silver flex flex-wrap gap-2 mb-6">
            {NOT_SENT.map((n) => (
              <li key={n} className="border border-dark px-2 py-1">{n}</li>
            ))}
          </ul>
          <p className="font-mono text-xs text-dim leading-relaxed">
            No GitHub token is created and nothing gets access to your GitHub account. The tool runs as you, on your machine, like `git log` does.
            The source is public at{" "}
            <a href="https://github.com/yaroslavhaidash/gitstats-cli" target="_blank" rel="noreferrer" className="text-silver underline hover:text-alert">
              github.com/yaroslavhaidash/gitstats-cli
            </a>{" "}
            (one file, under a thousand lines, MIT). Read it before you run it, or watch its traffic with any proxy.
          </p>
        </section>

        <section id="share" className="mb-14">
          <h2 className="font-sans font-bold text-2xl mb-3">Showing a number to someone who is not here</h2>
          <p className="font-mono text-xs text-dim leading-relaxed mb-3">
            Everything else on the site needs a GitHub sign-in. The share card does not: <span className="text-silver">SHARE_</span> on your own page
            mints a link anyone can open, carrying the window and the metric you were looking at.
          </p>
          <p className="font-mono text-xs text-dim leading-relaxed">
            Three switches decide what travels with it &mdash; the totals, the 26-week day grid, and your top three repos by lines. Repo names are off
            by default, and a repo you hid on your own page stays hidden whatever you pick. The link is signed, so it cannot be edited into someone
            else&apos;s numbers, and <span className="text-silver">new link</span> on the same panel makes every card you minted before it a 404.
          </p>
        </section>

        <section id="faq" className="mb-14">
          <h2 className="font-sans font-bold text-2xl mb-4">Questions</h2>
          <dl className="space-y-6 font-mono text-xs leading-relaxed">
            <div><dt className="text-silver mb-1">Can I see the numbers without signing up?</dt><dd className="text-dim">Yes. `npx @yaroslavhaidash/gitstats-cli@latest stats` scans this computer, prints the per-repo table and the year&apos;s totals, and exits. It pairs with nothing, uploads nothing, writes no config and makes no network call \u2014 it only reads your git history. If you like what you see, run `link`.</dd></div>
            <div><dt className="text-silver mb-1">Is my work repo safe?</dt><dd className="text-dim">Yes. Only weekly counts of your own commits leave the machine, under a keyed hash instead of the repo name. No content, names, paths, or branch names. Nothing touches your employer&apos;s GitHub org.</dd></div>
            <div><dt className="text-silver mb-1">Which commits count?</dt><dd className="text-dim">Commits on the default branch (origin/main or whatever origin/HEAD points to) authored by one of your emails, last 365 days, merge commits excluded. Squash-merged PRs count once. Work sitting on an unmerged branch is counted separately as &ldquo;pending&rdquo; by a linked computer: it shows as a faint line under the numbers on your page and as hatched caps on your lines-per-week chart — visible to whoever may see those repos&rsquo; numbers, which is your crewmates when you share private repos with them — and it never counts toward a board ranking. Only branches you have pushed count, and only while their last commit is under 30 days old; branches that live on your laptop alone are ignored. On the board, WEEK means this calendar week — Monday 00:00 UTC up to today, not the last seven days — MONTH means the 1st of this month up to today, and YEAR is the last 365 days.</dd></div>
            <div><dt className="text-silver mb-1">Some of my commits are missing.</dt><dd className="text-dim">Usually the email. Run `status` to see which emails are matched, then `emails add you@work.com`. Or the repo is outside your home folder: `roots add /path`.</dd></div>
            <div><dt className="text-silver mb-1">Why are the line counts huge?</dt><dd className="text-dim">Lockfiles, generated code and vendored files count as lines, same as on GitHub. The language guess ignores lockfiles, the line totals do not.</dd></div>
            <div><dt className="text-silver mb-1">I have several worktrees or clones of one repo.</dt><dd className="text-dim">Counted once. The primary clone wins; they all read the same origin/HEAD.</dd></div>
            <div><dt className="text-silver mb-1">Two laptops?</dt><dd className="text-dim">Run `link` on both. The same repo from both machines is one entry, whichever synced last wins, and they agree because both read origin/HEAD.</dd></div>
            <div><dt className="text-silver mb-1">How do I stop it?</dt><dd className="text-dim">`pause` keeps the link but stops the background runs. `unlink` revokes the computer, removes the schedule and the local config. You can also hit REVOKE on your settings page; the machine&apos;s next sync then fails harmlessly.</dd></div>
            <div><dt className="text-silver mb-1">How does it update?</dt><dd className="text-dim">On its own, daily. Every sync checks the npm registry at most once a day and, when there is a newer version, installs it and finishes the sync under it — your config and the schedule are untouched. If the check fails you keep the version you have and the reason lands in ~/.gitstats/sync.log. `gitstats update` forces it now, `gitstats sync --no-update` skips the check.</dd></div>
            <div><dt className="text-silver mb-1">Who sees what?</dt><dd className="text-dim">Your settings page has a two-column matrix: crewmates on one side, everyone else signed in on the other. Per column you pick whether they can open your page, whether private repos count in the numbers they see, and whether repo names are shown, public-only, or hidden. New accounts start open on the numbers and closed on the names: your page is open to everyone signed in, private repos count in both columns, crewmates see public repo names and everyone else sees none. On your own page each repo also has a [hide name] switch that beats the matrix, for the one client repo you would rather not name.</dd></div>
            <div><dt className="text-silver mb-1">Can I get my data out, or delete it?</dt><dd className="text-dim">Both, on your settings page under Data. EXPORT downloads every row we hold about you as JSON — profile, crews, linked computers, weekly and daily numbers. DELETE ACCOUNT asks you to type your login, then removes all of it from the site and signs you out; a crew you started passes to whoever joined first, and an empty one is deleted. One copy is kept for 30 days, readable only by the site owner, so a delete pressed by mistake can be undone; after that the nightly job drops it. Run `unlink` on each computer to clear the local config as well.</dd></div>
            <div><dt className="text-silver mb-1">Where does it keep things?</dt><dd className="text-dim">~/.gitstats/config.json (your link token, mode 600), ~/.gitstats/cli (the installed copy), ~/.gitstats/sync.log (background runs), plus one launchd plist / scheduled task / systemd timer, named after the config directory (com.gitstats.sync.&lt;hash&gt; on macOS) so a second install under another HOME cannot replace or remove this machine&apos;s job.</dd></div>
          </dl>
        </section>
      </div>
    </main>
  );
}
