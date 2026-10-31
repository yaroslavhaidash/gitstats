import { and, between, eq } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { db } from "@/db";
import { claudeDaily, cliTokens } from "@/db/schema";

/** Claude Code's first public release was in 2025; an earlier date is a clock bug. */
export const CLAUDE_FROM = "2025-01-01";

/** One UTC day of one model on one machine, as the CLI counted it from the member's own logs. */
export type ClaudeDay = {
  date: string;
  model: string;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  replies: number;
  sessions: number;
};

export type ClaudeUpload = {
  /** HMAC of the platform id and Claude dir, so the server never sees either. */
  machine: string;
  /** The window this upload replaces for that machine, inclusive. */
  from: string;
  to: string;
  /** The highest Claude Code version seen in the window; null when the CLI sent none. */
  version: string | null;
  days: ClaudeDay[];
};

const MAX_SPAN_DAYS = 1_000;
const MAX_DAYS = 8_000;
const MAX_TOKENS = 1e13;
const MAX_REPLIES = 1e6;
const MAX_SESSIONS = 1e5;
/** Rows per INSERT. `claude_daily` binds 10 values a row, and Postgres allows 65,535 per statement. */
const ROWS_PER_INSERT = 2_000;

function isCalendarDay(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

function isCount(value: unknown, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= max;
}

function parseDay(value: unknown, from: string, to: string): ClaudeDay | null {
  if (typeof value !== "object" || value === null) return null;
  const { date, model, input, output, cacheRead, cacheWrite, replies, sessions } = value as Record<string, unknown>;
  if (!isCalendarDay(date) || date < from || date > to) return null;
  if (typeof model !== "string" || !/^[a-z0-9][a-z0-9.\-]{0,63}$/.test(model)) return null;
  if (!isCount(input, MAX_TOKENS) || !isCount(output, MAX_TOKENS) || !isCount(cacheRead, MAX_TOKENS) || !isCount(cacheWrite, MAX_TOKENS)) return null;
  if (!isCount(replies, MAX_REPLIES) || !isCount(sessions, MAX_SESSIONS)) return null;
  return { date, model, input, output, cacheRead, cacheWrite, replies, sessions };
}

/**
 * The optional `claude` field of an ingest payload: null when absent (every CLI before 0.5.0),
 * "invalid" for anything malformed, which rejects the whole field and nothing else. `today` is the
 * server's UTC date; one day ahead is allowed for clock skew.
 */
export function parseClaudeUpload(value: unknown, today: string): ClaudeUpload | null | "invalid" {
  if (value === undefined || value === null) return null;
  if (typeof value !== "object" || Array.isArray(value)) return "invalid";
  const o = value as Record<string, unknown>;
  if (typeof o.machine !== "string" || !/^[0-9a-f]{32}$/.test(o.machine)) return "invalid";
  if (!isCalendarDay(o.from) || !isCalendarDay(o.to)) return "invalid";
  if (o.from < CLAUDE_FROM || o.from > o.to || o.to > addDays(today, 1)) return "invalid";
  if (o.to > addDays(o.from, MAX_SPAN_DAYS)) return "invalid";
  let version: string | null = null;
  if (o.version !== undefined && o.version !== null) {
    if (typeof o.version !== "string" || !/^\d{1,4}\.\d{1,4}\.\d{1,4}$/.test(o.version)) return "invalid";
    version = o.version;
  }
  if (!Array.isArray(o.days) || o.days.length > MAX_DAYS) return "invalid";
  const days: ClaudeDay[] = [];
  const seen = new Set<string>();
  for (const raw of o.days) {
    const day = parseDay(raw, o.from, o.to);
    if (!day) return "invalid";
    const key = `${day.date}\0${day.model}`;
    if (seen.has(key)) return "invalid";
    seen.add(key);
    days.push(day);
  }
  return { machine: o.machine, from: o.from, to: o.to, version, days };
}

/**
 * Replace this machine's window with the upload, in one transaction: the CLI recounts the whole
 * window every sync, and a machine never touches another machine's rows or days outside its window,
 * so a day stays counted after Claude Code deletes its log. Marks the calling token as counting.
 * Cache tags are the caller's to drop, once per request.
 */
export async function ingestClaude(userId: number, tokenId: number, upload: ClaudeUpload): Promise<{ days: number }> {
  const rows = upload.days.map((d) => ({
    userId,
    machine: upload.machine,
    date: d.date,
    model: d.model,
    inputTokens: d.input,
    outputTokens: d.output,
    cacheReadTokens: d.cacheRead,
    cacheWriteTokens: d.cacheWrite,
    replies: d.replies,
    sessions: d.sessions,
  }));
  const inserts: BatchItem<"pg">[] = [];
  for (let i = 0; i < rows.length; i += ROWS_PER_INSERT) inserts.push(db.insert(claudeDaily).values(rows.slice(i, i + ROWS_PER_INSERT)));
  await db.batch([
    db
      .delete(claudeDaily)
      .where(and(eq(claudeDaily.userId, userId), eq(claudeDaily.machine, upload.machine), between(claudeDaily.date, upload.from, upload.to))),
    ...inserts,
    db.update(cliTokens).set({ claudeSyncedAt: new Date(), claudeVersion: upload.version }).where(eq(cliTokens.id, tokenId)),
  ]);
  return { days: rows.length };
}
