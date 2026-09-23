"use client";

import { useState } from "react";
import { CellTip } from "./CellTip";
import { useCellTip } from "./useCellTip";
import type { DailyLineRow } from "@/lib/stats";
import type { DayChartMode } from "@/lib/window";

const MAX_MONTHS = 3;
/** A year window spans 13 calendar months, not 12: at 12 the opening partial month was dropped. */
const MAX_TILES = 13;
const CELL_W = 78;
const GAP = 2; // the surface gap that separates touching cells
const HEAD = 30; // month name + weekday row
const MONTH_GAP = 18;
const TILE_W = 122;
const TILE_H = 80;
const TILE_COLS = 7;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const SUN_FIRST = ["S", "M", "T", "W", "T", "F", "S"];
const MON_FIRST = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const EMPTY = "#0d0d0d";
const FILLED = "#171717";
const EDGE = "#2a2a2a";
const GREEN = "#22c55e";
const RED = "#ff3333";

/**
 * Rendered size is governed by these caps, not by the viewBox units: the svg is `w-full`, so the
 * cap decides how big a cell and its text actually come out. Week mode caps width instead (seven
 * square cells at ~96px); the month cap tracks the taller cell so the calendar keeps its width.
 */
const MAX_H: Record<DayChartMode, string> = {
  week: "max-h-[190px]",
  month: "max-h-[452px]",
  days: "max-h-[420px]",
  months: "max-h-[180px]",
};

const MAX_W: Record<DayChartMode, string> = {
  week: "max-w-[687px]",
  month: "",
  days: "",
  months: "",
};

/**
 * Cell geometry. Week cells are square; the calendar is nearly so. `baselines()` then puts the day
 * header at the top and the two numbers as one pair centred in what is left. Week mode scales its
 * whole cell down (its rendered cell is the widest), which is why its numbers stay at the base size
 * while the calendar's step down one.
 */
const WEEK_CELL = { h: CELL_W, fs: 0.74, num: 15 };
const CAL_CELL = { h: 76, fs: 1, num: 13 };
const LABEL = 11;
const DOT = 16;
const NUM_STEP = 18 / 13; // baseline to baseline for the +added / −deleted pair, as a share of their font size: the month tiles set it
const NUM_DROP = 0.55; // the day number and commit count sit in the top corners, so mathematically equal room reads top-heavy: the pair takes a little more of it above than below
const EDGE_PAD = 1; // room for the cell strokes, which would otherwise be cut by the viewBox

type Cell = typeof WEEK_CELL;

/** Baselines for the day header and for the two numbers, which stack as one pair optically centred in the cell. */
function baselines(cell: Cell): { head: number; add: number; del: number } {
  const head = 8 + LABEL * cell.fs * 0.72;
  const size = cell.num * cell.fs;
  const cap = size * 0.72; // cap height of a number line
  const step = size * NUM_STEP;
  const top = (cell.h - cap - step) * NUM_DROP; // optically centred, not measured centre — see NUM_DROP
  return { head, add: top + cap, del: top + cap + step };
}

/** Short enough to sit inside a cell: 1234 -> "1.2k". */
function tiny(n: number): string {
  if (n === 0) return "";
  if (n < 1000) return String(n);
  const k = n / 1000;
  return `${k < 10 ? k.toFixed(1) : Math.round(k)}k`;
}

function monthsBetween(from: string, to: string): string[] {
  const keys: string[] = [];
  const start = new Date(`${from.slice(0, 7)}-01T00:00:00Z`);
  const end = new Date(`${to.slice(0, 7)}-01T00:00:00Z`);
  for (let d = start; d <= end; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) {
    keys.push(d.toISOString().slice(0, 10).slice(0, 7));
  }
  return keys;
}

function dayLabel(date: string, row: DailyLineRow | undefined): string {
  return `${date} · ${row ? `+${row.additions} −${row.deletions} · ${row.commits} commit${row.commits === 1 ? "" : "s"}` : "no lines counted"}`;
}

type Hover = { x: number; y: number; text: string } | null;

