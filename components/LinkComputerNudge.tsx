import Link from "next/link";

/** Shown to a member with no linked computer: public repos are all the snapshot can see. */
export function LinkComputerNudge() {
  return (
    <Link href="/dashboard/setup" className="flex flex-wrap items-center justify-between gap-3 border-2 border-alert px-4 py-3 mb-8 font-mono text-xs hover:bg-alert hover:text-void transition-colors">
      <span>&gt; only public repos are counted for you. Link your computer to count private and work repos too. No GitHub token needed.</span>
      <span className="font-bold">SETUP →</span>
    </Link>
  );
}
