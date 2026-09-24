import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { CrewForms } from "@/components/CrewForms";
import { userCrews } from "@/lib/crews";

/** Per request: it reads the session. The stats behind it are cached in lib/cached.ts. */
export const instant = false;

export default async function DashboardIndex({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const session = await auth();
  if (!session) redirect("/");
  const { error } = await searchParams;
  const crews = await userCrews(session.user.id);
  if (crews[0] && !error) redirect(`/dashboard/c/${crews[0].code}`);
  return (
    <div className="max-w-3xl mx-auto">
      <div className="tag mb-4">STEP 1 OF 2 // CREW</div>
      <h1 className="font-sans font-bold text-4xl mb-3">Pick your people.</h1>
      <p className="font-mono text-sm text-dim mb-2 leading-relaxed">
        You&apos;re signed in. Your public GitHub activity is already being counted. A crew is the board you and your friends compare on.
      </p>
      <p className="font-mono text-xs text-faint mb-10">
        Got an invite link from a friend? Just open it. The <a href="/dashboard/global" className="text-silver underline hover:text-alert">global board</a> shows everyone regardless.
      </p>
      <CrewForms error={error} />
    </div>
  );
}
