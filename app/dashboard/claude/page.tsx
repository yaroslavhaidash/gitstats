import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { userCrews } from "@/lib/crews";

/** Per request: it reads the session. */
export const instant = false;

export const metadata: Metadata = { title: { absolute: "Dashboard · claudestats" } };

/** claudestats opens on the member's first crew, as `/dashboard` does; with no crew, crew setup lives on the gitstats side. */
export default async function ClaudeIndex() {
  const session = await auth();
  if (!session) redirect("/");
  const crews = await userCrews(session.user.id);
  redirect(crews[0] ? `/dashboard/claude/c/${crews[0].code}` : "/dashboard");
}
