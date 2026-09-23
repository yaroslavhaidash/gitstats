ALTER TABLE "snapshot_runs" ADD COLUMN "kind" text DEFAULT 'nightly' NOT NULL;--> statement-breakpoint
ALTER TABLE "snapshot_runs" ADD COLUMN "quota_remaining" integer;