"use client";

import { useState } from "react";
import { BadgeCopy } from "./BadgeCopy";
import { CopyText } from "./CopyText";
import { rotateShareLink } from "@/lib/actions";

/**
 * Minting a share link is signing, which only the server can do, so the page hands over a token for
 * each of the eight switch positions and this picks one. No round trip per toggle, and the URL in
 * the box is always the URL the reader will open.
 */
export function SharePanel({ tokens, origin, view, defaultOpen, empty, login }: {
  tokens: Record<string, string>;
  /** This member's login, for the README badge. */
  login: string;
  origin: string;
  view: string;
  defaultOpen: boolean;
  /** Nothing has been counted for this account yet, so a card would only advertise an empty grid. */
  empty: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen && !empty);
  const [totals, setTotals] = useState(true);
  const [grid, setGrid] = useState(true);
  const [names, setNames] = useState(false);
  const flags = `${totals ? "t" : ""}${grid ? "g" : ""}${names ? "n" : ""}` || "-";
  const url = `${origin}/s/${tokens[flags]}`;
  const boxes: [string, string, boolean, (on: boolean) => void][] = [
    ["totals", "commits, +/−, streak", totals, setTotals],
    ["26-week grid", "one cell per day", grid, setGrid],
    ["repo names", "your top 3 by lines · hidden repos stay hidden", names, setNames],
  ];
  return (
    <div className="mb-8" id="share">
      {empty ? (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" disabled className="btn-ghost opacity-40 cursor-not-allowed">
            SHARE_
          </button>
          <span className="font-mono text-xs text-faint">nothing counted yet · the card would be an empty grid</span>
        </div>
      ) : !open ? (
        <button type="button" onClick={() => setOpen(true)} className="btn-ghost cursor-pointer">
          SHARE_
        </button>
      ) : (
        <div className="panel p-6">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <div className="tag mb-2">SHARE CARD</div>
              <p className="font-mono text-xs text-dim leading-relaxed">
                A page anyone with the link can open, no sign-in. It shows this window and this metric.
              </p>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="font-mono text-xs text-faint hover:text-alert transition-colors cursor-pointer">
              [CLOSE]
            </button>
          </div>
          <div className="grid sm:grid-cols-3 gap-3 mb-5">
            {boxes.map(([label, hint, on, set]) => (
              <label key={label} className="flex items-start gap-2 font-mono text-xs cursor-pointer">
                <input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} className="mt-[2px] accent-alert cursor-pointer" />
                <span>
                  <span className="text-silver block">{label}</span>
                  <span className="text-faint block">{hint}</span>
                </span>
              </label>
            ))}
          </div>
          <CopyText text={url} className="block w-full text-xs text-silver break-all border-2 border-dark p-3" />
          <div className="flex flex-wrap items-center gap-4 mt-4">
            <a href={url} target="_blank" rel="noreferrer" className="font-mono text-xs text-faint hover:text-alert transition-colors">
              [OPEN]
            </a>
            <form action={rotateShareLink}>
              <input type="hidden" name="view" value={view} />
              <button type="submit" className="font-mono text-xs text-faint hover:text-alert transition-colors cursor-pointer">
                [NEW LINK]
              </button>
            </form>
            <span className="font-mono text-xs text-faint">&gt; a new link kills every link you shared before it</span>
          </div>
          <div className="tag mt-6 mb-2">README BADGE</div>
          <p className="font-mono text-xs text-dim mb-3">For your GitHub profile: lines over the window you pick, streak and top language, as everyone else sees them.</p>
          <BadgeCopy login={login} where="share_menu" />
        </div>
      )}
    </div>
  );
}
