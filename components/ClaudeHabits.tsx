import { CLAUDE_EFFORTS } from "@/lib/claude";
import type { ClaudeBoardRow, ClaudeDetail, ClaudeEffortWeek, ClaudeTotals } from "@/lib/claudestats";
import { fmt, fmtMonth, fmtTokens } from "@/lib/format";
import { EFFORT_COLOURS } from "@/lib/side";
import { EmptyNote } from "./EmptyNote";
import { ShareBands } from "./ModelBands";
import { ShareBar } from "./ShareBar";
import { StatTile } from "./StatTile";
import { WeekdayProfile } from "./WeekdayProfile";

/**
 * The widgets built on CLI 0.7.0's counts: effort, subagents, the 6-hour profile and the per-message
 * ratios. Every number comes from `ClaudeDetail`, which sums only rows that carry these counts, so a
 * window that reaches back before 0.7.0 says where its counting starts rather than showing zeros.
 */

export const EFFORT_NAMES: Record<(typeof CLAUDE_EFFORTS)[number], string> = { none: "not set", low: "low", medium: "medium", high: "high", xhigh: "xhigh", max: "max" };
export const QUARTERS = ["00-06", "06-12", "12-18", "18-24"];

const per = (a: number, b: number) => (b > 0 ? a / b : null);
const ratio = (v: number | null) => (v === null ? "none" : v >= 100 ? fmtTokens(v) : v >= 10 ? fmt(Math.round(v)) : v.toFixed(1));

/** The level with the most replies, leaving out "not set"; null when nothing had one. */
export function topEffort(d: ClaudeDetail): { name: string; share: number } | null {
  const total = d.effortReplies.reduce((a, b) => a + b, 0);
  let best = -1;
  d.effortReplies.forEach((v, i) => {
    if (i > 0 && v > 0 && (best < 0 || v > (d.effortReplies[best] ?? 0))) best = i;
  });
  return best < 0 || total === 0 ? null : { name: EFFORT_NAMES[CLAUDE_EFFORTS[best]], share: (d.effortReplies[best] ?? 0) / total };
}

/** Night owl, early bird and the two in between, from the busiest block. */
export function hourType(quarters: number[]): string | null {
  const max = Math.max(...quarters);
  if (max <= 0) return null;
  return ["night owl", "early bird", "afternoon person", "evening person"][quarters.indexOf(max)] ?? null;
}

/** Where the 0.7.0 counts start inside a window, when that is later than the window itself. */
export function SinceNote({ detail, from }: { detail: ClaudeDetail; from: string }) {
  return detail.since > from ? <p className="font-mono text-xs text-faint mt-3">&gt; counted since {fmtMonth(detail.since)}: earlier days were sent by a CLI before 0.7.0</p> : null;
}

function NotYet({ label }: { label: string }) {
  return <EmptyNote inset>not counted {label}: these numbers start with CLI 0.7.0</EmptyNote>;
}

