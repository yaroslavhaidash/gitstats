ALTER TABLE "users" ADD COLUMN "weekly_goal_metric" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "weekly_goal" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_record_week" date;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_record_month" date;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_record_streak" date;