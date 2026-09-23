import { CopyText } from "./CopyText";

export const SETUP_COMMAND = "npx @yaroslavhaidash/gitstats-cli@latest link";

export function SetupCommand() {
  return (
    <div className="panel px-4 py-3 font-mono text-sm overflow-x-auto">
      <span className="text-faint">$ </span>
      <CopyText text={SETUP_COMMAND} className="text-white" />
    </div>
  );
}
