import { eq } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { cliTokens } from "@/db/schema";
import { CopyText } from "@/components/CopyText";
import { SetupCommand } from "@/components/SetupCommand";
import { crewByCode } from "@/lib/crews";
import { fmtDateTime } from "@/lib/format";

/** Per request: it reads the session. The stats behind it are cached in lib/cached.ts. */
export const instant = false;

const STEPS = [
  { tag: "01_SIGNED_IN", title: "GitHub sign-in", body: "Done. That only tells us who you are. Your calendar, your public repos and their lines are counted right after it, in about a minute. Link your computer for private and work repos, and for lines per day." },
  { tag: "02_LINK", title: "Run one command on your computer", body: "It opens a page where you confirm the link, scans your home folder for git repos, counts your commits for the last year, shows you exactly what it found, and uploads only after you say yes. Then it schedules itself to re-run daily. Node.js is the only requirement." },
  { tag: "03_DONE", title: "That’s it", body: "Private and work repos show up on your board as soon as the first sync finishes. Repeat on any other computer you commit from." },
];

export default async function Setup({ searchParams }: { searchParams: Promise<{ first?: string }> }) {
  const session = await auth();
  if (!session) redirect("/");
  const { first } = await searchParams;
  const machines = await db.select().from(cliTokens).where(eq(cliTokens.userId, session.user.id));
  const linked = machines.filter((m) => m.lastSyncAt !== null);
  // Which step the user is on: 1 = link a computer, 2 = done.
  const current = linked.length > 0 ? 2 : 1;
  // Step 1 promised an invite code and then sent the founder here; this is the first place it can
  // be shown. Once the first sync has landed the onboarding is over, so the stepper stops counting.
  const crew = first ? await crewByCode(first) : null;
  return (
    <div className="max-w-3xl mx-auto">
      {crew && (
        <div className="border-2 border-alert p-6 mb-10">
          <h2 className="font-sans font-bold text-lg mb-1">{crew.name} is live. Share this with your crew.</h2>
          <p className="font-mono text-xs text-faint mb-4">Anyone who opens it joins the board. It is on the crew page too, whenever you need it again.</p>
          <div className="panel px-4 py-3 overflow-x-auto">
            <CopyText text={`${process.env.NEXT_PUBLIC_APP_URL ?? ""}/join/${crew.code}`} className="text-white text-sm" />
          </div>
        </div>
      )}
      <div className="tag mb-4">{`${linked.length > 0 ? "SETUP" : "STEP 2 OF 2"} // PRIVATE REPOS`}</div>
      <h1 className="font-sans font-bold text-4xl mb-3">Count everything you commit.</h1>
      <p className="font-mono text-sm text-dim mb-10 leading-relaxed">
        GitHub has no permission that hands out commit numbers without also handing out your source code. So we don&apos;t ask GitHub. Your
        computer counts its own repos and sends <span className="text-silver">only numbers</span>: repo, week, commits, lines added, lines deleted.
      </p>

      <div className="grid gap-6 mb-10">
        {STEPS.map((s, i) => (
          <div key={s.tag} className={`relative border-2 p-6 transition-colors ${i === current ? "border-silver" : i < current ? "border-dark opacity-60" : "border-dark"}`}>
            <span className="absolute -top-3 left-4 bg-void tag">{s.tag}</span>
            <h2 className="font-sans font-bold text-lg mt-2 mb-2">{s.title}</h2>
            <p className="font-mono text-xs text-dim leading-relaxed mb-4">{s.body}</p>
            {i === 1 && (
              <>
                <SetupCommand />
                <p className="font-mono text-xs text-faint mt-3">
                  It scans your home directory. Repos elsewhere? Add <span className="text-silver">--root /path</span> (repeatable), or later{" "}
                  <span className="text-silver">gitstats roots add /path</span>. Worktrees and duplicate clones are counted once.
                </p>
              </>
            )}
          </div>
        ))}
      </div>

      <div className="border-2 border-dark p-6 mb-10">
        <h2 className="font-sans font-bold text-lg mb-3">Linked computers</h2>
        {machines.length === 0 ? (
          <p className="font-mono text-xs text-faint">&gt; none yet, this page updates once the command finishes</p>
        ) : (
          <ul className="font-mono text-xs divide-y divide-dark">
            {machines.map((m) => (
              <li key={m.id} className="py-2 flex justify-between gap-4">
                <span className="text-silver">{m.machine}</span>
                <span className={m.lastSyncError ? "text-alert" : m.lastSyncAt ? "text-green" : "text-faint"}>
                  {m.lastSyncError ? `error: ${m.lastSyncError}` : m.lastSyncAt ? `synced ${fmtDateTime(m.lastSyncAt)} · ${m.lastSyncRepos} repos` : "linked, first sync pending"}
                </span>
              </li>
            ))}
          </ul>
        )}
        {linked.length > 0 && (
          <>
            <Link href={first ? `/dashboard/c/${first}` : "/dashboard"} className="btn-brutal inline-block mt-6">OPEN MY BOARD_</Link>
            <p className="font-mono text-xs text-faint mt-4">
              Want to show a number to someone without a GitHub account? <span className="text-silver">SHARE_</span> on your own page mints a card
              anyone can open with no sign-in. You pick what it carries. <Link href="/docs#share" className="text-silver underline hover:text-alert">How it works</Link>.
            </p>
          </>
        )}
        {first && machines.length === 0 && (
          <p className="font-mono text-xs text-faint mt-4">Once the command finishes, reload this page and the button appears. Or skip above and come back via Settings.</p>
        )}
      </div>

      <div className="border-l-2 border-alert pl-5 font-mono text-xs text-dim leading-relaxed space-y-2">
        <p className="text-silver">Why this is safe</p>
        <p>· No GitHub token is created. Nothing gets read or write access to your repos on GitHub.</p>
        <p>· The tool runs as you, on your machine, and reads git history the same way `git log` does.</p>
        <p>· Per repo it sends a keyed hash of the remote URL (HMAC with a key unique to you, so the same repo from two of your machines counts once), a guessed language, and weekly totals. Never file names, paths, branch names, diffs, or code.</p>
        <p>· Repo names are <span className="text-silver">not</span> sent unless you run `gitstats names on`. Without them your own page labels private repos by hash. Public repos are recognised by their hash and keep their name.</p>
        <p>· Honest limit: the hash key is stored on the server, so the server could confirm a guess about a specific URL. It cannot list your repos from it.</p>
        <p>· The CLI is open source: the command runs the code at github.com/yaroslavhaidash/gitstats-cli (~800 lines, compiled output committed alongside the source). Read it, or watch the payload with any proxy.</p>
        <p>· Stop any time with `unlink` (or REVOKE on settings). Every command is explained on the <Link href="/docs" className="text-silver underline hover:text-alert">docs page</Link>.</p>
      </div>
    </div>
  );
}
