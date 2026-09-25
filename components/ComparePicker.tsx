"use client";

import { useState } from "react";

const FIELD = "w-full min-w-0 bg-void border-2 border-dark px-4 py-4 font-mono text-sm focus:border-silver outline-none";

/**
 * The two handles of `/vs`. A plain GET form to `/vs`, whose route handler records and redirects:
 * A alone is a lookup (`/gh/<A>`), both are a pair. Swap and the chips only move text between fields.
 */
export function ComparePicker({ a, b, focus, chips }: { a: string; b: string; focus: "a" | "b"; chips: { label: string; logins: string[] }[] }) {
  const [left, setLeft] = useState(a);
  const [right, setRight] = useState(b);
  const input = { maxLength: 39, autoComplete: "off", autoCapitalize: "none", spellCheck: false, className: FIELD } as const;
  return (
    <form action="/vs" className="max-w-2xl">
      <input type="hidden" name="f" value="pick" />
      <div className="grid sm:grid-cols-[1fr_auto_1fr] items-end gap-4 mb-4">
        <label className="block min-w-0">
          <span className="block font-mono text-xs text-faint uppercase mb-2">A · you</span>
          <input {...input} name="a" required value={left} onChange={(e) => setLeft(e.target.value)} autoFocus={focus === "a"} placeholder="your GitHub handle" />
        </label>
        <button
          type="button"
          onClick={() => {
            setLeft(right);
            setRight(left);
          }}
          className="btn-ghost px-4 py-4 font-mono text-sm cursor-pointer"
          aria-label="swap A and B"
          title="swap"
        >
          ⇄
        </button>
        <label className="block min-w-0">
          <span className="block font-mono text-xs text-faint uppercase mb-2">B · them (empty = just look up A)</span>
          <input {...input} name="b" value={right} onChange={(e) => setRight(e.target.value)} autoFocus={focus === "b"} placeholder="any GitHub handle" />
        </label>
      </div>
      {chips.map((group) =>
        group.logins.length === 0 ? null : (
          <div key={group.label} className="flex flex-wrap items-center gap-2 mb-3 font-mono text-xs">
            <span className="text-faint mr-1">{group.label}</span>
            {group.logins.map((login) => (
              <button
                key={login}
                type="button"
                onClick={() => setRight(login)}
                className={`border-2 px-3 py-1 cursor-pointer transition-colors ${login === right ? "border-silver bg-silver text-void" : "border-dark hover:border-silver"}`}
              >
                {login}
              </button>
            ))}
          </div>
        ),
      )}
      <button className="btn-brutal px-8 py-4 mt-3">{right.trim() ? "COMPARE_" : "LOOK UP_"}</button>
    </form>
  );
}
