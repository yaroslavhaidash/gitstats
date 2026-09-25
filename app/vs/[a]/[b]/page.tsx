import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { PublicShell } from "@/components/PublicShell";
import { SignInPitch } from "@/components/SignInPitch";
import { SignedOut } from "@/components/SiteNav";
import { StatTile } from "@/components/StatTile";
import { SignInButton } from "@/components/Tracked";
import { WindowTabs } from "@/components/WindowTabs";
import { YearCalendar } from "@/components/YearCalendar";
import { signInWithGitHub } from "@/lib/actions";
import { fmt } from "@/lib/format";
import { getHandle } from "@/lib/handle";
import { countStep } from "@/lib/funnel";
import { openGraphFor } from "@/lib/site";
import { visitorLead } from "@/lib/visits";
import { vsSide, type VsSide } from "@/lib/vs";
import { PRESETS, windowLabel, type Preset, type Window } from "@/lib/window";

/** Per request: reads the URL. The stats behind it are cached in lib/cached.ts. */
export const instant = false;

type Props = { params: Promise<{ a: string; b: string }>; searchParams: Promise<{ w?: string }> };

async function visitorIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

/** Presets only, year by default: a pair is a first look, and a year is the fairest one. */
function vsWindow(w: string | undefined): Window {
  return { kind: "preset", value: (PRESETS as readonly string[]).includes(w ?? "") ? (w as Preset) : "year" };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { a, b } = await params;
  const [left, right] = [decodeURIComponent(a), decodeURIComponent(b)];
  return {
    title: `${left} vs ${right}`,
    description: `${left} and ${right} side by side: commits, streak, top language and a year of activity.`,
    openGraph: openGraphFor(`/vs/${left}/${right}`),
    // One page per pair of GitHub accounts is not something a search engine should list.
    robots: { index: false, follow: true },
  };
}

function Notice({ tag, title, body }: { tag: string; title: string; body: string }) {
  return (
    <PublicShell where="vs_nav">
      <div className="max-w-xl mx-auto text-center py-16">
        <div className="tag mb-4">{tag}</div>
        <h1 className="font-sans font-bold text-3xl mb-3">{title}</h1>
        <p className="font-mono text-sm text-dim mb-8">{body}</p>
        <Link href="/" className="btn-ghost px-6 py-3">TRY ANOTHER HANDLE_</Link>
      </div>
    </PublicShell>
  );
}

const lines = (s: VsSide) => (s.lines ? s.lines.additions + s.lines.deletions : 0);

/** "a ahead by N", or level; never a winner, just who is in front on this one number. */
function ahead(label: string, left: VsSide, right: VsSide, value: (s: VsSide) => number, unit = "") {
  const [l, r] = [value(left), value(right)];
  const text = l === r ? `level at ${fmt(l)}${unit}` : `${(l > r ? left : right).login} ahead by ${fmt(Math.abs(l - r))}${unit}`;
  return (
    <li key={label}>
      &gt; {label} · {text}
    </li>
  );
}

function Side({ side, withLines, label, change }: { side: VsSide; withLines: boolean; label: string; change: string }) {
  return (
    <section className="min-w-0">
      <div className="flex items-center gap-4 mb-4">
        <Image src={side.avatarUrl} alt="" width={48} height={48} className="border-2 border-silver" unoptimized />
        <div className="min-w-0">
          <div className="tag mb-1">{side.source === "gitstats" ? "GITSTATS" : "PUBLIC GITHUB"}</div>
          <h2 className="font-sans font-bold text-2xl leading-none truncate">{side.name ?? side.login}</h2>
        </div>
        <Link href={change} className="ml-auto self-start font-mono text-xs text-faint hover:text-alert transition-colors">[change]</Link>
      </div>
      <div className="grid grid-cols-2 gap-[2px] bg-dark border-2 border-dark mb-4">
        {withLines && (
          <StatTile
            label={`lines · ${label}`}
            value={side.lines ? fmt(lines(side)) : "n/a"}
            sub={side.lines ? `+${fmt(side.lines.additions)} −${fmt(side.lines.deletions)}` : "not public on GitHub"}
          />
        )}
        <StatTile label={`commits · ${label}`} value={fmt(side.commits)} />
        <StatTile label="streak" value={`${side.streak}d`} />
        {/* Three tiles without lines: the last one takes the whole row instead of leaving a hole. */}
        <div className={withLines ? "grid" : "col-span-2 grid"}>
          <StatTile label="top language" value={side.topLanguage ?? "none"} />
        </div>
      </div>
      <div className="panel p-4 overflow-x-auto">
        <YearCalendar days={side.days} label={`${side.login} daily contributions, last 52 weeks`} />
      </div>
    </section>
  );
}