/** One day cell: numbers when the CLI counted something, a faint dot when it counted nothing. */
function DayCell({
  x,
  y,
  day,
  row,
  future,
  active,
  cell,
  onEnter,
}: {
  x: number;
  y: number;
  day: number;
  row: DailyLineRow | undefined;
  future: boolean;
  active: boolean;
  cell: Cell;
  onEnter: () => void;
}) {
  const at = baselines(cell);
  return (
    <g onMouseEnter={onEnter} opacity={future ? 0.3 : 1}>
      <rect
        x={x}
        y={y}
        width={CELL_W}
        height={cell.h}
        rx={2}
        fill={row ? FILLED : EMPTY}
        stroke={active ? "#e0e2e5" : EDGE}
        strokeWidth={1}
      />
      <text x={x + 6} y={y + at.head} fontSize={LABEL * cell.fs} fontFamily="var(--font-mono)" className="fill-dim">
        {day}
      </text>
      {row && row.commits > 0 && (
        <text x={x + CELL_W - 6} y={y + at.head} textAnchor="end" fontSize={LABEL * cell.fs} fontFamily="var(--font-mono)" className="fill-dim">
          ·{row.commits}
        </text>
      )}
      {row ? (
        <>
          {row.additions > 0 && (
            <text x={x + CELL_W / 2} y={y + at.add} textAnchor="middle" fontSize={cell.num * cell.fs} fontFamily="var(--font-mono)" fill={GREEN}>
              +{tiny(row.additions)}
            </text>
          )}
          {row.deletions > 0 && (
            <text x={x + CELL_W / 2} y={y + at.del} textAnchor="middle" fontSize={cell.num * cell.fs} fontFamily="var(--font-mono)" fill={RED}>
              −{tiny(row.deletions)}
            </text>
          )}
        </>
      ) : (
        !future && (
          <text x={x + CELL_W / 2} y={y + cell.h / 2 + 5} textAnchor="middle" fontSize={DOT * cell.fs} fontFamily="var(--font-mono)" className="fill-faint">
            ·
          </text>
        )
      )}
    </g>
  );
}

/**
 * Lines the CLI counted, drawn at the resolution the window deserves: one row of days for a week,
 * one calendar for a month, up to three for a short custom range, and one tile per month beyond that.
 */
export function MonthBlocks({
  rows,
  from,
  to,
  mode,
  today,
}: {
  rows: DailyLineRow[];
  from: string;
  to: string;
  mode: DayChartMode;
  today: string;
}) {
  const [hover, setHover] = useState<Hover>(null);
  const { boxRef, point, onMouseMove, clear } = useCellTip();
  const byDate = new Map(rows.map((r) => [r.date, r]));

  const body =
    mode === "week"
      ? weekRow(byDate, to, today, hover, setHover)
      : mode === "months"
        ? monthTiles(rows, from, to, hover, setHover)
        : dayBlocks(byDate, from, to, today, mode === "month", hover, setHover);

  return (
    <div className="relative" ref={boxRef}>
      {hover && point && <CellTip point={point}>{hover.text}</CellTip>}
      <div className="flex flex-wrap gap-x-6 gap-y-1 font-mono text-xs text-dim mb-3">
        <span className="flex items-center gap-2">
          <span className="w-3 h-3 bg-green inline-block" /> added
        </span>
        <span className="flex items-center gap-2">
          <span className="w-3 h-3 bg-alert inline-block" /> deleted
        </span>
        <span className="w-full sm:w-auto sm:ml-auto text-faint">lines per day · weeks GitHub reports are laid over their days</span>
      </div>
      <svg
        viewBox={`0 0 ${body.width + EDGE_PAD * 2} ${body.height + EDGE_PAD * 2}`}
        className={`block w-full h-auto mx-auto ${MAX_H[mode]} ${MAX_W[mode]}`}
        role="img"
        aria-label={`Lines added and deleted per ${mode === "months" ? "month" : "day"}`}
        onMouseMove={onMouseMove}
        onMouseLeave={() => {
          setHover(null);
          clear();
        }}
      >
        <g transform={`translate(${EDGE_PAD}, ${EDGE_PAD})`}>{body.content}</g>
      </svg>
    </div>
  );
}

type Body = { content: React.ReactNode; width: number; height: number };

/** Monday to Sunday of the week `to` falls in; days after today are drawn empty. */
function weekRow(
  byDate: Map<string, DailyLineRow>,
  to: string,
  today: string,
  hover: Hover,
  setHover: (h: Hover) => void,
): Body {
  const d = new Date(`${to}T00:00:00Z`);
  const monday = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86_400_000);
  const width = 7 * (CELL_W + GAP) - GAP;
  const height = HEAD + WEEK_CELL.h;
  const content = Array.from({ length: 7 }, (_, i) => {
    const day = new Date(monday.getTime() + i * 86_400_000);
    const date = day.toISOString().slice(0, 10);
    const x = i * (CELL_W + GAP);
    const y = HEAD;
    const row = byDate.get(date);
    return (
      <g key={date}>
        <text x={x + CELL_W / 2} y={20} textAnchor="middle" fontSize={LABEL * WEEK_CELL.fs} fontFamily="var(--font-mono)" className="fill-faint">
          {MON_FIRST[i]}
        </text>
        <DayCell
          x={x}
          y={y}
          day={day.getUTCDate()}
          row={row}
          cell={WEEK_CELL}
          future={date > today}
          active={hover?.x === x && hover?.y === y}
          onEnter={() => setHover({ x, y, text: dayLabel(date, row) })}
        />
      </g>
    );
  });
  return { content, width, height };
}

