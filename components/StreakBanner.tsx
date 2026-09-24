"use client";

import Link from "next/link";
import { useState } from "react";

/** A streak milestone or a new record, once: the server has already recorded it as shown, so dismiss only hides it here. */
export function StreakBanner({ text, shareHref }: { text: string; shareHref: string }) {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-2 border-dark px-4 py-3 mb-8 font-mono text-xs">
      <span>
        &gt; <span className="text-white font-bold">{text}</span>
      </span>
      <span className="flex items-center gap-4">
        <Link href={shareHref} className="btn-ghost text-xs">SHARE_</Link>
        <button type="button" onClick={() => setHidden(true)} className="text-faint hover:text-alert transition-colors cursor-pointer">
          [DISMISS]
        </button>
      </span>
    </div>
  );
}