/**
 * Signed out: when this visitor typed one side's handle as their own today and that side is not on
 * gitstats yet, the ask is made about them; otherwise it is the plain one.
 */
async function VsSignIn({ sides, ip }: { sides: VsSide[]; ip: string }) {
  const lead = (await visitorLead())?.toLowerCase();
  const own = sides.find((s) => s.source === "github" && s.login.toLowerCase() === lead);
  // The pitch speaks of the last year whatever window the pair is on, so it reads the year numbers.
  const handle = own ? await getHandle(own.login, ip) : null;
  if (handle?.status === "ok") {
    const { data } = handle;
    return <SignInPitch handle={{ login: data.login, commits: data.totalCommits, streak: data.streak, topLanguage: data.topLanguage }} where="vs_pitch" compact />;
  }
  return (
    <section className="border-2 border-alert p-6 flex flex-wrap items-center justify-between gap-6">
      <div className="min-w-0">
        <h2 className="font-sans font-bold text-2xl mb-2">See your private repos and lines too: sign in.</h2>
        <p className="font-mono text-xs text-dim">GitHub sign-in is identity only: no repo access, no token stored.</p>
      </div>
      <form action={signInWithGitHub}>
        <SignInButton where="vs" className="btn-brutal px-8 py-4">SIGN IN WITH GITHUB_</SignInButton>
      </form>
    </section>
  );
}

export default async function VsPage({ params, searchParams }: Props) {
  const [{ a, b }, { w }] = await Promise.all([params, searchParams]);
  const [rawA, rawB] = [decodeURIComponent(a), decodeURIComponent(b)];
  if (rawA.toLowerCase() === rawB.toLowerCase()) redirect(`/vs/${encodeURIComponent(rawA)}`);
  const window = vsWindow(w);
  const ip = await visitorIp();
  const [left, right] = await Promise.all([vsSide(rawA, window, ip), vsSide(rawB, window, ip)]);
  for (const r of [left, right]) {
    if (r.status === "missing") return <Notice tag="NOT FOUND" title="No such GitHub user." body={`GitHub has no account called ${r.login}. Check the spelling and try again.`} />;
  }
  if (left.status !== "ok" || right.status !== "ok") {
    return <Notice tag="BUSY" title="Busy, try in a minute." body="Too many new handles were looked up just now. Pages already looked up today still load." />;
  }
  after(() => countStep("vs_view"));
  const [l, r] = [left.side, right.side];
  const withLines = l.lines !== null && r.lines !== null;
  const noLines = [l, r].filter((s) => s.lines === null).map((s) => s.login);
  const label = windowLabel(window);
  // Reopens the two fields of `/vs` with this pair in them, the clicked side focused.
  const changeHref = (focus: "a" | "b") => `/vs?${new URLSearchParams({ pa: l.login, pb: r.login, focus })}`;
  return (
    <PublicShell where="vs_nav">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div className="min-w-0">
          <div className="tag mb-2">VS // {label.toUpperCase()}</div>
          <h1 className="font-sans font-bold text-4xl leading-tight break-words">
            {l.login} <span className="text-alert">vs</span> {r.login}
          </h1>
        </div>
        <WindowTabs current={window} basePath={`/vs/${l.login}/${r.login}`} />
      </div>

      <ul className="font-mono text-xs text-dim space-y-1 mb-2">
        {withLines && ahead("lines", l, r, lines)}
        {ahead("commits", l, r, (s) => s.commits)}
        {ahead("streak", l, r, (s) => s.streak, "d")}
      </ul>
      <p className="font-mono text-xs text-faint mb-8">
        {withLines
          ? "> both are on gitstats, so lines include the private work each one shares with everyone"
          : `> ${noLines.join(" and ")} ${noLines.length > 1 ? "are" : "is"} compared on public GitHub numbers, which have no lines, so this compares commits`}
      </p>

      <div className="grid md:grid-cols-2 gap-8 mb-12">
        <Side side={l} withLines={withLines} label={label} change={changeHref("a")} />
        <Side side={r} withLines={withLines} label={label} change={changeHref("b")} />
      </div>

      <SignedOut>
        <VsSignIn sides={[l, r]} ip={ip} />
      </SignedOut>
    </PublicShell>
  );
}
