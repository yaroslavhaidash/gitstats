"use client";

import { useState } from "react";

/** Submit button that needs two clicks: the first arms it, the second sends the form. */
export function Confirm({ label, confirm, className = "" }: { label: string; confirm: string; className?: string }) {
  const [armed, setArmed] = useState(false);
  return (
    <button
      type="submit"
      onClick={(event) => {
        if (!armed) {
          event.preventDefault();
          setArmed(true);
        }
      }}
      onBlur={() => setArmed(false)}
      className={`font-mono text-xs transition-colors ${armed ? "text-alert font-bold" : "text-faint hover:text-alert"} ${className}`}
    >
      {armed ? confirm : label}
    </button>
  );
}
