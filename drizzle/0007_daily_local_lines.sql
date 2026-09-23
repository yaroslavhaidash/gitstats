ALTER TABLE "daily_local" ADD COLUMN "additions" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_local" ADD COLUMN "deletions" integer DEFAULT 0 NOT NULL;