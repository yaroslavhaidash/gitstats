import { eq } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { cliTokens, mcpTokens, userTokens, users } from "@/db/schema";
import { BadgeCopy } from "@/components/BadgeCopy";
import { Confirm } from "@/components/Confirm";
import { McpTokenForm } from "@/components/McpTokenForm";
import { SettingsForm } from "@/components/SettingsForm";
import { VisibilityMatrix } from "@/components/VisibilityMatrix";
import { SetupCommand } from "@/components/SetupCommand";
import { addToken, deleteAccountAction, removeToken, revokeMachine, revokeMcpToken, updateStreakMode } from "@/lib/actions";
import { isOutdatedCli } from "@/lib/cli";
import { fmtDateTime } from "@/lib/format";
import { SITE_URL } from "@/lib/site";

const ERRORS: Record<string, string> = {
  label: "give the token a label (e.g. personal)",
  format: "that is not a fine-grained token (they start with github_pat_)",
  rejected: "GitHub rejected the token",
  github: "GitHub did not answer; try again",
  owner: "that token belongs to a different GitHub account",
  profile: "invalid profile settings",
  streak: "pick one of the two streak rules",
  confirm: "type your login exactly to confirm the deletion",
};

type Params = { error?: string; saved?: string; removed?: string; profile?: string; revoked?: string; streak?: string; mcp?: string };