/** Which effort the member runs most, the share bar by replies, the same by week, and output per reply per level. */
export function EffortMix({ detail, weeks, label, from }: { detail: ClaudeDetail | null; weeks: ClaudeEffortWeek[]; label: string; from: string }) {
  const top = detail ? topEffort(detail) : null;
  return (
    <section className="panel p-6 mb-8 min-w-0">
      <h2 className="font-sans font-bold text-lg mb-1">Effort mix</h2>
      <p className="font-mono text-xs text-faint mb-4">{label} · the reasoning effort each reply ran at</p>
      {!detail ? (
        <NotYet label={label} />
      ) : (
        <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-8">
          <div className="min-w-0">
            <div className="font-mono text-xs text-faint uppercase tracking-wide mb-2">used most</div>
            <div className="font-sans font-bold text-5xl leading-none mb-2">{top ? top.name : "none"}</div>
            {top && <p className="font-mono text-xs text-dim mb-4">{Math.round(top.share * 100)}% of replies</p>}
            <ShareBar
              rows={CLAUDE_EFFORTS.map((e, i) => ({ label: EFFORT_NAMES[e], value: detail.effortReplies[i] ?? 0, colour: EFFORT_COLOURS[i] }))}
              label={`Replies by effort ${label}`}
              format={fmt}
            />
            <table className="w-full font-mono text-xs mt-4">
              <thead>
                <tr className="text-faint uppercase tracking-wide text-left">
                  <th className="font-normal pb-1">level</th>
                  <th className="font-normal pb-1 text-right">output per reply</th>
                </tr>
              </thead>
              <tbody>
                {CLAUDE_EFFORTS.map((e, i) => {
                  const v = per(detail.effortOutput[i] ?? 0, detail.effortReplies[i] ?? 0);
                  return v === null ? null : (
                    <tr key={e} className="border-t border-dark">
                      <td className="py-1.5 text-silver">{EFFORT_NAMES[e]}</td>
                      <td className="py-1.5 text-right text-white">{fmt(Math.round(v))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="min-w-0">
            <div className="font-mono text-xs text-faint uppercase tracking-wide mb-2">by week · share of replies · last {weeks.length} weeks</div>
            <ShareBands
              weeks={weeks.map((w) => ({ weekStart: w.weekStart, parts: w.replies ? Object.fromEntries(CLAUDE_EFFORTS.map((e, i) => [e, w.replies?.[i] ?? 0])) : null }))}
              bands={CLAUDE_EFFORTS.map((e, i) => ({ key: e, name: EFFORT_NAMES[e], colour: EFFORT_COLOURS[i] }))}
              label={`Share of replies per effort level, last ${weeks.length} weeks`}
            />
          </div>
        </div>
      )}
      {detail && <SinceNote detail={detail} from={from} />}
    </section>
  );
}

/** How much of the member's work ran in subagents, by tokens and by replies. */
export function SubagentShare({ detail, label, from }: { detail: ClaudeDetail | null; label: string; from: string }) {
  const share = detail ? per(detail.subagentTokens, detail.tokens) : null;
  return (
    <section className="panel p-6 min-w-0">
      <h2 className="font-sans font-bold text-lg mb-1">Subagent share</h2>
      <p className="font-mono text-xs text-faint mb-4">{label} · tokens that ran in subagents (Task, agents) rather than your conversation</p>
      {!detail ? (
        <NotYet label={label} />
      ) : (
        <>
          <div className="font-sans font-bold text-4xl leading-none mb-4">{share === null ? "none" : `${(share * 100).toFixed(1)}%`}</div>
          <ShareBar
            rows={[
              { label: "your conversation", value: detail.tokens - detail.subagentTokens, colour: "#4b5563" },
              { label: "subagents", value: detail.subagentTokens, colour: "var(--color-alert)" },
            ]}
            label={`Subagent share of tokens ${label}`}
          />
          <p className="font-mono text-xs text-dim mt-3">
            {fmt(detail.subagentReplies)} of {fmt(detail.replies)} replies in subagents
          </p>
          <SinceNote detail={detail} from={from} />
        </>
      )}
    </section>
  );
}

/** Replies per 6-hour block of the member's own clock, the claudestats counterpart of the weekday profile. */
export function HourProfile({ detail, label, from }: { detail: ClaudeDetail | null; label: string; from: string }) {
  const kind = detail ? hourType(detail.replyQuarters) : null;
  return (
    <section className="panel p-6 min-w-0">
      <h2 className="font-sans font-bold text-lg mb-1">6-hour profile</h2>
      <p className="font-mono text-xs text-faint mb-4">{label} · replies per block of your computer&apos;s own clock{kind ? ` · ${kind}` : ""}</p>
      {!detail ? (
        <NotYet label={label} />
      ) : (
        <>
          <WeekdayProfile averages={detail.replyQuarters} labels={QUARTERS} unit={{ label: "Claude Code replies per 6-hour block", empty: `no replies ${label}` }} />
          <SinceNote detail={detail} from={from} />
        </>
      )}
    </section>
  );
}

/** The MESSAGES tab's counterpart of Intensity: what one typed message set off. */
export function PerMessage({ row, before, label, allTime, from }: { row: ClaudeTotals; before: ClaudeTotals; label: string; allTime: boolean; from: string }) {
  const d = row.detail;
  const was = before.detail;
  if (!d) {
    return (
      <section className="panel p-6 mb-8">
        <h2 className="font-sans font-bold text-lg mb-1">Per message</h2>
        <NotYet label={label} />
      </section>
    );
  }
  const replies = per(d.replies, d.messages);
  const repliesBefore = was ? per(was.replies, was.messages) : null;
  const tools = per(d.toolCalls, d.messages);
  return (
    <section className="panel p-6 mb-8">
      <h2 className="font-sans font-bold text-lg mb-1">Per message</h2>
      <p className="font-mono text-xs text-faint mb-4">{label} · what one typed message set off, over the days that counted messages</p>
      <div className="grid sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-6 items-start">
        <div className="min-w-0">
          <div className="font-mono text-xs text-faint uppercase tracking-wide mb-2">replies per message</div>
          <div className="font-sans font-bold text-5xl leading-none mb-3">{ratio(replies)}</div>
          <p className="font-mono text-xs text-dim">
            {fmt(d.messages)} messages · {fmt(d.replies)} replies
            {!allTime && replies !== null && repliesBefore !== null ? ` · ${repliesBefore.toFixed(1)} the period before` : ""}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-[2px] bg-dark border-2 border-dark min-w-0">
          <StatTile label="tokens per message" value={ratio(per(d.tokens, d.messages))} sub="every token kind" />
          <StatTile label="output per message" value={ratio(per(d.output, d.messages))} sub="tokens Claude wrote" />
          <StatTile label="tool calls per message" value={ratio(tools)} sub="experimental" />
          <StatTile label="tool calls per reply" value={ratio(per(d.toolCalls, d.replies))} sub="experimental" />
        </div>
      </div>
      <SinceNote detail={d} from={from} />
    </section>
  );
}

/** Each crew member's replies across the four blocks, as shares of their own day, so a light user's rhythm still shows. */
export function CrewHours({ rows, hues, label }: { rows: ClaudeBoardRow[]; hues: Map<number, string>; label: string }) {
  const shown = rows.filter((r) => r.detail && r.detail.replyQuarters.some((q) => q > 0));
  return (
    <section className="panel p-6 mt-8 min-w-0">
      <h2 className="font-sans font-bold text-lg mb-1">6-hour profile</h2>
      <p className="font-mono text-xs text-faint mb-4">{label} · share of each member&apos;s replies per block of their own clock</p>
      {shown.length === 0 ? (
        <NotYet label={label} />
      ) : (
        <div className="overflow-x-auto -mx-6 px-6">
          <table className="w-full min-w-[480px] font-mono text-xs">
            <thead>
              <tr className="text-faint uppercase tracking-wide text-left">
                <th className="font-normal pb-2 pr-3">dev</th>
                {QUARTERS.map((q) => (
                  <th key={q} className="font-normal pb-2 px-1 text-center">
                    {q}
                  </th>
                ))}
                <th className="font-normal pb-2 pl-3">kind</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const q = r.detail?.replyQuarters ?? [0, 0, 0, 0];
                const total = q.reduce((a, b) => a + b, 0);
                return (
                  <tr key={r.userId} className="border-t border-dark">
                    <td className="py-2 pr-3">
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="w-2.5 h-2.5 shrink-0 inline-block" style={{ background: hues.get(r.userId) }} />
                        <span className="text-silver truncate max-w-40">{r.login}</span>
                      </span>
                    </td>
                    {q.map((v, i) => {
                      const share = total > 0 ? v / total : 0;
                      return (
                        <td key={i} className="py-1 px-1">
                          <div
                            className="h-7 grid place-items-center text-white"
                            style={{ background: `color-mix(in srgb, var(--color-alert) ${Math.round(share * 100)}%, #1a1a1a)` }}
                            title={`${r.login} ${QUARTERS[i]}: ${fmt(v)} replies`}
                          >
                            {Math.round(share * 100)}%
                          </div>
                        </td>
                      );
                    })}
                    <td className="py-2 pl-3 text-dim whitespace-nowrap">{hourType(q) ?? "none"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
