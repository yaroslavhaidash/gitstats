import { redirect } from "next/navigation";
import { currentVisitor, recordTypedHandle } from "@/lib/visits";

/** Per request: a redirect that records the typed handle. */
export const instant = false;

/** The landing's handle box submits here as a plain GET form, so it works before any JavaScript. */
export default async function HandleLookup({ searchParams }: { searchParams: Promise<{ login?: string }> }) {
  const { login } = await searchParams;
  const clean = (login ?? "").trim().replace(/^@/, "");
  if (!clean) redirect("/");
  // The box asks for your own handle, so this is the one place a visitor tells us who they are.
  const visitor = await currentVisitor();
  if (visitor) await recordTypedHandle(visitor, clean, `/gh/${clean}`);
  redirect(`/gh/${encodeURIComponent(clean)}`);
}