export default async function Settings({ searchParams }: { searchParams: Promise<Params> }) {
  const session = await auth();
  if (!session) redirect("/");
  const uid = session.user.id;
  const [{ error, saved, removed, profile, revoked, streak, mcp }, [me], tokens, machines, assistants] = await Promise.all([
    searchParams,
    db.select().from(users).where(eq(users.id, uid)),
    db.select({ id: userTokens.id, label: userTokens.label, lastError: userTokens.lastError, createdAt: userTokens.createdAt }).from(userTokens).where(eq(userTokens.userId, uid)).orderBy(userTokens.id),
    db.select().from(cliTokens).where(eq(cliTokens.userId, uid)).orderBy(cliTokens.id),
    db.select({ id: mcpTokens.id, label: mcpTokens.label, createdAt: mcpTokens.createdAt, lastUsedAt: mcpTokens.lastUsedAt }).from(mcpTokens).where(eq(mcpTokens.userId, uid)).orderBy(mcpTokens.id),
  ]);
  return (
    <div className="max-w-3xl mx-auto">
      <div className="tag mb-4">SETTINGS // {session.user.login.toUpperCase()}</div>
      <h1 className="font-sans font-bold text-4xl mb-10">Your profile.</h1>

      <section id="computers" className="border-2 border-dark p-6 mb-8 scroll-mt-20">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-sans font-bold text-xl">Linked computers</h2>
          <Link href="/dashboard/setup" className="font-mono text-xs text-faint hover:text-alert">[SETUP GUIDE]</Link>
        </div>
        <p className="font-mono text-xs text-dim mb-6 leading-relaxed">
          Each linked computer counts its own git repos and uploads weekly totals: a keyed hash per repo, a language guess, and numbers. Repo names only if you ran <span className="text-silver">gitstats names on</span>. This is how private and work repos get on the board without any GitHub token.
        </p>
        {revoked && <p className="font-mono text-xs text-dim mb-4">&gt; computer revoked · its next sync will fail until you run link again</p>}
        {machines.length === 0 ? (
          <p className="font-mono text-xs text-faint mb-4">&gt; no computer linked yet. Run this in a terminal:</p>
        ) : (
          <ul className="divide-y divide-dark border-2 border-dark mb-4 font-mono text-sm">
            {machines.map((m) => (
              <li key={m.id} className="px-4 py-3 flex items-center justify-between gap-4">
                <span>
                  <span className="text-white">{m.machine}</span>
                  <span className="text-xs text-faint ml-2">{m.cliVersion ? `v${m.cliVersion}` : "version unknown"}</span>
                  {isOutdatedCli(m.cliVersion) && <span className="text-xs text-amber border border-amber px-1 ml-2">update available</span>}
                  <span className="block text-xs mt-1">
                    {m.lastSyncError ? (
                      <span className="text-alert">last sync failed: {m.lastSyncError}</span>
                    ) : m.lastSyncAt ? (
                      <span className="text-green">synced {fmtDateTime(m.lastSyncAt)} · {m.lastSyncRepos} repos with your commits</span>
                    ) : (
                      <span className="text-faint">linked, waiting for first sync</span>
                    )}
                  </span>
                </span>
                <form action={revokeMachine}>
                  <input type="hidden" name="id" value={m.id} />
                  <button className="text-xs text-faint hover:text-alert">REVOKE</button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <SetupCommand />
        <p className="font-mono text-xs text-faint mt-3 leading-relaxed">
          Runs daily on its own after that. All commands (sync, pause, unlink, names on, emails add…) are on the <Link href="/docs" className="text-silver underline hover:text-alert">docs page</Link>.
        </p>
      </section>

      <section id="visibility" className="border-2 border-dark p-6 mb-8 scroll-mt-20">
        <h2 className="font-sans font-bold text-xl mb-1">What others see</h2>
        <p className="font-mono text-xs text-dim mb-6">Two columns: people you share a crew with, and everyone else signed in. You always see everything on your own page. Neither column covers the share card, which is a link you mint yourself from your own page and hand to anyone, signed out included.</p>
        {profile && <p className="font-mono text-xs text-green mb-4">&gt; saved</p>}
        {error === "profile" && <p className="font-mono text-xs text-alert mb-4">&gt; {ERRORS.profile}</p>}
        <VisibilityMatrix me={me} />
      </section>

      <section id="badge" className="border-2 border-dark p-6 mb-8 scroll-mt-20">
        <h2 className="font-sans font-bold text-xl mb-1">README badge</h2>
        <p className="font-mono text-xs text-dim mb-6">
          For your GitHub profile README: your lines or commits over the last year, this month or this week, your streak and top language, linking to your public GitHub page here. It shows what
          everyone else sees, so with your page closed to everyone it is a plain gitstats badge with no numbers. GitHub caches images, so it updates
          about once an hour at best.
        </p>
        <BadgeCopy login={me.githubLogin} where="settings" preview />
      </section>

      <section id="assistants" className="border-2 border-dark p-6 mb-8 scroll-mt-20">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-sans font-bold text-xl">AI assistants (MCP)</h2>
          <Link href="/docs#mcp" className="font-mono text-xs text-faint hover:text-alert">[SETUP]</Link>
        </div>
        <p className="font-mono text-xs text-dim mb-6 leading-relaxed">
          Ask Claude Code, Codex or Cursor &quot;how was my week&quot; or &quot;am I ahead of my crew&quot;. A token here lets an assistant read what you can see on this site, as
          you: your own numbers, your crews&apos; boards, and other members&apos; pages only where those are open to you. Read-only; it cannot change anything. Revoke it and the next call fails.
        </p>
        {mcp && <p className="font-mono text-xs text-dim mb-4">&gt; token revoked</p>}
        {assistants.length > 0 && (
          <ul className="divide-y divide-dark border-2 border-dark mb-6 font-mono text-sm">
            {assistants.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <span>
                  <span className="text-white">{t.label}</span>
                  <span className="block text-xs text-faint mt-1">
                    created {fmtDateTime(t.createdAt)} · {t.lastUsedAt ? `last used ${fmtDateTime(t.lastUsedAt)}` : "never used"}
                  </span>
                </span>
                <form action={revokeMcpToken}>
                  <input type="hidden" name="id" value={t.id} />
                  <button className="text-xs text-faint hover:text-alert">REVOKE</button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <McpTokenForm endpoint={`${SITE_URL}/api/mcp`} />
      </section>

      <section id="streak-rule" className="border-2 border-dark p-6 mb-8 scroll-mt-20">
        <h2 className="font-sans font-bold text-xl mb-1">What counts as a streak</h2>
        <p className="font-mono text-xs text-dim mb-6">Weekdays only is for people who don&apos;t code at weekends: a Friday-to-Monday run stays unbroken, Saturday and Sunday never break it and never extend it.</p>
        {streak && <p className="font-mono text-xs text-green mb-4">&gt; saved</p>}
        {error === "streak" && <p className="font-mono text-xs text-alert mb-4">&gt; {ERRORS.streak}</p>}
        <SettingsForm action={updateStreakMode}>
          <div className="grid gap-3">
            <label className="flex items-center gap-2">
              <input type="radio" name="streakMode" value="all_days" defaultChecked={me.streakMode === "all_days"} className="accent-[#ff3333]" />
              <span>every day</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="streakMode" value="weekdays" defaultChecked={me.streakMode === "weekdays"} className="accent-[#ff3333]" />
              <span>weekdays only</span>
            </label>
          </div>
        </SettingsForm>
      </section>

      <section id="token" className="border-2 border-dark p-6 mb-6 scroll-mt-20">
        <h2 className="font-sans font-bold text-xl mb-1">Alternative: a read-only GitHub token</h2>
        <p className="font-mono text-xs text-dim mb-4 leading-relaxed">
          Most people don&apos;t need this. Use it if you can&apos;t run the command above (no Node.js, a locked-down machine) or want repos counted that you never clone locally. It lets the nightly job read the repos you pick <span className="text-silver">read-only</span>: it can list commits and line counts but cannot push, change, or delete anything. Org repos need the org to allow fine-grained tokens, and org owners can see that the token exists.
        </p>
        {saved && <p className="font-mono text-xs text-green mb-4">&gt; token saved · snapshot running, refresh your board in a minute</p>}
        {removed && <p className="font-mono text-xs text-dim mb-4">&gt; token deleted · private rows stay until the next snapshot overwrites them</p>}
        {error && error !== "profile" && error !== "streak" && error !== "confirm" && <p className="font-mono text-xs text-alert mb-4">&gt; {ERRORS[error] ?? error}</p>}
        {tokens.length > 0 && (
          <ul className="divide-y divide-dark border-2 border-dark mb-6 font-mono text-sm">
            {tokens.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <span>
                  <span className="text-white">{t.label}</span>
                  <span className="text-faint text-xs ml-3">added {fmtDateTime(t.createdAt)}</span>
                  {t.lastError && <span className="block text-xs text-alert mt-1">&gt; {t.lastError}</span>}
                </span>
                <form action={removeToken}>
                  <input type="hidden" name="id" value={t.id} />
                  <button className="text-xs text-faint hover:text-alert">DELETE</button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <details className="group">
          <summary className="font-mono text-xs text-silver cursor-pointer hover:text-alert">&gt; how to create one, step by step</summary>
          <ol className="font-mono text-xs text-dim leading-relaxed mt-4 space-y-2 list-decimal pl-5">
            <li>Open <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noreferrer" className="text-silver underline hover:text-alert">github.com/settings/personal-access-tokens/new</a>. This is the <em>fine-grained</em> kind; classic tokens are all-or-nothing and won&apos;t be accepted.</li>
            <li><span className="text-silver">Token name:</span> anything, e.g. gitstats. <span className="text-silver">Expiration:</span> the longest offered. You&apos;ll be told here when it stops working.</li>
            <li><span className="text-silver">Resource owner:</span> your own account. One token covers one owner; an org needs its own token, if the org allows it.</li>
            <li><span className="text-silver">Repository access:</span> &quot;All repositories&quot; or &quot;Only select repositories&quot;. Only what you tick can be read.</li>
            <li><span className="text-silver">Repository permissions:</span> Contents → <span className="text-silver">Read-only</span>. Leave every other row on &quot;No access&quot;. Metadata gets added automatically.</li>
            <li>Generate, copy the <span className="text-silver">github_pat_…</span> value, paste it below with a label.</li>
          </ol>
          <p className="font-mono text-xs text-faint mt-3">Stored AES-256 encrypted, decrypted only inside the nightly job. Revoke on GitHub any time; delete here to stop using it.</p>
        </details>
        <form action={addToken} className="grid sm:grid-cols-[1fr_2fr_auto] gap-3 mt-6">
          <input name="label" required maxLength={40} placeholder="label (personal, org…)" className="bg-void border-2 border-dark px-3 py-2 font-mono text-sm focus:border-silver outline-none" />
          <input name="token" type="password" required placeholder="github_pat_…" autoComplete="off" className="bg-void border-2 border-dark px-3 py-2 font-mono text-sm focus:border-silver outline-none" />
          <button className="btn-brutal">ADD_</button>
        </form>
      </section>
      <section id="data" className="border-2 border-dark p-6 mb-6 scroll-mt-20">
        <h2 className="font-sans font-bold text-xl mb-1">Data</h2>
        <p className="font-mono text-xs text-dim mb-6 leading-relaxed">
          Yours to take or to burn. The export is the whole server-side record of you; the delete leaves nothing behind.{" "}
          <Link href="/privacy" className="text-silver underline hover:text-alert">What we keep and who can see it</Link>.
        </p>
        <div className="grid gap-6 font-mono text-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-dim">
              your profile, crews, linked computers, and every weekly and daily number, as JSON
            </span>
            <a href="/api/export" download className="btn-ghost w-fit whitespace-nowrap">EXPORT</a>
          </div>
          <form action={deleteAccountAction} className="grid gap-3 border-2 border-dark p-4">
            <span className="text-xs text-dim leading-relaxed">
              deleting removes your rows, your linked computers and your crew memberships. A crew you started passes to
              whoever joined first; if you were the last one in it, it goes too. Your machines keep their local config
              until you run <span className="text-silver">gitstats unlink</span>, and their next sync fails harmlessly.
              One copy is held for 30 days so a delete by mistake can be undone, then the nightly job drops it.
            </span>
            {error === "confirm" && <p className="text-xs text-alert">&gt; {ERRORS.confirm}</p>}
            <div className="grid sm:grid-cols-[1fr_auto] gap-3">
              <input
                name="confirm"
                required
                autoComplete="off"
                placeholder={`type ${session.user.login} to confirm`}
                aria-label="type your login to confirm"
                className="bg-void border-2 border-dark px-3 py-2 font-mono text-sm focus:border-alert outline-none"
              />
              <Confirm label="[DELETE ACCOUNT]" confirm="[SURE? DELETE EVERYTHING]" className="border-2 border-dark px-3 py-2 hover:border-alert" />
            </div>
          </form>
        </div>
      </section>

    </div>
  );
}
