import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { CommitWeeks } from "@/components/CommitWeeks";
import { CompareForm } from "@/components/CompareForm";
import { PublicShell } from "@/components/PublicShell";
import { SignInButton } from "@/components/Tracked";
import { YearCalendar } from "@/components/YearCalendar";
import { signInWithGitHub } from "@/lib/actions";
import { fmt } from "@/lib/format";
import { getHandle, markMemberViewed, memberLogin } from "@/lib/handle";
import { openGraphFor } from "@/lib/site";

type Props = { params: Promise<{ login: string }> };

async function visitorIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { login } = await params;
  const handle = await getHandle(decodeURIComponent(login), await visitorIp());
  const name = handle.status === "ok" ? handle.data.login : login;
  return {
    title: `${name}'s last year on GitHub`,
    description: `${name}'s public GitHub year: contribution calendar, commits per week, streak, top language and top repos.`,
    alternates: { canonical: `/gh/${name}` },
    openGraph: openGraphFor(`/gh/${name}`),
    // Every GitHub account has a page here; only the ones a member has looked at are worth a crawler's time.
    robots: handle.status === "ok" && handle.memberViewed ? { index: true, follow: true } : { index: false, follow: true },
  };
}

function Notice({ tag, title, body }: { tag: string; title: string; body: string }) {
  return (
    <PublicShell where="handle_nav">
      <div className="max-w-xl mx-auto text-center py-16">
        <div className="tag mb-4">{tag}</div>
        <h1 className="font-sans font-bold text-3xl mb-3">{title}</h1>
        <p className="font-mono text-sm text-dim mb-8">{body}</p>
        <Link href="/" className="btn-ghost px-6 py-3">TRY ANOTHER HANDLE_</Link>
      </div>
    </PublicShell>
  );
}

export default async function HandlePage({ params }: Props) {
  const { login: raw } = await params;
  const login = decodeURIComponent(raw);
  const [session, member] = await Promise.all([auth(), memberLogin(login)]);
  // A member's real page has lines and private work; a signed-in visitor can open it, so go there.
  if (session && member) redirect(`/dashboard/u/${member}`);
  const handle = await getHandle(login, await visitorIp());
  if (handle.status === "missing") {
    return <Notice tag="NOT FOUND" title="No such GitHub user." body={`GitHub has no account called ${login}. Check the spelling and try again.`} />;
  }
  if (handle.status === "busy") {
    return <Notice tag="BUSY" title="Busy, try in a minute." body="Too many new handles were looked up just now. Pages already looked up today still load." />;
  }
  if (session) await markMemberViewed(login);
  const { data } = handle;
  return (
    <PublicShell where="handle_nav">
      <div className="flex items-center gap-5 mb-8">
        <Image src={data.avatarUrl} alt="" width={64} height={64} className="border-2 border-silver" unoptimized />
        <div className="min-w-0">
          <div className="tag mb-2">GITHUB // {data.login.toUpperCase()}</div>
          <h1 className="font-sans font-bold text-4xl leading-none truncate">{data.name ?? data.login}</h1>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-[2px] bg-dark border-2 border-dark mb-3">
        {([
          ["commits · last year", fmt(data.totalCommits)],
          ["streak", `${data.streak}d`],
          ["top language", data.topLanguage ?? "—"],
        ] as const).map(([label, value]) => (
          <div key={label} className="bg-void px-4 py-3 min-w-0">
            <div className="font-mono text-xs text-faint uppercase">{label}</div>
            <div className="font-sans font-bold text-2xl mt-1 text-silver truncate">{value}</div>
          </div>
        ))}
      </div>
      <p className="font-mono text-xs text-faint mb-8">&gt; public GitHub activity only · refreshed at most once a day</p>

      <section className="panel p-6 mb-8">
        <h2 className="font-sans font-bold text-lg mb-4">Last 52 weeks</h2>
        <YearCalendar days={data.days} label={`${data.login} daily contributions, last 52 weeks`} />
        <p className="font-mono text-xs text-faint mt-4">older half on top, newer half below · every public contribution GitHub counts</p>
      </section>

      <div className="grid lg:grid-cols-[3fr_2fr] gap-8 mb-8">
        <section className="panel p-6">
          <h2 className="font-sans font-bold text-lg mb-1">Commits per week</h2>
          <p className="font-mono text-xs text-faint mb-4">last 26 weeks · public repos</p>
          <CommitWeeks weeks={data.weeks} />
          {data.weeksPartial && (
            <p className="font-mono text-xs text-faint mt-3">&gt; GitHub lists a repo&apos;s last 100 active days, so a very busy repo&apos;s older weeks are short here</p>
          )}
        </section>
        <section className="panel">
          <h2 className="font-sans font-bold text-lg px-4 py-3 border-b-2 border-dark">Top public repos</h2>
          {data.repos.length === 0 ? (
            <p className="font-mono text-sm text-dim p-6">&gt; no public commits in the last year_</p>
          ) : (
            <ul className="font-mono text-xs divide-y-2 divide-dark">
              {data.repos.map((r) => (
                <li key={r.nameWithOwner} className="px-4 py-3 flex justify-between gap-4">
                  <span className="min-w-0">
                    <span className="block text-silver truncate">{r.nameWithOwner}</span>
                    <span className="text-faint">{[r.language, r.stars > 0 ? `★ ${fmt(r.stars)}` : null].filter(Boolean).join(" · ")}</span>
                  </span>
                  <span className="text-dim shrink-0">{fmt(r.commits)} commits</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="panel p-6 mb-8">
        <h2 className="font-sans font-bold text-lg mb-1">Compare with {data.login}</h2>
        <p className="font-mono text-xs text-faint mb-4">&gt; type your handle for a side-by-side, no sign-in</p>
        <CompareForm login={data.login} />
      </section>

      <section className="border-2 border-alert p-6 flex flex-wrap items-center justify-between gap-6">
        <div className="min-w-0">
          <h2 className="font-sans font-bold text-2xl mb-2">Lines, private repos, and a crew need your sign-in.</h2>
          <p className="font-mono text-xs text-dim">
            {member ? (
              <>
                Already linked? Your full page is at{" "}
                <Link href={`/dashboard/u/${member}`} className="text-silver underline hover:text-alert">/dashboard/u/{member}</Link>
              </>
            ) : (
              "GitHub sign-in is identity only: no repo access, no token stored."
            )}
          </p>
        </div>
        <form action={signInWithGitHub}>
          <SignInButton where="handle" className="btn-brutal px-8 py-4">SIGN IN WITH GITHUB_</SignInButton>
        </form>
      </section>
    </PublicShell>
  );
}
