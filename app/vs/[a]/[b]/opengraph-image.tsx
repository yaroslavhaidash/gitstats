import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fmt } from "@/lib/format";
import { heatColor } from "@/lib/palette";
import { cachedVsSide, type VsSide } from "@/lib/vs";

/**
 * A pair's unfurl: both logins, the headline number each, and 26 weeks of calendar each. Read from
 * Postgres and `handle_cache` only, like the `/gh` card: an unfurl bot never spends a GitHub call.
 */
export const alt = "two developers side by side, on gitstats";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const asset = (name: string) => readFile(join(process.cwd(), "assets", name));
const PAD_X = 64;
const COL_GAP = 48;
const GAP = 3;
const WEEKS = 26;
const COL_WIDTH = (size.width - PAD_X * 2 - COL_GAP) / 2;
const CELL = (COL_WIDTH - (WEEKS - 1) * GAP) / WEEKS;

function Column({ side, login, withLines }: { side: VsSide | null; login: string; withLines: boolean }) {
  const recent = side ? side.days.slice(-WEEKS * 7) : [];
  const weeks: number[][] = [];
  for (let i = 0; i < recent.length; i += 7) weeks.push(recent.slice(i, i + 7));
  const headline = side ? (withLines && side.lines ? side.lines.additions + side.lines.deletions : side.commits) : null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22, width: COL_WIDTH }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        {/* satori renders plain img, not next/image */}
        {side && <img src={side.avatarUrl} alt="" width={56} height={56} style={{ border: "2px solid #2d2d2d" }} />}
        <span style={{ fontFamily: "Space Grotesk", fontSize: 38, color: "#ffffff" }}>{side?.login ?? login}</span>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
        <span style={{ fontFamily: "Space Grotesk", fontSize: 76, color: "#ffffff" }}>{headline === null ? "?" : fmt(headline)}</span>
        <span style={{ fontSize: 24 }}>{withLines ? "lines" : "commits"}</span>
      </div>
      <div style={{ display: "flex", gap: GAP }}>
        {weeks.map((week, w) => (
          <div key={w} style={{ display: "flex", flexDirection: "column", gap: GAP }}>
            {week.map((count, d) => (
              <div key={d} style={{ width: CELL, height: CELL, background: heatColor(count) }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export default async function vsOgImage({ params }: { params: Promise<{ a: string; b: string }> }) {
  const { a, b } = await params;
  const [left, right] = [decodeURIComponent(a), decodeURIComponent(b)];
  const [l, r, monoRegular, groteskBold] = await Promise.all([cachedVsSide(left), cachedVsSide(right), asset("JetBrainsMono-Regular.ttf"), asset("SpaceGrotesk-Bold.ttf")]);
  const withLines = Boolean(l?.lines && r?.lines);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#050505",
          color: "#e0e2e5",
          fontFamily: "JetBrains Mono",
          padding: `44px ${PAD_X}px`,
        }}
      >
        <span style={{ fontSize: 24, color: "#8b93a4" }}>last year · {withLines ? "lines on gitstats" : "public commits"}</span>
        <div style={{ display: "flex", gap: COL_GAP }}>
          <Column side={l} login={left} withLines={withLines} />
          <Column side={r} login={right} withLines={withLines} />
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "2px solid #ff3333", paddingTop: 20 }}>
          <span style={{ fontFamily: "Space Grotesk", fontSize: 32, color: "#ffffff" }}>gitstats</span>
          <span style={{ fontSize: 24, color: "#8b93a4" }}>
            gitstats.org/vs/{l?.login ?? left}/{r?.login ?? right}
          </span>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "JetBrains Mono", data: monoRegular, weight: 400, style: "normal" },
        { name: "Space Grotesk", data: groteskBold, weight: 700, style: "normal" },
      ],
    },
  );
}
