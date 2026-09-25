"use client";

import Link from "next/link";
import { countCliBannerCopy } from "@/lib/actions";
import { CopyText } from "./CopyText";

const COMMAND = "npx --yes @yaroslavhaidash/gitstats-cli@latest link";

/**
 * Under the nav of every signed-in page while the member has no linked computer; it cannot be
 * dismissed and goes away on its own once a machine links. Amber, since nothing is broken: it says
 * what is missing. On a phone, where nobody runs the command, it is one line to the setup page.
 */
export function CliBanner() {
  return (
    <div className="border-t-2 border-amber font-mono text-xs text-amber">
      <Link href="/dashboard/setup" className="sm:hidden flex justify-between gap-3 px-4 py-2 hover:bg-amber hover:text-void transition-colors">
        <span className="truncate">&gt; public repos only · private, work and daily lines missing</span>
        <span className="font-bold whitespace-nowrap">LINK →</span>
      </Link>
      <div className="hidden sm:flex max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 flex-wrap items-center gap-x-4 gap-y-1">
        <span>&gt; You&apos;re seeing public repos only. Your private and work commits and your lines per day are missing.</span>
        <span className="border border-amber px-2 py-0.5 bg-void">
          <span className="text-faint">$ </span>
          <CopyText text={COMMAND} className="text-white" onCopy={() => void countCliBannerCopy()} />
        </span>
        <Link href="/docs#data" className="underline underline-offset-2 hover:text-white transition-colors">what it sends / is it safe</Link>
      </div>
    </div>
  );
}
