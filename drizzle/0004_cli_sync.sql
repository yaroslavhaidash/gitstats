CREATE TABLE "cli_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"token_hash" text NOT NULL,
	"machine" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_sync_at" timestamp with time zone,
	"last_sync_repos" integer,
	"last_sync_error" text,
	CONSTRAINT "cli_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "device_codes" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"poll_secret" text NOT NULL,
	"machine" text NOT NULL,
	"user_id" integer,
	"issued_token" text,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "device_codes_code_unique" UNIQUE("code"),
	CONSTRAINT "device_codes_poll_secret_unique" UNIQUE("poll_secret")
);
--> statement-breakpoint
ALTER TABLE "repos" ADD COLUMN "source" text DEFAULT 'github' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "github_id" integer;--> statement-breakpoint
ALTER TABLE "cli_tokens" ADD CONSTRAINT "cli_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_codes" ADD CONSTRAINT "device_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;