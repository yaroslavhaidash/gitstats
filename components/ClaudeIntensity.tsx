import type { ClaudeTotals } from "@/lib/claudestats";
import { fmt, fmtTokens, pctDelta } from "@/lib/format";
import { StatTile } from "./StatTile";

/** Rough conversions for the "how much text" line, stated on the page next to the number. */
const WORDS_PER_TOKEN = 0.75;
const WORDS_PER_NOVEL = 90_000;
const WORDS_PER_PAGE = 300;

/** Share of the context Claude Code sent that was read back from the cache rather than sent fresh. */
export function cacheReuse(t: Pick<ClaudeTotals, "input" | "cacheRead" | "cacheWrite">): number | null {
  const context = t.input + t.cacheRead + t.cacheWrite;
  return context > 0 ? t.cacheRead / context : null;
}

/** Tokens moved per output token written: how much context each line of Claude's answer stood on. */
export function contextFactor(t: Pick<ClaudeTotals, "tokens" | "output">): number | null {
  return t.output > 0 ? t.tokens / t.output : null;
}

const per = (a: number, b: number) => (b > 0 ? a / b : null);

/** A horizontal meter that fills once on load (motion-safe only); the number beside it is the reading. */
export function Meter({ value, label }: { value: number; label: string }) {
  return (
    <div className="h-3 bg-dark" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)}>
      <div className="h-full bg-alert meter-fill" style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
    </div>
  );
}

function amountOfText(output: number): string {
  const words = output * WORDS_PER_TOKEN;
  const novels = words / WORDS_PER_NOVEL;
  const size = novels >= 1 ? `about ${novels >= 10 ? fmt(Math.round(novels)) : novels.toFixed(1)} novels` : `about ${fmt(Math.max(1, Math.round(words / WORDS_PER_PAGE)))} pages`;
  return `${size} of text (${fmt(Math.round(words))} words, estimated at ${WORDS_PER_TOKEN} words per token and ${fmt(WORDS_PER_NOVEL)} words a novel)`;
}

/**
 * How a member works rather than how much: context per output token, cache reuse, tokens per session,
 * output per reply and tokens per active day against the period before. Every number is a ratio of
 * counted sums; only the amount-of-text line is an estimate, and it says so.
 */
export function ClaudeIntensity({ row, before, label, allTime }: { row: ClaudeTotals; before: ClaudeTotals; label: string; allTime: boolean }) {
  const factor = contextFactor(row);
  const reuse = cacheReuse(row);
  const daily = per(row.tokens, row.activeDays);
  const dailyBefore = per(before.tokens, before.activeDays);
  const session = per(row.tokens, row.sessions);
  const reply = per(row.output, row.replies);
  return (
    <section className="panel p-6 mb-8">
      <h2 className="font-sans font-bold text-lg mb-1">Intensity</h2>
      <p className="font-mono text-xs text-faint mb-4">{label} · ratios of the counted totals</p>
      <div className="grid sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-6 items-start">
        <div className="min-w-0">
          <div className="font-mono text-xs text-faint uppercase tracking-wide mb-2">cache reuse</div>
          <div className="font-sans font-bold text-5xl leading-none mb-3">{reuse === null ? "none" : `${(reuse * 100).toFixed(1)}%`}</div>
          {reuse !== null && <Meter value={reuse} label="cache reuse" />}
          <p className="font-mono text-xs text-dim mt-3">of the context Claude Code sent was read back from the cache instead of sent fresh</p>
        </div>
        <div className="grid grid-cols-2 gap-[2px] bg-dark border-2 border-dark min-w-0">
          <StatTile label="context per output" value={factor === null ? "none" : `${fmt(Math.round(factor))}×`} sub="tokens moved per output token" />
          <StatTile
            label="per active day"
            value={daily === null ? "none" : fmtTokens(daily)}
            delta={allTime || daily === null || dailyBefore === null ? undefined : pctDelta(daily, dailyBefore)}
            sub="tokens"
          />
          <StatTile label="per session" value={session === null ? "none" : fmtTokens(session)} sub="tokens" />
          <StatTile label="output per reply" value={reply === null ? "none" : fmt(Math.round(reply))} sub="tokens" />
        </div>
      </div>
      {row.output > 0 && <p className="font-mono text-xs text-faint mt-4">&gt; output {label}: {amountOfText(row.output)}</p>}
    </section>
  );
}
