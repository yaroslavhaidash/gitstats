CREATE TABLE "claude_daily" (
	"user_id" integer NOT NULL,
	"machine" text NOT NULL,
	"date" date NOT NULL,
	"model" text NOT NULL,
	"input_tokens" bigint DEFAULT 0 NOT NULL,
	"output_tokens" bigint DEFAULT 0 NOT NULL,
	"cache_read_tokens" bigint DEFAULT 0 NOT NULL,
	"cache_write_tokens" bigint DEFAULT 0 NOT NULL,
	"replies" integer DEFAULT 0 NOT NULL,
	"sessions" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "claude_daily_user_id_machine_date_model_pk" PRIMARY KEY("user_id","machine","date","model")
);
--> statement-breakpoint
ALTER TABLE "cli_tokens" ADD COLUMN "claude_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cli_tokens" ADD COLUMN "claude_version" text;--> statement-breakpoint
ALTER TABLE "claude_daily" ADD CONSTRAINT "claude_daily_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "claude_daily_user_date_idx" ON "claude_daily" USING btree ("user_id","date");