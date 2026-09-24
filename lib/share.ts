import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import type { ShareStats } from "./cached";
import { requireEnv } from "./env";
import { fmt, fmtRank } from "./format";
import { PRESETS, type Metric, type Preset, type Window } from "./window";

/**
 * A share card is a signed URL, not a database row. `/s/<payload>.<signature>` carries the member
 * id, the window, the metric and which parts of the card are on; the signature is an HMAC over that
 * text plus the member's `share_nonce`, so "new link" invalidates every link minted before it by
 * changing the key material rather than by keeping a revocation list.
 */
export type ShareOptions = {
  /** Commits, +/−, active repos and streak. On by default: the numbers are the point of the card. */
  totals: boolean;
  /** The 26-week day grid. On by default. */
  grid: boolean;
  /** Top three repos by lines, minus any the owner hides per repo. Off by default. */
  names: boolean;
  /** The current streak as the headline instead of the metric: the card a streak milestone opens. Off by default. */
  streak: boolean;
  /** The member's best week or month (by the card's window and metric) as the headline: the card a record banner opens. Off by default. */
  record: boolean;
};

export const DEFAULT_SHARE: ShareOptions = { totals: true, grid: true, names: false, streak: false, record: false };

export type SharePayload = { userId: number; window: Window; metric: Metric; options: ShareOptions };

/** 128 bits of the digest. A forger has to find a collision without the secret; 16 bytes is plenty. */
const SIG_BYTES = 16;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function secret(): string {
  return requireEnv("SHARE_SECRET");
}

export function newShareNonce(): string {
  return randomBytes(9).toString("base64url");
}

function encodeWindow(window: Window): string {
  return window.kind === "preset" ? window.value : `${window.from}_${window.to}`;
}

function decodeWindow(text: string): Window | null {
  if ((PRESETS as readonly string[]).includes(text)) return { kind: "preset", value: text as Preset };
  const [from, to] = text.split("_");
  if (!DATE.test(from ?? "") || !DATE.test(to ?? "") || to < from) return null;
  return { kind: "range", from, to };
}

function encodeFlags(o: ShareOptions): string {
  return `${o.totals ? "t" : ""}${o.grid ? "g" : ""}${o.names ? "n" : ""}${o.streak ? "s" : ""}${o.record ? "r" : ""}` || "-";
}

function decodeFlags(text: string): ShareOptions | null {
  if (!/^(-|t?g?n?s?r?)$/.test(text) || text === "") return null;
  return { totals: text.includes("t"), grid: text.includes("g"), names: text.includes("n"), streak: text.includes("s"), record: text.includes("r") };
}

function body({ userId, window, metric, options }: SharePayload): string {
  return [userId, encodeWindow(window), metric, encodeFlags(options)].join("~");
}

function sign(text: string, nonce: string | null): string {
  return createHmac("sha256", secret()).update(`${nonce ?? ""}~${text}`).digest().subarray(0, SIG_BYTES).toString("base64url");
}

export function mintShareToken(payload: SharePayload, nonce: string | null): string {
  const text = body(payload);
  return `${Buffer.from(text).toString("base64url")}.${sign(text, nonce)}`;
}

/** The member id a token claims, before the signature is checked — the only way to find their nonce. */
export function claimedUserId(token: string): number | null {
  const text = decodeBody(token);
  if (text === null) return null;
  const id = Number(text.split("~")[0]);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function decodeBody(token: string): string | null {
  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1) return null;
  try {
    return Buffer.from(token.slice(0, dot), "base64url").toString("utf8");
  } catch {
    return null;
  }
}

/** The payload a token carries, or null when the signature does not match this member's nonce. */
export function readShareToken(token: string, nonce: string | null): SharePayload | null {
  const text = decodeBody(token);
  if (text === null) return null;
  const given = Buffer.from(token.slice(token.indexOf(".") + 1), "base64url");
  const want = Buffer.from(sign(text, nonce), "base64url");
  if (given.length !== want.length || !timingSafeEqual(given, want)) return null;
  const [rawId, rawWindow, rawMetric, rawFlags] = text.split("~");
  const userId = Number(rawId);
  const window = rawWindow === undefined ? null : decodeWindow(rawWindow);
  const options = rawFlags === undefined ? null : decodeFlags(rawFlags);
  if (!Number.isInteger(userId) || userId <= 0 || !window || !options) return null;
  if (rawMetric !== "lines" && rawMetric !== "commits") return null;
  return { userId, window, metric: rawMetric, options };
}

/**
 * The payload a URL carries, after checking its signature against the member's current nonce.
 * Null means 404: an unparseable token, an unknown member, or a link minted before "new link".
 */
export async function resolveShareToken(token: string): Promise<SharePayload | null> {
  const claimed = claimedUserId(token);
  if (claimed === null) return null;
  const [owner] = await db.select({ id: users.id, shareNonce: users.shareNonce }).from(users).where(eq(users.id, claimed)).limit(1);
  if (!owner) return null;
  const payload = readShareToken(token, owner.shareNonce);
  return payload && payload.userId === owner.id ? payload : null;
}

/**
 * The big number on a card and the words after it. The milestone variant leads with the streak, the
 * record variant with the best week or month ever; everything under the headline is the ordinary card.
 */
export function shareHeadline(row: ShareStats["row"], metric: Metric, options: ShareOptions, record: ShareStats["record"], label: string): { headline: string; unit: string } {
  const amount = (n: number) => (metric === "lines" ? fmtRank(n) : fmt(n));
  if (options.streak) return { headline: fmt(row.streak), unit: "day streak" };
  if (options.record && record) {
    const when = new Date(`${record.best.start}T00:00:00Z`).toLocaleDateString("en-GB", { day: record.kind === "week" ? "2-digit" : undefined, month: "short", year: "numeric", timeZone: "UTC" });
    return { headline: amount(record.best[metric]), unit: `${metric} · best ${record.kind} ever · ${record.kind === "week" ? `week of ${when}` : when}` };
  }
  return { headline: amount(metric === "lines" ? row.additions + row.deletions : row.commits), unit: `${metric} ${label}` };
}
