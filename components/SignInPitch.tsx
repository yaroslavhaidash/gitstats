import { SignInButton } from "@/components/Tracked";
import { signInWithGitHub } from "@/lib/actions";
import { statsBadge } from "@/lib/badge";
import { globalBoard } from "@/lib/cached";
import { fmt } from "@/lib/format";

/**
 * Where a handle's public commits over the last year would sit on the global board's commit
 * ordering: one more than the members ahead of it, out of everyone plus them. Nothing is written.
 */
async function wouldRank(commits: number): Promise<{ place: number; of: number }> {
  const board = await globalBoard({ kind: "preset", value: "year" });
  return { place: board.filter((r) => r.commits > commits).length + 1, of: board.length + 1 };
}

export type PitchHandle = { login: string; commits: number; streak: number; topLanguage: string | null };

/**
 * The sign-in ask for a stranger who is not a member yet, made about them: their badge drawn from
 * the public numbers already on the page (rendered here only, never served as a badge URL), the
 * place those numbers would take on the global board, and what linking a computer adds.
 */
export async function SignInPitch({ handle, where, compact = false }: { handle: PitchHandle; where: string; compact?: boolean }) {
  const { place, of } = await wouldRank(handle.commits);
  const badge = statsBadge({ ...handle, window: "year", metric: "commits", additions: 0, deletions: 0 });
  return (
    <section className={`panel ${compact ? "p-5" : "p-6"}`}>
      <h2 className={`font-sans font-bold mb-5 ${compact ? "text-xl" : "text-2xl"}`}>What you get when you sign in, {handle.login}:</h2>
      <ol className={`grid gap-6 mb-6 ${compact ? "md:grid-cols-3" : "md:grid-cols-[minmax(0,420px)_1fr]"}`}>
        <li className="min-w-0">
          <div className="font-mono text-xs text-faint uppercase mb-2">1 · your README badge</div>
          {/* Our own SVG from statsBadge, every string in it escaped; scaled down to fit a phone. */}
          <div className={`${compact ? "max-w-[300px]" : "max-w-[420px]"} [&>svg]:w-full [&>svg]:h-auto`} dangerouslySetInnerHTML={{ __html: badge }} />
          <p className="font-mono text-xs text-faint mt-2">&gt; preview: public repos only · sign in to get the link</p>
        </li>
        <li className={compact ? "contents" : "min-w-0 space-y-6"}>
          <div className="min-w-0">
            <div className="font-mono text-xs text-faint uppercase mb-2">2 · your place on the global board</div>
            <p className="font-mono text-sm text-silver">
              On public commits this year you would be #{fmt(place)} of {fmt(of)}.
            </p>
          </div>
          <div className="min-w-0">
            <div className="font-mono text-xs text-faint uppercase mb-2">3 · your lines and private work</div>
            <p className="font-mono text-sm text-dim">
              Lines added/deleted and private or work repos appear once you link your computer. Numbers only.
            </p>
          </div>
        </li>
      </ol>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <form action={signInWithGitHub}>
          <SignInButton where={where} className="btn-brutal px-8 py-4">SIGN IN WITH GITHUB_</SignInButton>
        </form>
        <p className="font-mono text-xs text-faint">GitHub sign-in is identity only: no repo access, no token stored.</p>
      </div>
    </section>
  );
}
