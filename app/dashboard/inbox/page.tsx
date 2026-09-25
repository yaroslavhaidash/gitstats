import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { MessageThread } from "@/components/MessageThread";
import { sendMessage } from "@/lib/actions";
import { markRead, thread } from "@/lib/messages";

/** Per request: it reads the session. */
export const instant = false;

/** The member's own thread with the maintainer. There is no id in the URL: it is always the session's. */
export default async function Inbox({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const session = await auth();
  if (!session) redirect("/");
  const { error } = await searchParams;
  await markRead(session.user.id, "member");
  const messages = await thread(session.user.id);
  return (
    <div className="max-w-3xl mx-auto">
      <div className="tag mb-4">INBOX</div>
      <h1 className="font-sans font-bold text-4xl mb-3">Messages.</h1>
      <p className="font-mono text-xs text-dim mb-8">
        &gt; between you and the person who runs gitstats. Feedback, bugs, questions: nobody else reads this, and there is no email, so check back here for the reply.
      </p>
      <MessageThread messages={messages} me="member" them="gitstats" action={sendMessage} error={error} />
    </div>
  );
}
