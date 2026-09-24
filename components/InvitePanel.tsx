"use client";

import { useState, useSyncExternalStore } from "react";
import { countInviteCopy, createFirstCrew } from "@/lib/actions";

const noSubscribe = () => () => {};

/**
 * "Compare with a friend": shown while the viewer is alone, on their own page and on a one-member
 * crew board. With no crew yet the button makes one; after that it is the crew's invite link, with the
 * phone's share sheet where there is one.
 */
export function InvitePanel({ link }: { link: string | null }) {
  const [copied, setCopied] = useState(false);
  // A share sheet only on touch devices that have one; the server render assumes none.
  const canShare = useSyncExternalStore(
    noSubscribe,
    () => typeof navigator.share === "function" && window.matchMedia("(pointer: coarse)").matches,
    () => false,
  );

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      void countInviteCopy();
    } catch {
      /* clipboard blocked; the link is still selectable */
    }
  }

  async function share(url: string) {
    try {
      await navigator.share({ title: "gitstats", text: "Compare coding stats with me on gitstats", url });
      void countInviteCopy();
    } catch (e) {
      // Closing the sheet is not a failure; anything else falls back to the clipboard.
      if (!(e instanceof DOMException && e.name === "AbortError")) await copy(url);
    }
  }

  return (
    <section className="panel p-6 mb-8">
      <h2 className="font-sans font-bold text-lg mb-1">Compare with a friend</h2>
      {link ? (
        <>
          <p className="font-mono text-xs text-faint mb-4">send this link · they sign in with GitHub and land on your board</p>
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-sm text-white select-all break-all">{link}</span>
            <button type="button" onClick={() => copy(link)} className="btn-ghost text-xs">
              {copied ? "COPIED ✓" : "COPY"}
            </button>
            {canShare && (
              <button type="button" onClick={() => share(link)} className="btn-brutal text-xs">
                SHARE
              </button>
            )}
          </div>
        </>
      ) : (
        <>
          <p className="font-mono text-xs text-faint mb-4">you are on your own so far · make a crew and you get a link to send</p>
          <form action={createFirstCrew}>
            <button className="btn-brutal text-xs">CREATE A CREW_</button>
          </form>
        </>
      )}
    </section>
  );
}
