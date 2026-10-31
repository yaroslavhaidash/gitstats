import { CopyText } from "./CopyText";

const CLI = "npx --yes @yaroslavhaidash/gitstats-cli@latest";

/**
 * The one panel a member without claudestats rows sees. Counting is on with every linked computer,
 * so a linked member only needs a CLI new enough to count (a sync on the latest), and anyone else
 * the link. Numbers only, as the gitstats CLI already sends.
 */
export function ClaudeSetup({ linked }: { linked: boolean }) {
  const command = linked ? `${CLI} sync` : `${CLI} link`;
  return (
    <div className="panel p-5 mb-8 font-mono text-xs">
      <p className="text-dim mb-3">
        &gt; count your Claude Code usage · tokens per day per model, numbers only
        {linked ? " · run it on the computer you use Claude Code on, or turn counting back on in settings if you turned it off" : " · links this computer, Claude Code included"}
      </p>
      <div className="border-2 border-dark px-4 py-3 text-sm overflow-x-auto">
        <span className="text-faint">$ </span>
        <CopyText text={command} className="text-white" />
      </div>
    </div>
  );
}
