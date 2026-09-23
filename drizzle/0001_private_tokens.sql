ALTER TABLE "repos" ADD COLUMN "is_private" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "private_token" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "private_token_error" text;