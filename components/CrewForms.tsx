import { createCrew, joinCrew } from "@/lib/actions";

export function CrewForms({ error }: { error?: string }) {
  return (
    <div className="grid md:grid-cols-2 border-2 border-dark divide-y-2 md:divide-y-0 md:divide-x-2 divide-dark">
      <form action={createCrew} className="p-6 flex flex-col gap-4">
        <div className="tag w-fit">01_CREATE</div>
        <h3 className="font-sans font-bold text-xl">Start a crew</h3>
        <p className="font-mono text-sm text-dim">You get a 6-character invite code to send your friends.</p>
        <input
          name="name"
          required
          maxLength={40}
          placeholder="crew name"
          className="bg-void border-2 border-dark px-3 py-2 font-mono text-sm focus:border-silver outline-none"
        />
        {error === "name" && <p className="font-mono text-xs text-alert">&gt; name required</p>}
        <button className="btn-brutal w-fit">CREATE_</button>
      </form>
      <form action={joinCrew} className="p-6 flex flex-col gap-4">
        <div className="tag w-fit">02_JOIN</div>
        <h3 className="font-sans font-bold text-xl">Join with a code</h3>
        <p className="font-mono text-sm text-dim">Paste the code a friend sent you.</p>
        <input
          name="code"
          required
          minLength={6}
          maxLength={6}
          placeholder="ABC123"
          className="bg-void border-2 border-dark px-3 py-2 font-mono text-sm uppercase tracking-widest focus:border-silver outline-none"
        />
        {error === "code" && <p className="font-mono text-xs text-alert">&gt; unknown code</p>}
        <button className="btn-ghost w-fit">JOIN</button>
      </form>
    </div>
  );
}
