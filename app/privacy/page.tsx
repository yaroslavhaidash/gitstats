import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/auth";
import { Logo } from "@/components/Logo";
import { openGraphFor } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "Every kind of data gitstats holds, who can see it, and how to take it back. No repo scope, no stored OAuth tokens, numbers only.",
  alternates: { canonical: "/privacy" },
  openGraph: openGraphFor("/privacy"),
};

const STORED: [string, string][] = [
  ["who you are", "Your GitHub login, numeric id, node id, display name and avatar URL, taken from the GitHub profile you sign in with, plus the date you joined."],
  ["your public activity", "What GitHub already publishes about you: your contribution calendar and, per repo you have committed to, weekly commits and lines added and deleted. Collected nightly with a token that belongs to this server, never yours."],
  ["the numbers a linked computer sends", "Per repo and per week and per day: commits, lines added, lines deleted, and the same again for work that is still on an unmerged branch. A guessed main language per repo."],
  ["hashed repo identities", "A linked computer never sends a repo's URL. It sends an HMAC-SHA256 of the normalised remote, keyed with a secret unique to your account, so the same repo from two of your machines counts once. The key is stored here, which means the server can confirm a guess about one specific URL; it cannot turn a hash back into a URL or list your repos."],
  ["repo names, only if you ask", "Names are off until you run gitstats names on. Public repos are matched by hash to names GitHub already publishes."],
  ["your crews and your machines", "Crew membership and invite codes; per linked computer its name, the CLI version, when it last synced and what went wrong if it did."],
  ["read-only tokens, if you add one", "A fine-grained GitHub token is optional. It is encrypted with AES-256-GCM and decrypted only inside the nightly job."],
];

const NEVER: string[] = [
  "your code",
  "diffs",
  "file or folder names",
  "branch names",
  "commit messages",
  "repo URLs (only a keyed hash of one)",
  "your GitHub OAuth access token",
  "anything from repos you did not commit to",
];

