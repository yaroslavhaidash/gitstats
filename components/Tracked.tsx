"use client";

import { track } from "@vercel/analytics";
import Link from "next/link";
import type { ReactNode } from "react";

/** Where this visit came from: the referring host and any `utm_source`, when there is one. */
function source(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    if (document.referrer) out.ref = new URL(document.referrer).hostname;
  } catch {
    // An unparseable referrer is just an unknown one.
  }
  const utm = new URLSearchParams(window.location.search).get("utm_source");
  if (utm) out.utm_source = utm;
  return out;
}

/** A "Sign in with GitHub" submit button that records which placement was clicked. */
export function SignInButton({ where, className, children }: { where: string; className: string; children: ReactNode }) {
  return (
    <button className={className} onClick={() => track("signin_click", { where, ...source() })}>
      {children}
    </button>
  );
}

/** A link to `/demo` that records which placement was clicked. */
export function DemoLink({ where, className, children }: { where: string; className?: string; children: ReactNode }) {
  return (
    <Link href="/demo" className={className} onClick={() => track("demo_open", { where })}>
      {children}
    </Link>
  );
}
