import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fmt } from "@/lib/format";
import { cachedHandle } from "@/lib/handle";
import { heatColor } from "@/lib/palette";

/**
 * A handle page's unfurl, drawn from `handle_cache` only: every number on it is already public on
 * GitHub, and an unfurl bot must never be what spends a GitHub call. A handle nobody has opened yet
 * gets the wordmark alone.
 */
export const alt = "a GitHub user's last year, on gitstats";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const asset = (name: string) => readFile(join(process.cwd(), "assets", name));
const PAD_X = 64;
const GAP = 4;
const WEEKS = 26;
const GRID_WIDTH = size.width - PAD_X * 2;
const MAX_CELL_HEIGHT = 17;

export default async function handleOgImage({ params }: { params: Promise<{ login: string }> }) {
  const { login } = await params;
  const [data, monoRegular, groteskBold] = await Promise.all([
    cachedHandle(decodeURIComponent(login)),
    asset("JetBrainsMono-Regular.ttf"),
    asset("SpaceGrotesk-Bold.ttf"),
  ]);
  // The last 26 weeks of the calendar in 7-row columns, ending today like the share card.
  const recent = data ? data.days.slice(-WEEKS * 7) : [];
  const weeks: number[][] = [];
  for (let i = 0; i < recent.length; i += 7) weeks.push(recent.slice(i, i + 7));
  const cellWidth = weeks.length > 0 ? (GRID_WIDTH - (weeks.length - 1) * GAP) / weeks.length : 0;
  const cellHeight = Math.min(cellWidth, MAX_CELL_HEIGHT);

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
        {data ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
              {/* satori renders plain img, not next/image */}
              <img src={data.avatarUrl} alt="" width={72} height={72} style={{ border: "2px solid #2d2d2d" }} />
              <div style={{ display: "flex", flexDirection: "column" }}>
                <span style={{ fontFamily: "Space Grotesk", fontSize: 40, color: "#ffffff" }}>{data.login}</span>
                <span style={{ fontSize: 22, color: "#8b93a4" }}>last year on GitHub · public</span>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 20 }}>
              <span style={{ fontFamily: "Space Grotesk", fontSize: 92, color: "#ffffff" }}>{fmt(data.totalCommits)}</span>
              <span style={{ fontSize: 28 }}>commits</span>
            </div>
            <div style={{ display: "flex", gap: 44, fontSize: 26 }}>
              <span>{data.streak}d streak</span>
              {data.topLanguage && <span>mostly {data.topLanguage}</span>}
            </div>
            <div style={{ display: "flex", gap: GAP }}>
              {weeks.map((week, w) => (
                <div key={w} style={{ display: "flex", flexDirection: "column", gap: GAP }}>
                  {week.map((count, d) => (
                    <div key={d} style={{ width: cellWidth, height: cellHeight, background: heatColor(count) }} />
                  ))}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <span style={{ fontFamily: "Space Grotesk", fontSize: 64, color: "#ffffff" }}>git stats for friends</span>
        )}

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "2px solid #ff3333", paddingTop: 20 }}>
          <span style={{ fontFamily: "Space Grotesk", fontSize: 32, color: "#ffffff" }}>gitstats</span>
          <span style={{ fontSize: 24, color: "#8b93a4" }}>gitstats.org/gh/{data?.login ?? decodeURIComponent(login)}</span>
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
