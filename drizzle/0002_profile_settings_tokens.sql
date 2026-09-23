CREATE TABLE "user_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"label" text NOT NULL,
	"token" text NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "profile_visibility" text DEFAULT 'crew' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "repo_names" text DEFAULT 'public_only' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "share_private" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "user_tokens" ADD CONSTRAINT "user_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;