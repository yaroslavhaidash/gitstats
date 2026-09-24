import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * The share card: a real screenshot of the demo board with the wordmark under it, so every unfurl
 * of gitstats.org shows the product instead of type on black. `assets/demo-board-og.png` is the
 * same capture the landing hero uses, resampled to 1200 wide. Static for every route — a per-user
 * card would put someone's numbers in front of anyone who can guess a URL.
 */
export const alt = "gitstats: a crew board ranking four developers by lines of code over a year";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const asset = (name: string) => readFile(join(process.cwd(), "assets", name));

/** Height of the wordmark strip along the bottom; the screenshot is positioned around it. */
const BAR = 104;

export default async function ogImage() {
  const [monoBold, monoRegular, groteskBold, board] = await Promise.all([
    asset("JetBrainsMono-Bold.ttf"),
    asset("JetBrainsMono-Regular.ttf"),
    asset("SpaceGrotesk-Bold.ttf"),
    asset("demo-board-og.png"),
  ]);
  const boardSrc = `data:image/png;base64,${board.toString("base64")}`;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          overflow: "hidden",
          background: "#050505",
          color: "#e0e2e5",
          fontFamily: "Space Grotesk",
        }}
      >
        {/* Pulled up so the card opens on the leaderboard itself rather than on the page chrome. */}
        {/* eslint-disable-next-line @next/next/no-img-element -- satori renders plain img, not next/image */}
        <img src={boardSrc} alt="" width={1200} height={698} style={{ position: "absolute", top: -160, left: 0 }} />
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            width: size.width,
            height: BAR,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 40px",
            background: "#050505",
            borderTop: "2px solid #ff3333",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div
              style={{
                width: 48,
                height: 48,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "#ff3333",
                color: "#050505",
                border: "3px solid #e0e2e5",
                fontFamily: "JetBrains Mono",
                fontWeight: 700,
                fontSize: 24,
              }}
            >
              gs
            </div>
            <div style={{ display: "flex", fontSize: 34, fontWeight: 700 }}>
              git<span style={{ color: "#ff3333" }}>stats</span>
            </div>
            <div style={{ display: "flex", fontFamily: "JetBrains Mono", fontSize: 20, color: "#aab2bf", marginLeft: 8 }}>
              your crew&apos;s commits, on one board
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
            <div style={{ display: "flex", fontFamily: "JetBrains Mono", fontSize: 20, color: "#ff3333" }}>gitstats.org/demo</div>
            <div style={{ display: "flex", fontFamily: "JetBrains Mono", fontSize: 16, color: "#8b93a4", marginTop: 4 }}>demo board · generated data</div>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Space Grotesk", data: groteskBold, style: "normal", weight: 700 },
        { name: "JetBrains Mono", data: monoBold, style: "normal", weight: 700 },
        { name: "JetBrains Mono", data: monoRegular, style: "normal", weight: 400 },
      ],
    },
  );
}