export default async function Privacy() {
  const session = await auth();
  return (
    <main className="flex-1">
      <nav className="sticky top-0 z-40 bg-void/90 backdrop-blur-sm border-b-2 border-dark">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Logo href={session ? "/dashboard" : "/"} />
          <div className="hidden md:flex gap-6 font-mono text-sm">
            <a href="#stored" className="hover:text-alert transition-colors">[STORED]</a>
            <a href="#never" className="hover:text-alert transition-colors">[NEVER]</a>
            <a href="#seen" className="hover:text-alert transition-colors">[WHO SEES IT]</a>
            <a href="#yours" className="hover:text-alert transition-colors">[EXPORT / DELETE]</a>
          </div>
          <Link href={session ? "/dashboard" : "/"} className="font-mono text-xs border border-silver px-3 py-1 hover:bg-silver hover:text-void transition-colors">
            {session ? "BOARD" : "HOME"}
          </Link>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <div className="tag mb-4">PRIVACY</div>
        <h1 className="font-sans font-bold text-4xl mb-3">What we keep, and who can see it.</h1>
        <p className="font-mono text-sm text-dim leading-relaxed mb-12">
          gitstats counts commits. To do that it needs numbers about your work, and nothing else. This page lists every
          kind of data the server holds, who can read it, and how to take it back.
        </p>

        <section id="stored" className="mb-14">
          <h2 className="font-sans font-bold text-2xl mb-4">What is stored</h2>
          <dl className="space-y-4">
            {STORED.map(([what, body]) => (
              <div key={what}>
                <dt className="font-mono text-sm text-white">{what}</dt>
                <dd className="font-mono text-xs text-dim leading-relaxed">{body}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section id="never" className="mb-14">
          <h2 className="font-sans font-bold text-2xl mb-4">What is never stored</h2>
          <ul className="font-mono text-xs text-silver flex flex-wrap gap-2 mb-4">
            {NEVER.map((n) => (
              <li key={n} className="border border-dark px-2 py-1">{n}</li>
            ))}
          </ul>
          <p className="font-mono text-xs text-dim leading-relaxed">
            Signing in asks GitHub for <span className="text-silver">read:user</span> and{" "}
            <span className="text-silver">user:email</span>. The <span className="text-silver">repo</span> scope is never
            requested, so nothing here can read or write your code on GitHub. The access token GitHub hands back at
            sign-in is read once to learn who you are and then dropped. It is never written to the database.
          </p>
        </section>

        <section id="seen" className="mb-14">
          <h2 className="font-sans font-bold text-2xl mb-4">Who can see it</h2>
          <p className="font-mono text-xs text-dim leading-relaxed mb-4">
            Only people signed in to gitstats. Apart from the demo board and a card you mint yourself, every board and
            every profile needs a GitHub sign-in. What a signed-in person sees is up to you, set in the matrix under{" "}
            <Link href="/dashboard/settings#visibility" className="text-silver underline hover:text-alert">settings</Link>,
            which has one column for people you share a crew with and one for everyone else:
          </p>
          <ul className="font-mono text-xs text-dim leading-relaxed list-disc pl-5 space-y-2 mb-4">
            <li>whether they can open your page at all,</li>
            <li>whether private repos count in the numbers they see, or only public ones,</li>
            <li>whether repo names are shown, public-only, or hidden, plus a per-repo switch on your own page that hides one name from everybody.</li>
          </ul>
          <p className="font-mono text-xs text-dim leading-relaxed mb-4">
            A new account starts open on the numbers and closed on the names: your page is open to everyone signed in,
            private repos count in both columns, crewmates see the names of public repos and everyone else sees none.
            Your own page always shows you everything. Hidden repo names are masked everywhere, and a repo whose name
            nobody may see has no page at all.
          </p>
          <p className="font-mono text-xs text-dim leading-relaxed">
            <span className="text-silver">Anyone with the link.</span> There is one way out of that: the SHARE button on
            your own page mints a card at a long, unguessable address that opens without a sign-in. It is a third column,
            and you write it yourself every time you press the button. You pick whether it carries the totals, the
            26-week grid and the names of your top three repos, and you see the card before you send it. Because you
            chose to publish it, the card shows your own numbers rather than the column a stranger would get; the only
            thing it will not do is name a repo you hid per repo on your own page. Nothing is stored for a card: the
            address <span className="text-silver">is</span> the permission, signed. <span className="text-silver">New link</span>{" "}
            on the same panel re-signs with a fresh key, which turns every card you sent before it into a 404.
          </p>
        </section>

        <section id="yours" className="mb-14">
          <h2 className="font-sans font-bold text-2xl mb-4">Taking it back</h2>
          <p className="font-mono text-xs text-dim leading-relaxed mb-4">
            Both buttons are under Data on your{" "}
            <Link href="/dashboard/settings#data" className="text-silver underline hover:text-alert">settings page</Link>.
          </p>
          <dl className="space-y-4">
            <div>
              <dt className="font-mono text-sm text-white">export</dt>
              <dd className="font-mono text-xs text-dim leading-relaxed">
                Downloads every row the server holds about you as JSON: profile, settings, crews, linked computers, and
                every weekly and daily number. Secrets (token hashes, encrypted tokens) are left out.
              </dd>
            </div>
            <div>
              <dt className="font-mono text-sm text-white">delete</dt>
              <dd className="font-mono text-xs text-dim leading-relaxed">
                Type your login to confirm and everything above leaves the live site right then: you are gone from
                every board, every page and every export. One copy is held back, in a table only the site owner can
                read, for 30 days (the undo for a delete pressed by mistake), and the nightly job drops it after
                that. Nothing is mined from it and nothing else keeps a copy. A crew you started passes to whoever
                joined first; if you were the last member it goes too. Run <span className="text-silver">gitstats
                unlink</span> on each computer to clear the local config as well.
              </dd>
            </div>
          </dl>
        </section>

        <section id="where" className="mb-14">
          <h2 className="font-sans font-bold text-2xl mb-4">Where it runs</h2>
          <p className="font-mono text-xs text-dim leading-relaxed mb-4">
            The site runs on Vercel and the database is Neon Postgres, both in AWS US East (N. Virginia). Vercel and
            Neon are the only companies that hold this data, because they run the servers it sits on. GitHub is read
            from, never written to.
          </p>
          <p className="font-mono text-xs text-dim leading-relaxed">
            Nothing is sold. Nothing is shared with anyone else. There is no advertising, no tracking pixel and no
            third-party embed. The only cookie is the one that keeps you signed in. Page views are counted by Vercel
            Web Analytics, which is cookieless: it records anonymous page-view counts and nothing that identifies a
            visitor or follows one between sites.
          </p>
        </section>

        <section id="cli" className="mb-14">
          <h2 className="font-sans font-bold text-2xl mb-4">The part that runs on your computer</h2>
          <p className="font-mono text-xs text-dim leading-relaxed">
            The CLI reads your git history the way <span className="text-silver">git log</span> does, as you, and sends
            the numbers above. It shows you everything it found and asks before the first upload. It is open source at{" "}
            <a href="https://github.com/yaroslavhaidash/gitstats-cli" target="_blank" rel="noreferrer" className="text-silver underline hover:text-alert">
              github.com/yaroslavhaidash/gitstats-cli
            </a>
            . One file, under a thousand lines, MIT licensed, with the compiled output committed next to it. Read it, or watch its traffic
            with any proxy. <Link href="/docs" className="text-silver underline hover:text-alert">The docs page</Link>{" "}
            lists every command, including the ones that stop it.
          </p>
        </section>
      </div>
    </main>
  );
}
