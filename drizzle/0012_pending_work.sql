ALTER TABLE "daily_local" ADD COLUMN "pending_additions" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_local" ADD COLUMN "pending_deletions" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_local" ADD COLUMN "pending_commits" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "weekly_stats" ADD COLUMN "pending_additions" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "weekly_stats" ADD COLUMN "pending_deletions" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "weekly_stats" ADD COLUMN "pending_commits" integer DEFAULT 0 NOT NULL;