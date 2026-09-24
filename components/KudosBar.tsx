import { giveKudos } from "@/lib/actions";
import type { KudosView } from "@/lib/kudos";

/**
 * The kudos count on a member page. Anyone who can open the page sees the numbers; a signed-in
 * visitor gets the button; only the member reading their own page sees who gave.
 */
export function KudosBar({ login, view, canGive }: { login: string; view: KudosView; canGive: boolean }) {
  return (
    <section id="kudos" className="flex flex-wrap items-center gap-x-6 gap-y-3 font-mono text-xs mb-8 scroll-mt-20">
      <span className="text-dim">
        <span className="text-white font-bold">{view.week}</span> kudos this week · <span className="text-white font-bold">{view.allTime}</span> all time
      </span>
      {canGive && (
        <form action={giveKudos}>
          <input type="hidden" name="login" value={login} />
          <button className={`${view.given ? "btn-ghost" : "btn-brutal"} text-xs px-4 py-2 cursor-pointer`}>{view.given ? "TAKE BACK KUDOS_" : "GIVE KUDOS_"}</button>
        </form>
      )}
      {view.givers && view.givers.length > 0 && (
        <span className="text-faint">
          from{" "}
          {view.givers.map((g, i) => (
            <span key={g.login}>
              {i > 0 && ", "}
              <span className={g.thisWeek ? "text-silver" : undefined}>{g.login}</span>
              {g.total > 1 && ` ×${g.total}`}
            </span>
          ))}
        </span>
      )}
    </section>
  );
}
