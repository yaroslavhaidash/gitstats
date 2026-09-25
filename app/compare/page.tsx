import type { Metadata } from "next";
import { auth } from "@/auth";
import { ComparePicker } from "@/components/ComparePicker";
import { PublicShell } from "@/components/PublicShell";
import { globalBoard } from "@/lib/cached";
import { crewmates } from "@/lib/crews";
import { rankBy } from "@/lib/stats";

/** Per request: reads the session. `proxy.ts` serves this at `/vs` when the URL carries no pair. */
export const instant = false;

export const metadata: Metadata = {
  title: "Compare anyone",
  description: "Two GitHub handles side by side, or one looked up. No sign-in.",
  alternates: { canonical: "/vs" },
  robots: { index: false, follow: true },
};

type Props = { searchParams: Promise<{ pa?: string; pb?: string; focus?: string }> };

const TOP = 5;

export default async function Compare({ searchParams }: Props) {
  const [{ pa, pb, focus }, session] = await Promise.all([searchParams, auth()]);
  const me = session?.user.login ?? "";
  const [mates, board] = session ? await Promise.all([crewmates(session.user.id), globalBoard({ kind: "preset", value: "week" })]) : [[], []];
  const others = (logins: string[]) => logins.filter((l) => l.toLowerCase() !== me.toLowerCase());
  const chips = [
    { label: "crewmates", logins: others(mates.map((m) => m.login)) },
    { label: "global top 5 this week", logins: others(rankBy(board, "lines").map((r) => r.login)).slice(0, TOP) },
  ];
  return (
    <PublicShell where="compare_nav">
      <div className="tag mb-4">VS // ANYONE</div>
      <h1 className="font-sans font-bold text-4xl mb-3">Compare anyone</h1>
      <p className="font-mono text-sm text-dim mb-8">Two GitHub handles side by side, or just A to look one up. No sign-in.</p>
      <ComparePicker a={pa ?? me} b={pb ?? ""} focus={focus === "a" || (!pa && !me) ? "a" : "b"} chips={session ? chips : []} />
    </PublicShell>
  );
}