/** One calendar per month: the month `from` is in, or the last three of a short custom range. */
function dayBlocks(
  byDate: Map<string, DailyLineRow>,
  from: string,
  to: string,
  today: string,
  single: boolean,
  hover: Hover,
  setHover: (h: Hover) => void,
): Body {
  const keys = single ? [from.slice(0, 7)] : monthsBetween(from, to).slice(-MAX_MONTHS);
  const blocks = keys.map((key) => {
    const [y, m] = key.split("-").map(Number);
    const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const lead = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
    return { key, month: m - 1, year: y, days, lead, weeks: Math.ceil((lead + days) / 7) };
  });
  const rowsHigh = Math.max(...blocks.map((b) => b.weeks));
  const blockW = 7 * (CELL_W + GAP) - GAP;
  const width = blocks.length * blockW + (blocks.length - 1) * MONTH_GAP;
  const height = HEAD + rowsHigh * (CAL_CELL.h + GAP) - GAP;

  const content = blocks.map((b, bi) => {
    const x0 = bi * (blockW + MONTH_GAP);
    return (
      <g key={b.key}>
        <text x={x0} y={11} fontSize={12} fontFamily="var(--font-mono)" className="fill-silver">
          {MONTHS[b.month]} {b.year}
        </text>
        {SUN_FIRST.map((d, i) => (
          <text
            key={i}
            x={x0 + i * (CELL_W + GAP) + CELL_W / 2}
            y={25}
            textAnchor="middle"
            fontSize={10}
            fontFamily="var(--font-mono)"
            className="fill-faint"
          >
            {d}
          </text>
        ))}
        {Array.from({ length: b.days }, (_, i) => {
          const day = i + 1;
          const slot = b.lead + i;
          const date = `${b.key}-${String(day).padStart(2, "0")}`;
          const inWindow = date >= from && date <= to;
          const x = x0 + (slot % 7) * (CELL_W + GAP);
          const y = HEAD + Math.floor(slot / 7) * (CAL_CELL.h + GAP);
          const row = inWindow ? byDate.get(date) : undefined;
          return (
            <DayCell
              key={day}
              x={x}
              y={y}
              day={day}
              row={row}
              cell={CAL_CELL}
              future={!inWindow || date > today}
              active={hover?.x === x && hover?.y === y}
              onEnter={() => setHover({ x, y, text: dayLabel(date, row) })}
            />
          );
        })}
      </g>
    );
  });
  return { content, width, height };
}

/** One tile per month for a year or any long range: day cells would be unreadable. */
function monthTiles(rows: DailyLineRow[], from: string, to: string, hover: Hover, setHover: (h: Hover) => void): Body {
  const totals = new Map<string, { additions: number; deletions: number; commits: number }>();
  for (const r of rows) {
    const key = r.date.slice(0, 7);
    const t = totals.get(key) ?? { additions: 0, deletions: 0, commits: 0 };
    t.additions += r.additions;
    t.deletions += r.deletions;
    t.commits += r.commits;
    totals.set(key, t);
  }
  const keys = monthsBetween(from, to).slice(-MAX_TILES);
  const cols = Math.min(TILE_COLS, keys.length);
  const width = cols * TILE_W;
  const height = Math.ceil(keys.length / TILE_COLS) * TILE_H;
  const content = keys.map((key, i) => {
    const [y, m] = key.split("-").map(Number);
    const t = totals.get(key);
    const x = (i % TILE_COLS) * TILE_W;
    const top = Math.floor(i / TILE_COLS) * TILE_H;
    const text = `${MONTHS[m - 1]} ${y} · ${t ? `+${t.additions} −${t.deletions} · ${t.commits} commits` : "no lines counted"}`;
    const active = hover?.x === x && hover?.y === top;
    return (
      <g key={key} onMouseEnter={() => setHover({ x, y: top, text })}>
        <rect
          x={x + 1}
          y={top + 1}
          width={TILE_W - 2}
          height={TILE_H - 2}
          rx={2}
          fill={t ? FILLED : EMPTY}
          stroke={active ? "#e0e2e5" : EDGE}
          strokeWidth={1}
        />
        <text x={x + 8} y={top + 18} fontSize={11} fontFamily="var(--font-mono)" className="fill-dim">
          {MONTHS[m - 1]} {String(y).slice(2)}
        </text>
        {t ? (
          <>
            <text x={x + TILE_W / 2} y={top + 42} textAnchor="middle" fontSize={CAL_CELL.num} fontFamily="var(--font-mono)" fill={GREEN}>
              +{tiny(t.additions)}
            </text>
            <text
              x={x + TILE_W / 2}
              y={top + 42 + CAL_CELL.num * NUM_STEP}
              textAnchor="middle"
              fontSize={CAL_CELL.num}
              fontFamily="var(--font-mono)"
              fill={RED}
            >
              −{tiny(t.deletions)}
            </text>
            <text x={x + TILE_W - 8} y={top + 18} textAnchor="end" fontSize={11} fontFamily="var(--font-mono)" className="fill-dim">
              ·{t.commits}
            </text>
          </>
        ) : (
          <text x={x + TILE_W / 2} y={top + 50} textAnchor="middle" fontSize={16} fontFamily="var(--font-mono)" className="fill-faint">
            ·
          </text>
        )}
      </g>
    );
  });
  return { content, width, height };
}
