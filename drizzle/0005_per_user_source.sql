ALTER TABLE "users" ADD COLUMN "hash_salt" text;--> statement-breakpoint
ALTER TABLE "weekly_stats" ADD COLUMN "source" text DEFAULT 'github' NOT NULL;--> statement-breakpoint
ALTER TABLE "repos" DROP COLUMN "source";
