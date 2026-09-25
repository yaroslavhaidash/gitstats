"use client";

import { track } from "@vercel/analytics";
import Link from "next/link";
import type { ReactNode } from "react";
import { beacon } from "@/components/Beacon";
import { SIGNUP_COOKIE, SIGNUP_COOKIE_SECONDS, type SignupCookie } from "@/lib/signup";

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

/** Hands the server where this sign-in started, for the account it may create; see `lib/signup.ts`. */
function rememberSignup(where: string): void {
  const q = new URLSearchParams(window.location.search);
  const value: SignupCookie = { f: where, p: window.location.pathname };
  try {
    if (document.referrer) value.r = new URL(document.referrer).hostname;
  } catch {
    // An unparseable referrer is just an unknown one.
  }
  const us = q.get("utm_source");
  const uc = q.get("utm_campaign");
  if (us) value.us = us;
  if (uc) value.uc = uc;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${SIGNUP_COOKIE}=${encodeURIComponent(JSON.stringify(value))}; Max-Age=${SIGNUP_COOKIE_SECONDS}; Path=/; SameSite=Lax${secure}`;
}

/** A "Sign in with GitHub" submit button that records which placement was clicked. */
export function SignInButton({ where, className, children }: { where: string; className: string; children: ReactNode }) {
  return (
    <button className={className} onClick={() => {
        rememberSignup(where);
        track("signin_click", { where, ...source() });
        beacon({ kind: "signin_click", from: where });
      }}>
      {children}
    </button>
  );
}

/** A link into the demo (the board unless `href` says a page in it) that records which placement was clicked. */
export function DemoLink({ where, href = "/demo", className, children }: { where: string; href?: string; className?: string; children: ReactNode }) {
  return (
    <Link href={href} className={className} onClick={() => track("demo_open", { where })}>
      {children}
    </Link>
  );
}
