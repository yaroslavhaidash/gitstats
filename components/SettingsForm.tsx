"use client";

import { useRef, useState, type ReactNode } from "react";
import { UnsavedModal, useUnsavedGuard } from "./UnsavedGuard";

/**
 * A settings form that admits when it is unsaved: the button starts pulsing on the first change,
 * and every way off the page goes through `useUnsavedGuard` first.
 */
export function SettingsForm({ action, children }: { action: (formData: FormData) => Promise<void>; children: ReactNode }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [dirty, setDirty] = useState(false);
  const guard = useUnsavedGuard(dirty, () => {
    setDirty(false);
    formRef.current?.requestSubmit();
  });

  return (
    <form
      ref={formRef}
      action={action}
      onChange={() => setDirty(true)}
      onSubmit={() => setDirty(false)}
      className="font-mono text-sm"
    >
      {children}
      <button className={`w-fit mt-8 ${dirty ? "btn-brutal save-dirty" : "btn-ghost"}`}>{dirty ? "SAVE CHANGES" : "SAVE"}</button>
      {guard.pending && <UnsavedModal onSave={guard.onSave} onDiscard={guard.onDiscard} />}
    </form>
  );
}
