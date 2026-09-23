"use client";

import { useState } from "react";

/**
 * A destructive admin button. Clicking it only opens the modal shell the unsaved-changes prompt
 * uses; nothing is sent until the exact name has been typed. Two clicks in the same place could
 * ever be one slip — typing the name of the row cannot be, and the name travels with the form so
 * the server can check it against the row it is about to touch.
 */
export function DangerConfirm({
  label,
  title,
  body,
  phrase,
  id,
  action,
}: {
  label: string;
  title: string;
  body: string;
  phrase: string;
  id: number;
  action: (formData: FormData) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const close = () => {
    setOpen(false);
    setTyped("");
  };
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="font-mono text-xs text-faint hover:text-alert transition-colors cursor-pointer">
        {label}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 bg-void/80 flex items-center justify-center px-4" onKeyDown={(e) => e.key === "Escape" && close()}>
          <form action={action} className="panel border-silver w-full max-w-md p-6">
            <input type="hidden" name="id" value={id} />
            <h2 className="font-sans font-bold text-xl mb-2">{title}</h2>
            <p className="font-mono text-xs text-dim mb-6 leading-relaxed">{body}</p>
            <label className="block font-mono text-xs text-faint mb-2">
              type <span className="text-alert">{phrase}</span> to confirm
            </label>
            <input
              name="confirm"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoFocus
              autoComplete="off"
              spellCheck={false}
              className="w-full bg-void border border-dark focus:border-silver outline-none px-3 py-2 font-mono text-sm mb-6"
            />
            <div className="flex flex-wrap gap-3">
              <button type="submit" disabled={typed !== phrase} className="btn-brutal disabled:opacity-30 disabled:pointer-events-none">
                CONFIRM
              </button>
              <button type="button" onClick={close} className="btn-ghost">
                CANCEL
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
