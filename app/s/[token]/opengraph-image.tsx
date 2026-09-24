import { ImageResponse } from "next/og";
import { notFound } from "next/navigation";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fmt } from "@/lib/format";
import { heatColor } from "@/lib/palette";
import { resolveShareToken, shareCard } from "@/lib/share";

/**
 * The same card as `/s/<token>`, drawn for the unfurl. It is the one per-user OG image on the site:
 * the rest are static because a guessable URL must never carry someone's numbers, and this one is
 * only reachable through a signature its owner minted.
 */
export const alt = "a gitstats share card";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const asset = (name: string) => readFile(join(process.cwd(), "assets", name));
const PAD_X = 64;
const GAP = 4;
const GRID_WIDTH = size.width - PAD_X * 2;
/** Seven rows of a cell that wide would push the footer off the card, so the cells flatten instead. */
const MAX_CELL_HEIGHT = 17;

export default async function shareOgImage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const payload = await resolveShareToken(token);
  if (!payload) notFound();
  const { row, label, headline, unit, rankLine, activeDays } = await shareCard(payload);
  const { options } = payload;
  const [monoBold, monoRegular, groteskBold] = await Promise.all([
    asset("JetBrainsMono-Bold.ttf"),
    asset("JetBrainsMono-Regular.ttf"),
    asset("SpaceGrotesk-Bold.ttf"),
  ]);
  // Oldest first in 7-row columns, exactly as the on-page grid lays them out.
  const weeks: number[][] = [];
  for (let i = 0; i < row.days.length; i += 7) weeks.push(row.days.slice(i, i + 7));
  const cellWidth = (GRID_WIDTH - (weeks.length - 1) * GAP) / weeks.length;
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
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          {/* satori renders plain img, not next/image */}
          <img src={row.avatarUrl} alt="" width={72} height={72} style={{ border: "2px solid #2d2d2d" }} />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontFamily: "Space Grotesk", fontSize: 40, color: "#ffffff" }}>{row.login}</span>
            <span style={{ fontSize: 22, color: "#8b93a4" }}>{label}</span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 20 }}>
            <span style={{ fontFamily: "Space Grotesk", fontSize: 92, color: "#ffffff" }}>{headline}</span>
            <span style={{ fontSize: 28, color: "#e0e2e5" }}>{unit}</span>
          </div>
          {rankLine && <span style={{ fontSize: 24, color: "#8b93a4" }}>{rankLine}</span>}
          {options.totals && (
            <div style={{ display: "flex", gap: 44, marginTop: 8, fontSize: 26 }}>
              <span style={{ color: "#e0e2e5" }}>{fmt(row.commits)} commits</span>
              <span style={{ color: "#22c55e" }}>+{fmt(row.additions)}</span>
              <span style={{ color: "#ff3333" }}>−{fmt(row.deletions)}</span>
              <span style={{ color: "#e0e2e5" }}>{row.streak}d streak</span>
              {activeDays !== null && <span style={{ color: "#e0e2e5" }}>{activeDays}/7 days</span>}
            </div>
          )}
          {options.grid && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14 }}>
              <span style={{ fontSize: 18, color: "#8b93a4" }}>LAST 26 WEEKS</span>
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
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "2px solid #ff3333", paddingTop: 20, marginTop: 18 }}>
          <span style={{ fontFamily: "Space Grotesk", fontSize: 32, color: "#ffffff" }}>gitstats</span>
          <span style={{ fontSize: 24, color: "#8b93a4" }}>gitstats.org</span>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "JetBrains Mono", data: monoRegular, weight: 400, style: "normal" },
        { name: "JetBrains Mono", data: monoBold, weight: 700, style: "normal" },
        { name: "Space Grotesk", data: groteskBold, weight: 700, style: "normal" },
      ],
    },
  );
}
