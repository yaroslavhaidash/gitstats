import { fmtDateTime } from "@/lib/format";
import { MESSAGE_MAX, type Message, type PostResult } from "@/lib/messages";

const ERRORS: Record<Exclude<PostResult, "ok">, string> = {
  empty: "nothing to send: the message was empty",
  long: `too long: ${MESSAGE_MAX} characters at most`,
  limit: "that is 20 messages this hour; try again later",
};

/**
 * A member's thread with the maintainer, oldest first, and a reply box. Bodies are plain text: React
 * escapes them and links stay text. `me` is the side reading it, whose messages sit on the right.
 */
export function MessageThread({
  messages,
  me,
  them,
  action,
  userId,
  error,
}: {
  messages: Message[];
  me: "member" | "admin";
  them: string;
  action: (formData: FormData) => Promise<void>;
  userId?: number;
  error?: string;
}) {
  const problem = error && error in ERRORS ? ERRORS[error as keyof typeof ERRORS] : null;
  return (
    <div className="font-mono text-sm">
      {messages.length === 0 ? (
        <p className="panel px-4 py-3 text-xs text-dim mb-4">&gt; no messages yet</p>
      ) : (
        <ol className="grid gap-3 mb-6">
          {messages.map((m) => {
            const mine = m.fromAdmin === (me === "admin");
            return (
              <li key={m.id} className={`max-w-[85%] border-2 px-4 py-3 ${mine ? "justify-self-end border-dark" : "justify-self-start border-silver"}`}>
                <p className="text-xs text-faint mb-1">
                  {mine ? "you" : them} · {fmtDateTime(m.createdAt)}
                  {mine && m.readAt && " · read"}
                </p>
                <p className="whitespace-pre-wrap break-words text-white">{m.body}</p>
              </li>
            );
          })}
        </ol>
      )}
      <form action={action} className="grid gap-3">
        {userId !== undefined && <input type="hidden" name="id" value={userId} />}
        <textarea
          name="body"
          required
          maxLength={MESSAGE_MAX}
          rows={4}
          placeholder={me === "member" ? "feedback, a bug, a question…" : `reply to ${them}…`}
          className="bg-void border-2 border-dark focus:border-silver outline-none px-3 py-2 text-sm text-white"
        />
        {problem && <p className="text-xs text-alert">&gt; {problem}</p>}
        <button type="submit" className="btn-brutal justify-self-start cursor-pointer">SEND_</button>
      </form>
    </div>
  );
}
