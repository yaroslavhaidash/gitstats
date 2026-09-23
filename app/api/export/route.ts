import { auth } from "@/auth";
import { exportAccount } from "@/lib/account";

/** Everything the server holds about the signed-in member, as a JSON download. Own data only. */
export async function GET(): Promise<Response> {
  const session = await auth();
  if (!session) return new Response("unauthorized", { status: 401 });
  const data = await exportAccount(session.user.id);
  if (!data) return new Response("not found", { status: 404 });
  const filename = `gitstats-${session.user.login}-${new Date().toISOString().slice(0, 10)}.json`;
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
