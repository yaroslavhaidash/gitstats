import type { Metadata } from "next";
import { CompareForm } from "@/components/CompareForm";
import { PublicShell } from "@/components/PublicShell";

/** Per request: reads the URL. The stats behind it are cached in lib/cached.ts. */
export const instant = false;

type Props = { params: Promise<{ a: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const a = decodeURIComponent((await params).a);
  return { title: `Compare with ${a}`, robots: { index: false, follow: true } };
}

/** One handle and no opponent yet: ask for the visitor's. Nothing is looked up until both are known. */
export default async function VsOne({ params }: Props) {
  const a = decodeURIComponent((await params).a);
  return (
    <PublicShell where="vs_nav">
      <div className="max-w-xl mx-auto py-16">
        <div className="tag mb-4">VS // {a.toUpperCase()}</div>
        <h1 className="font-sans font-bold text-4xl mb-3">Compare with {a}</h1>
        <p className="font-mono text-sm text-dim mb-8">Type your GitHub handle for a side-by-side. No sign-in.</p>
        <CompareForm login={a} />
      </div>
    </PublicShell>
  );
}
