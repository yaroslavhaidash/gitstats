ALTER TABLE "claude_daily" ADD COLUMN "effort_replies" integer[];--> statement-breakpoint
ALTER TABLE "claude_daily" ADD COLUMN "effort_output" bigint[];--> statement-breakpoint
ALTER TABLE "claude_daily" ADD COLUMN "tool_calls" integer;--> statement-breakpoint
ALTER TABLE "claude_daily" ADD COLUMN "subagent_tokens" bigint;--> statement-breakpoint
ALTER TABLE "claude_daily" ADD COLUMN "subagent_replies" integer;--> statement-breakpoint
ALTER TABLE "claude_daily" ADD COLUMN "reply_quarters" integer[];--> statement-breakpoint
ALTER TABLE "claude_daily" ADD COLUMN "messages" integer;