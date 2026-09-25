import { SignInButton } from "@/components/Tracked";
import { signInWithGitHub } from "@/lib/actions";

/**
 * Sits right under the title of a page built from public GitHub numbers, so a signed-out visitor
 * learns why it is thin before reading any of it. Render it inside `SignedOut`.
 */
export function PublicOnlyNotice({ where }: { where: string }) {
  return (
    <section className="panel p-4 mb-6 flex flex-wrap items-center gap-x-6 gap-y-3">
      <p className="font-mono text-sm text-dim min-w-0 flex-1 basis-72">
        This is only public GitHub activity, so it&apos;s incomplete: no lines added/deleted, no private or work repos. Sign in with
        GitHub and link your computer to see the full picture.
      </p>
      <form action={signInWithGitHub}>
        <SignInButton where={where} className="btn-brutal px-5 py-3 text-sm">SIGN IN WITH GITHUB_</SignInButton>
      </form>
    </section>
  );
}
