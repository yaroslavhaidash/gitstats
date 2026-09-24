import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { crewByCode } from "@/lib/crews";

/**
 * An invite link's unfurl: who invited you and to which crew, never a number. The person opening it
 * has not joined or agreed to anything, so the crew's activity stays behind the sign-in.
 */
export const alt = "an invite to compare coding stats on gitstats";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const asset = (name: string) => readFile(join(process.cwd(), "assets", name));

export default async function inviteOgImage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const crew = await crewByCode(code.toUpperCase());
  const [inviter] = crew ? await db.select({ login: users.githubLogin }).from(users).where(eq(users.id, crew.createdBy)).limit(1) : [];
  const [monoRegular, groteskBold] = await Promise.all([asset("JetBrainsMono-Regular.ttf"), asset("SpaceGrotesk-Bold.ttf")]);
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
          padding: "56px 64px 44px",
        }}
      >
        {crew ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
            <div style={{ display: "flex", alignSelf: "flex-start", border: "2px solid #ff3333", color: "#ff3333", fontSize: 22, padding: "6px 14px" }}>
              INVITE // {crew.code}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", fontFamily: "Space Grotesk", fontSize: 60, color: "#ffffff", lineHeight: 1.15 }}>
              {inviter ? `${inviter.login} invited you to compare coding stats on gitstats` : "You are invited to compare coding stats on gitstats"}
            </div>
            <div style={{ display: "flex", fontSize: 30, color: "#aab2bf" }}>crew · {crew.name}</div>
          </div>
        ) : (
          <span style={{ fontFamily: "Space Grotesk", fontSize: 64, color: "#ffffff" }}>git stats for friends</span>
        )}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "2px solid #ff3333", paddingTop: 20 }}>
          <span style={{ fontFamily: "Space Grotesk", fontSize: 32, color: "#ffffff" }}>gitstats</span>
          <span style={{ fontSize: 24, color: "#8b93a4" }}>sign in with GitHub to join</span>
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
