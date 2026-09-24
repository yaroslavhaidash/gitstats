import { redirect } from "next/navigation";
import { countStep } from "@/lib/funnel";

const clean = (login: string | undefined) => (login ?? "").trim().replace(/^@/, "");

/** The "compare with me" boxes submit here as a plain GET form; a filled pair counts as one `vs_create`. */
export default async function VsLookup({ searchParams }: { searchParams: Promise<{ a?: string; b?: string }> }) {
  const query = await searchParams;
  const [a, b] = [clean(query.a), clean(query.b)];
  if (!a) redirect("/");
  if (!b) redirect(`/vs/${encodeURIComponent(a)}`);
  await countStep("vs_create");
  redirect(`/vs/${encodeURIComponent(a)}/${encodeURIComponent(b)}`);
}
