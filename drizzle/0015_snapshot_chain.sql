ALTER TABLE "repos" ADD COLUMN "pushed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "repos" ADD COLUMN "stats_fetched_for" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "snapshot_runs" ADD COLUMN "users_pending" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "snapshot_runs" ADD COLUMN "chain_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_snapshot_at" timestamp with time zone;