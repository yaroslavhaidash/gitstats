import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Logo } from "@/components/Logo";
import { SignInButton } from "@/components/Tracked";
import { approveOAuth, denyOAuth, signInThenAuthorize, signOutThenAuthorize } from "@/lib/actions";
import { checkAuthorize, publicOrigin, type AuthorizeParams } from "@/lib/oauth";

export const metadata: Metadata = { title: "Connect an app", robots: { index: false } };

/**
 * The consent screen of the OAuth flow behind `/api/mcp`. It names the app and, as the MCP spec
 * requires, the host it will send the member back to; an app that only ever listens on this computer
 * gets a warning, because any local program can claim to be it.
 */
export default async function AuthorizePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const params: AuthorizeParams = Object.fromEntries(Object.entries(raw).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : [])));
  const query = new URLSearchParams(params).toString();
  const [session, checked] = await Promise.all([auth(), checkAuthorize(params, publicOrigin(await headers()))]);
  if (!checked.ok && "redirect" in checked) redirect(checked.redirect);

  const loopbackOnly = checked.ok && checked.client.redirectUris.every((u) => /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(u));
  const redirectHost = checked.ok ? new URL(checked.redirectUri).host : "";
  return (
    <main className="flex-1 grid place-items-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center"><Logo /></div>
        <div className="border-2 border-silver p-8 relative">
          <span className="absolute -top-3 left-4 bg-void tag">CONNECT // MCP</span>
          {!checked.ok ? (
            <>
              <h1 className="font-sans font-bold text-3xl mt-2 mb-2">Can&apos;t connect this app.</h1>
              <p className="font-mono text-sm text-dim">{checked.show}</p>
            </>
          ) : (
            <>
              <h1 className="font-sans font-bold text-3xl mt-2 mb-2 break-words">Connect {checked.client.name}?</h1>
              <p className="font-mono text-sm text-dim mb-2">
                It will read your gitstats numbers as {session ? <span className="text-silver">{session.user.login}</span> : "you"}: your totals, days and repos, your crews&apos; boards, and other
                members&apos; pages only where those are open to you. Read-only; it cannot change anything.
              </p>
              <p className="font-mono text-xs text-faint mb-2">
                You will be sent back to <span className="text-silver break-all">{redirectHost}</span>
                {checked.client.kind === "cimd" && (
                  <>
                    {" "}· app identity <span className="text-silver break-all">{new URL(checked.client.clientId).host}</span>
                  </>
                )}
                . Disconnect it any time in settings.
              </p>
              {loopbackOnly && (
                <p className="font-mono text-xs text-alert mb-2">This app runs on your own computer. Only connect it if you just started it yourself.</p>
              )}
              <div className="mb-8" />
              {session ? (
                <>
                  <form action={approveOAuth}>
                    <input type="hidden" name="request" value={query} />
                    <button className="btn-brutal w-full">ALLOW AS {session.user.login.toUpperCase()}</button>
                  </form>
                  <form action={denyOAuth} className="mt-3 text-center">
                    <input type="hidden" name="request" value={query} />
                    <button className="font-mono text-xs text-faint hover:text-silver cursor-pointer">no, don&apos;t connect</button>
                  </form>
                  <form action={signOutThenAuthorize.bind(null, query)} className="mt-1 text-center">
                    <button className="font-mono text-xs text-faint hover:text-silver cursor-pointer">not {session.user.login}? sign out first</button>
                  </form>
                </>
              ) : (
                <form action={signInThenAuthorize.bind(null, query)}>
                  <SignInButton where="oauth" className="btn-brutal w-full">SIGN IN WITH GITHUB TO CONNECT_</SignInButton>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </main>
  );
}
