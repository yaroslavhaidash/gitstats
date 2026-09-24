import { redirect } from "next/navigation";
import { countStep } from "@/lib/funnel";
import { currentVisitor, recordTypedHandle } from "@/lib/visits";

const clean = (login: string | undefined) => (login ?? "").trim().replace(/^@/, "");

/** The "compare with me" boxes submit here as a plain GET form; a filled pair counts as one `vs_create`. */
export default async function VsLookup({ searchParams }: { searchParams: Promise<{ a?: string; b?: string }> }) {
  const query = await searchParams;
  const [a, b] = [clean(query.a), clean(query.b)];
  if (!a) redirect("/");
  if (!b) redirect(`/vs/${encodeURIComponent(a)}`);
  await countStep("vs_create");
  // `b` is the box that asks for your own handle; `a` is the page it sat on, whose owner is not a lead.
  const visitor = await currentVisitor();
  if (visitor) await recordTypedHandle(visitor, b, `/vs/${a}/${b}`);
  redirect(`/vs/${encodeURIComponent(a)}/${encodeURIComponent(b)}`);
}
