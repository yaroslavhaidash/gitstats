"use client";

import { useState } from "react";

/** Click to copy. Shows the text, flashes "copied". `onCopy` runs once the clipboard has it. */
export function CopyText({ text, className = "", onCopy }: { text: string; className?: string; onCopy?: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          onCopy?.();
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard blocked; the text is still selectable */
        }
      }}
      title="click to copy"
      className={`font-mono text-left hover:text-alert transition-colors select-all ${className}`}
    >
      {text}
      <span className={`ml-2 text-xs ${copied ? "text-green" : "text-faint"}`}>{copied ? "copied ✓" : "[copy]"}</span>
    </button>
  );
}
