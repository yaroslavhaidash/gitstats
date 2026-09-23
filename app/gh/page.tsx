import { redirect } from "next/navigation";

/** The landing's handle box submits here as a plain GET form, so it works before any JavaScript. */
export default async function HandleLookup({ searchParams }: { searchParams: Promise<{ login?: string }> }) {
  const { login } = await searchParams;
  const clean = (login ?? "").trim().replace(/^@/, "");
  redirect(clean ? `/gh/${encodeURIComponent(clean)}` : "/");
}
