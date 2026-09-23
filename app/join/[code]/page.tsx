import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { Logo } from "@/components/Logo";
import { SignInButton } from "@/components/Tracked";
import { joinCrew, signInThenJoin } from "@/lib/actions";
import { crewByCode, crewMemberIds } from "@/lib/crews";

// Deliberately generic: the crew's name belongs to its members, not to a link preview.
export const metadata: Metadata = {
  title: "Join a crew",
  description: "You have been invited to a gitstats crew. Sign in with GitHub to join and get on the board.",
};

export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const code = (await params).code.toUpperCase();
  const crew = await crewByCode(code);
  if (!crew) notFound();
  const [session, members] = await Promise.all([auth(), crewMemberIds(crew.id)]);
  const signInAndJoin = signInThenJoin.bind(null, code);
  return (
    <main className="flex-1 grid place-items-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <div className="border-2 border-silver p-8 relative">
          <span className="absolute -top-3 left-4 bg-void tag">INVITE // {crew.code}</span>
          <h1 className="font-sans font-bold text-3xl mt-2 mb-2">{crew.name}</h1>
          <p className="font-mono text-sm text-dim mb-8">
            {members.length} member{members.length === 1 ? "" : "s"} · public GitHub activity only
          </p>
          {session ? (
            <form action={joinCrew}>
              <input type="hidden" name="code" value={crew.code} />
              <button className="btn-brutal w-full">JOIN AS {session.user.login.toUpperCase()}</button>
            </form>
          ) : (
            <form action={signInAndJoin}>
              <SignInButton where="join" className="btn-brutal w-full">SIGN IN WITH GITHUB TO JOIN_</SignInButton>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
