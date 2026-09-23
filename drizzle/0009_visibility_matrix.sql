ALTER TABLE "users" ADD COLUMN "repo_names_global" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "share_private_global" boolean DEFAULT false NOT NULL;