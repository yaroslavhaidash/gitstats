import Link from "next/link";
import { Confirm } from "@/components/Confirm";
import { leaveCrewAction, regenerateCodeAction, removeMemberAction, renameCrewAction } from "@/lib/actions";

export type CrewMember = { userId: number; login: string; name: string | null };

const INPUT = "bg-void border-2 border-dark px-3 py-2 font-mono text-sm focus:border-silver outline-none";

/** Creator-only crew admin, revealed by `?manage=1` on the crew board. */
export function CrewManage({
  code,
  name,
  ownerId,
  members,
  notice,
  error,
  back,
  window,
}: {
  code: string;
  name: string;
  ownerId: number;
  members: CrewMember[];
  notice?: string;
  error?: string;
  /** The board this panel sits on, with its window query, for [CLOSE]. */
  back: string;
  /** The board's window as a query string, so an action's redirect comes back to the same one. */
  window: string;
}) {
  return (
    <section className="panel p-6 mb-8 grid gap-6">
      <div className="flex items-center justify-between gap-4">
        <h2 className="font-sans font-bold text-xl">Manage crew</h2>
        <Link href={back} className="font-mono text-xs text-faint hover:text-alert">[CLOSE]</Link>
      </div>
      {notice && <p className="font-mono text-xs text-green">&gt; {notice}</p>}
      {error === "name" && <p className="font-mono text-xs text-alert">&gt; name required</p>}

      <form action={renameCrewAction} className="grid sm:grid-cols-[1fr_auto] gap-3">
        <input name="name" required maxLength={40} defaultValue={name} aria-label="crew name" className={INPUT} />
        <input type="hidden" name="code" value={code} />
        <input type="hidden" name="w" value={window} />
        <button className="btn-ghost w-fit">RENAME</button>
      </form>

      <form action={regenerateCodeAction} className="flex flex-wrap items-center justify-between gap-3">
        <span className="font-mono text-xs text-dim">
          invite code <span className="text-silver">{code}</span> · a new one kills the old link for anyone who still has it
        </span>
        <input type="hidden" name="code" value={code} />
        <input type="hidden" name="w" value={window} />
        <Confirm label="[NEW CODE]" confirm="[SURE? NEW CODE]" />
      </form>

      <div className="grid gap-2">
        <span className="font-mono text-xs text-faint uppercase tracking-wide">members</span>
        <ul className="divide-y divide-dark border-2 border-dark font-mono text-sm">
          {members.map((m) => (
            <li key={m.userId} className="px-4 py-2 flex items-center justify-between gap-4">
              <span className="truncate">
                {m.name ?? m.login}
                <span className="text-faint text-xs ml-2">{m.login}</span>
                {m.userId === ownerId && <span className="text-faint text-xs ml-2">admin</span>}
              </span>
              {m.userId !== ownerId && (
                <form action={removeMemberAction}>
                  <input type="hidden" name="code" value={code} />
                  <input type="hidden" name="w" value={window} />
                  <input type="hidden" name="userId" value={m.userId} />
                  <Confirm label="[REMOVE]" confirm="[SURE?]" />
                </form>
              )}
            </li>
          ))}
        </ul>
      </div>

      <form action={leaveCrewAction} className="flex flex-wrap items-center justify-between gap-3">
        <span className="font-mono text-xs text-dim">
          leaving hands the crew to whoever joined first · if you are the last one, the crew is deleted
        </span>
        <input type="hidden" name="code" value={code} />
        <Confirm label="[LEAVE CREW]" confirm="[SURE? LEAVE]" />
      </form>
    </section>
  );
}
