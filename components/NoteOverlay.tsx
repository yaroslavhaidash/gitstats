"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { closeNotes, replyToNotes } from "@/lib/actions";
import { fmtDateTime } from "@/lib/format";
import type { Note } from "@/lib/messages";

const INBOX = "/dashboard/inbox";

/**
 * Hides its children on the inbox and for the rest of this visit once the inbox has been open: the
 * page marks the notes read while the layout around it still holds the unread ones it read in
 * parallel, and a client navigation away keeps that layout. Keyed by the newest note, so a newer one
 * shows again.
 */
export function UnreadOnly({ children }: { children: ReactNode }) {
  const path = usePathname();
  const [cleared, setCleared] = useState(false);
  if (path === INBOX && !cleared) setCleared(true);
  return cleared ? null : children;
}

/** Under the nav while a note from the maintainer is unread; one line on any width. */
export function NoteStrip({ count }: { count: number }) {
  return (
    <Link
      href={INBOX}
      className="block border-t-2 border-alert font-mono text-xs text-alert hover:bg-alert hover:text-void transition-colors"
    >
      <span className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 flex justify-between gap-3">
        <span className="truncate">
          &gt; {count} {count === 1 ? "note" : "notes"} from Yaroslav
        </span>
        <span className="font-bold whitespace-nowrap">OPEN →</span>
      </span>
    </Link>
  );
}


/**
 * The maintainer's unread notes over the page, once: a modal `<dialog>` (the page behind is inert,
 * so focus stays inside, and Esc closes it). Closing it any way, or replying, marks the notes seen so
 * it does not open again until a newer one arrives; they stay unread until the inbox is opened.
 */
export function NoteOverlay({ notes, max }: { notes: Note[]; max: number }) {
  const ref = useRef<HTMLDialogElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const upTo = notes[notes.length - 1].id;
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || dialog.open) return;
    dialog.showModal();
    // The title, not the reply box: focusing a textarea would pull up a phone's keyboard over the note.
    title.current?.focus();
  }, []);

  const send = (form: HTMLFormElement) => {
    const data = new FormData(form);
    startTransition(async () => {
      const result = await replyToNotes(upTo, data);
      if (result === "ok") setSent(true);
      else
        setError(
          result === "long" ? `too long: ${max} characters at most` : result === "limit" ? "that is 20 messages this hour; try again later" : "nothing to send: the message was empty",
        );
    });
  };

  return (
    <dialog
      ref={ref}
      onClose={() => void closeNotes(upTo)}
      aria-labelledby="note-title"
      className="m-auto w-[calc(100%-2rem)] max-w-xl max-h-[calc(100dvh-2rem)] overflow-y-auto bg-void text-silver border-2 border-silver shadow-brutal p-0 backdrop:bg-void/85 motion-safe:animate-[note-in_160ms_ease-out]"
    >
      <div className="p-5 sm:p-6 font-mono text-sm">
        <div className="tag mb-3">NOTE</div>
        <h2 id="note-title" ref={title} tabIndex={-1} className="font-sans font-bold text-2xl sm:text-3xl mb-5 outline-none">
          A note from Yaroslav
        </h2>
        <ol className="grid gap-3 mb-5">
          {notes.map((n) => (
            <li key={n.id} className="border-2 border-silver px-4 py-3">
              <p className="text-xs text-faint mb-1">{fmtDateTime(n.createdAt)}</p>
              <p className="whitespace-pre-wrap break-words text-white">{n.body}</p>
            </li>
          ))}
        </ol>
        {sent ? (
          <div className="grid gap-4">
            <p className="text-xs text-dim">&gt; sent. The reply lands in your [INBOX], with the rest of the thread.</p>
            <button type="button" onClick={() => ref.current?.close()} className="btn-ghost justify-self-start cursor-pointer">
              CLOSE
            </button>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(e.currentTarget);
            }}
            className="grid gap-3"
          >
            <label htmlFor="note-reply" className="text-xs text-dim">
              &gt; reply (only Yaroslav reads it)
            </label>
            <textarea
              id="note-reply"
              name="body"
              required
              maxLength={max}
              rows={3}
              placeholder="a reply, feedback, a question…"
              className="bg-void border-2 border-dark focus:border-silver outline-none px-3 py-2 text-sm text-white"
            />
            {error && <p className="text-xs text-alert">&gt; {error}</p>}
            <div className="flex flex-wrap gap-3">
              <button type="submit" disabled={pending} className="btn-brutal cursor-pointer disabled:opacity-60">
                {pending ? "SENDING…" : "REPLY_"}
              </button>
              <button type="button" onClick={() => ref.current?.close()} className="btn-ghost cursor-pointer">
                Later
              </button>
            </div>
          </form>
        )}
      </div>
    </dialog>
  );
}
