"use client";

import { useActionState } from "react";
import { CopyText } from "@/components/CopyText";
import { createMcpToken, type McpTokenState } from "@/lib/actions";

/** Create a personal MCP token. The raw value exists only in this response, so it is shown once, with the Claude Code command around it. */
export function McpTokenForm({ endpoint }: { endpoint: string }) {
  const [state, action, pending] = useActionState<McpTokenState, FormData>(createMcpToken, {});
  return (
    <>
      {state.error && <p className="font-mono text-xs text-alert mb-4">&gt; {state.error}</p>}
      {state.token && (
        <div className="border-2 border-green p-4 mb-6 font-mono text-xs">
          <p className="text-green mb-2">&gt; token created · copy it now, it is not shown again</p>
          <CopyText text={state.token} className="text-white break-all" />
          <p className="text-dim mt-4 mb-2">Claude Code:</p>
          <CopyText text={`claude mcp add --transport http gitstats ${endpoint} --header "Authorization: Bearer ${state.token}"`} className="text-silver break-all" />
        </div>
      )}
      <form action={action} className="grid sm:grid-cols-[1fr_auto] gap-3">
        <input name="label" required maxLength={40} placeholder="label (claude code, cursor…)" className="bg-void border-2 border-dark px-3 py-2 font-mono text-sm focus:border-silver outline-none" />
        <button className="btn-brutal" disabled={pending}>
          CREATE TOKEN_
        </button>
      </form>
    </>
  );
}
