import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { deviceCodes } from "@/db/schema";
import { Logo } from "@/components/Logo";
import { SignInButton } from "@/components/Tracked";
import { confirmDevice, signInThenLink, signOutThenLink } from "@/lib/actions";

export default async function LinkPage({ searchParams }: { searchParams: Promise<{ code?: string; done?: string }> }) {
  const { code = "", done } = await searchParams;
  const session = await auth();
  const [device] = await db.select().from(deviceCodes).where(eq(deviceCodes.code, code.toUpperCase())).limit(1);
  // An unknown code stays a 404 — codes must not be probeable. An expired one is a real code whose
  // ten minutes ran out, and its owner is standing here wondering what happened.
  const expired = device ? device.expiresAt < new Date() : false;
  if (!done && !device) notFound();
  const signIn = signInThenLink.bind(null, code.toUpperCase());
  const signOut = signOutThenLink.bind(null, code.toUpperCase());
  return (
    <main className="flex-1 grid place-items-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center"><Logo /></div>
        <div className="border-2 border-silver p-8 relative">
          <span className="absolute -top-3 left-4 bg-void tag">LINK // {code.toUpperCase()}</span>
          {expired && !done ? (
            <>
              <h1 className="font-sans font-bold text-3xl mt-2 mb-2">This code expired.</h1>
              <p className="font-mono text-sm text-dim mb-2">Link codes last ten minutes. Run it again in the terminal and open the new link:</p>
              <p className="font-mono text-xs text-silver break-all">npx @yaroslavhaidash/gitstats-cli@latest link</p>
            </>
          ) : done ? (
            <>
              <h1 className="font-sans font-bold text-3xl mt-2 mb-2">Linked.</h1>
              <p className="font-mono text-sm text-dim">Go back to the terminal, the first sync is starting. You can close this tab.</p>
            </>
          ) : device?.userId ? (
            <>
              <h1 className="font-sans font-bold text-3xl mt-2 mb-2">Already confirmed.</h1>
              <p className="font-mono text-sm text-dim">The terminal should pick it up within a few seconds.</p>
            </>
          ) : (
            <>
              <h1 className="font-sans font-bold text-3xl mt-2 mb-2">Link this computer?</h1>
              <p className="font-mono text-sm text-dim mb-2">
                <span className="text-silver">{device?.machine}</span> wants to send weekly commit counts and line totals from its local git repos to{" "}
                {session ? <>the profile of <span className="text-silver">{session.user.login}</span></> : "your profile"}.
              </p>
              <p className="font-mono text-xs text-faint mb-2">Numbers only. No file contents, no diffs, no tokens with access to GitHub.</p>
              <p className="font-mono text-xs text-alert mb-8">Only confirm a code you just started with <span className="text-silver">gitstats link</span> in your own terminal. If someone sent you this link, close the tab.</p>
              {session ? (
                <>
                  <form action={confirmDevice}>
                    <input type="hidden" name="code" value={code.toUpperCase()} />
                    <button className="btn-brutal w-full">LINK AS {session.user.login.toUpperCase()}</button>
                  </form>
                  <form action={signOut} className="mt-3 text-center">
                    <button className="font-mono text-xs text-faint hover:text-silver cursor-pointer">not {session.user.login}? sign out first</button>
                  </form>
                </>
              ) : (
                <form action={signIn}>
                  <SignInButton where="link" className="btn-brutal w-full">SIGN IN WITH GITHUB TO LINK_</SignInButton>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </main>
  );
}
