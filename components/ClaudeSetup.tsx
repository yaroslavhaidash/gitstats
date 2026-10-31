import { CopyText } from "./CopyText";

const CLI = "npx --yes @yaroslavhaidash/gitstats-cli@latest";

/**
 * The one panel a member without claudestats rows sees: the command that turns counting on, or, with
 * no computer linked yet, the link that asks for it. Numbers only, as the gitstats CLI already sends.
 */
export function ClaudeSetup({ linked }: { linked: boolean }) {
  const command = linked ? `${CLI} claude on` : `${CLI} link --claude`;
  return (
    <div className="panel p-5 mb-8 font-mono text-xs">
      <p className="text-dim mb-3">
        &gt; count your Claude Code usage · tokens per day per model, numbers only
        {linked ? " · run it on the computer you use Claude Code on" : " · links this computer and turns it on"}
      </p>
      <div className="border-2 border-dark px-4 py-3 text-sm overflow-x-auto">
        <span className="text-faint">$ </span>
        <CopyText text={command} className="text-white" />
      </div>
    </div>
  );
}
